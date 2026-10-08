import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parsePgn, fromFen, index, isSquareAttacked, legalMoves, play, san, square, toFen } from './chess.js';

const root = path.dirname(fileURLToPath(import.meta.url));
// Tiny .env loader (no dependencies): KEY=VALUE lines, # comments, real env wins.
try {
  const envFile = path.join(root, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const cut = trimmed.indexOf('=');
      if (cut < 1) continue;
      const key = trimmed.slice(0, cut).trim(), value = trimmed.slice(cut + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
} catch {}
const port = Number(process.env.PORT || 3000);
const enginePath = process.env.STOCKFISH_PATH || '/usr/local/bin/stockfish';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.png':'image/png' };

export class Engine {
  constructor() {
    this.process = spawn(enginePath, [], { stdio:['pipe','pipe','pipe'] });
    this.lines = [];
    this.waiters = [];
    this.buffer = '';
    this.process.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      let end;
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0,end).trim();
        this.buffer = this.buffer.slice(end+1);
        if (this.waiters.length) this.waiters.shift()(line);
        else this.lines.push(line);
      }
    });
    this.process.on('error', error => { this.error = error; this.waiters.splice(0).forEach(resolve => resolve(null)); });
    this.process.on('exit', () => { this.closed = true; this.waiters.splice(0).forEach(resolve => resolve(null)); });
  }
  write(s) { if (this.error || this.closed) throw Error(`Stockfish is unavailable at ${enginePath}. Set STOCKFISH_PATH to your engine binary.`); this.process.stdin.write(s+'\n'); }
  nextLine(timeout) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    return new Promise(resolve => {
      const waiter = line => { clearTimeout(timer); resolve(line); };
      const timer = setTimeout(() => { this.waiters = this.waiters.filter(item => item !== waiter); resolve(null); },timeout);
      this.waiters.push(waiter);
    });
  }
  async until(test, timeout=30000) {
    const deadline = Date.now()+timeout;
    while (Date.now()<deadline) {
      const line = await this.nextLine(Math.max(1,deadline-Date.now()));
      if (line === null) throw Error(this.error?.message || 'Stockfish stopped responding.');
      if (test(line)) return line;
    }
    throw Error('Stockfish timed out.');
  }
  async start({elo=null}={}) {
    if (this.error) throw this.error;
    this.write('uci');
    await this.until(line => line === 'uciok');
    this.write(`setoption name Threads value ${elo === null ? 2 : 1}`);
    this.write(`setoption name Hash value ${elo === null ? 64 : 32}`);
    this.write(`setoption name MultiPV value ${elo === null ? 2 : 1}`);
    if (elo !== null) {
      this.write('setoption name UCI_LimitStrength value true');
      this.write(`setoption name UCI_Elo value ${elo}`);
    }
    this.write('isready');
    await this.until(line => line === 'readyok');
  }
  async evaluate(fen, depth) {
    this.write(`position fen ${fen}`);
    this.write(`go depth ${depth}`);
    const turn = fen.split(' ')[1];
    const variations = new Map();
    let best = null;
    await this.until(line => {
      if (line.startsWith('info ') && line.includes(' score ')) {
        const d = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
        const multiPv = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
        const cp = line.match(/\bscore cp (-?\d+)/), m = line.match(/\bscore mate (-?\d+)/);
        if (d >= (variations.get(multiPv)?.depth || 0) && (cp || m)) {
          variations.set(multiPv, {
            depth:d,
            cp:cp ? Number(cp[1]) * (turn === 'w' ? 1 : -1) : null,
            mate:m ? Number(m[1]) * (turn === 'w' ? 1 : -1) : null,
            pv:line.match(/\bpv (.+)$/)?.[1]?.split(' ') || []
          });
        }
      }
      if (line.startsWith('bestmove ')) { best = line.split(' ')[1]; return true; }
      return false;
    },120000);
    const primary = variations.get(1) || { cp:0, mate:null, pv:[], depth:0 };
    const second = variations.get(2) || null;
    let state = fromFen(fen);
    const line = [];
    for (const uci of primary.pv.slice(0,6)) {
      const moves = legalMoves(state);
      const move = moves.find(m => square(m.from)+square(m.to)+(m.promotion?.toLowerCase()||'') === uci);
      if (!move) break;
      line.push(san(state,move,moves));
      state = play(state,move);
    }
    return { cp:primary.cp, mate:primary.mate, pv:primary.pv, line, best, depth:primary.depth,
      second:second && second.depth === primary.depth ? { cp:second.cp, mate:second.mate, best:second.pv[0] } : null };
  }
  async chooseMove(fen, thinkMs=600) {
    this.write(`position fen ${fen}`);
    this.write(`go movetime ${Math.max(100,Math.min(5000,thinkMs))}`);
    const line = await this.until(item=>item.startsWith('bestmove '),15000);
    return line.split(' ')[1];
  }
  close() { try { this.process.stdin.write('quit\n'); this.process.kill(); } catch {} }
}

function winningChance(e, color) {
  const cp = e.mate !== null ? (e.mate > 0 ? 1500 : -1500) : e.cp;
  return 100 / (1 + Math.exp(-(color === 'w' ? cp : -cp)/130));
}
export function classify(move, before, after) {
  const isBest = before.best === move.uci;
  const loss = isBest ? 0 : Math.max(0, winningChance(before,move.color)-winningChance(after,move.color));
  let label = 'good';
  if (loss >= 30) label = 'blunder';
  else if (loss >= 16) label = 'mistake';
  else if (loss >= 7) label = 'inaccuracy';
  else if (isBest) label = 'best';
  else if (loss < 2) label = 'excellent';
  if (isBest && before.second && winningChance(before,move.color)-winningChance(before.second,move.color) >= 12) label = 'great';
  const values = { P:1,N:3,B:3,R:5,Q:9,K:0 };
  const reply = after.best;
  const replyPiece = reply && /^[a-h][1-8][a-h][1-8]/.test(reply) ? fromFen(move.fen).board[(8-Number(reply[1]))*8+'abcdefgh'.indexOf(reply[0])]?.toUpperCase() : null;
  const sacrifice = isBest && ['N','B','R','Q'].includes(move.piece)
    && reply?.slice(2,4) === move.to && replyPiece
    && values[replyPiece] < values[move.piece]
    && (!move.captured || values[move.piece] > values[move.captured]+1);
  // A conservative heuristic: Stockfish prefers offering a higher-value piece
  // to an immediately available lower-value capture, while staying sound.
  if (sacrifice && move.ply > 12 && loss < 2 && winningChance(after,move.color) > 38) label = 'brilliant';
  const freePiece = Boolean(move.captured && values[move.captured] >= 2 &&
    !isSquareAttacked(fromFen(move.beforeFen), index(move.to), move.color === 'w' ? 'b' : 'w'));
  return { label, loss:Math.round(loss*10)/10, isBest, freePiece };
}
function bestSan(fen, uci) {
  if (!uci || uci === '(none)') return null;
  const state = fromFen(fen), moves = legalMoves(state);
  const move = moves.find(m => square(m.from)+square(m.to)+(m.promotion?.toLowerCase()||'') === uci);
  return move ? { from:square(move.from), to:square(move.to), uci, san:san(state,move,moves) } : null;
}

export async function analyze(req,res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) { res.writeHead(413); res.end('PGN is too large'); return; }
  }
  let game;
  try { game = parsePgn(JSON.parse(body).pgn); }
  catch (error) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:error.message})); return; }
  res.writeHead(200, {'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  const send = item => { if (!res.destroyed) res.write(JSON.stringify(item)+'\n'); };
  send({ type:'game', game });
  let engine;
  try {
    engine = new Engine();
    await engine.start();
    let before = await engine.evaluate(game.initialFen,11);
    send({ type:'initial', evaluation:before });
    for (const move of game.moves) {
      if (res.destroyed) break;
      const after = await engine.evaluate(move.fen,11);
      send({ type:'move', ply:move.ply, evaluation:after, classification:classify(move,before,after), bestMove:bestSan(move.beforeFen,before.best) });
      before = after;
    }
    send({ type:'complete' });
  } catch (error) { send({ type:'error', error:error.message }); }
  finally { engine?.close(); res.end(); }
}

async function requestJson(req) {
  let body='';
  for await (const chunk of req) {
    body+=chunk;
    if (body.length>100_000) throw Error('Request is too large.');
  }
  return JSON.parse(body);
}
function json(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function validPosition(fen) {
  if (typeof fen !== 'string' || fen.length>150) throw Error('Invalid board position.');
  const state=fromFen(fen);
  if (state.board.filter(p=>p==='K').length!==1 || state.board.filter(p=>p==='k').length!==1) throw Error('The position needs both kings.');
  return state;
}
export async function engineMove(req,res) {
  let engine;
  try {
    const body=await requestJson(req), state=validPosition(body.fen);
    const choices=legalMoves(state);
    if (!choices.length) return json(res,409,{error:'The game is over. Start a new game to keep playing.'});
    const rating=Math.max(1320,Math.min(3190,Math.round(Number(body.rating)||1500)));
    engine=new Engine();
    await engine.start({elo:rating});
    const uci=await engine.chooseMove(body.fen,Math.max(350,Math.min(1500,Number(body.thinkMs)||650)));
    const move=choices.find(item=>square(item.from)+square(item.to)+(item.promotion?.toLowerCase()||'')===uci);
    if (!move) throw Error('Stockfish returned an illegal move.');
    const next=play(state,move);
    json(res,200,{uci,san:san(state,move,choices),from:square(move.from),to:square(move.to),afterFen:toFen(next),rating});
  } catch(error) { json(res,400,{error:error.message}); }
  finally { engine?.close(); }
}
export async function coachHint(req,res) {
  let engine;
  try {
    const body=await requestJson(req), state=validPosition(body.fen);
    if (!legalMoves(state).length) return json(res,409,{error:'There are no legal moves in this position.'});
    engine=new Engine();
    await engine.start();
    const evaluation=await engine.evaluate(body.fen,12);
    json(res,200,{bestMove:bestSan(body.fen,evaluation.best),evaluation});
  } catch(error) { json(res,400,{error:error.message}); }
  finally { engine?.close(); }
}

export async function liveEval(req,res) {
  let engine;
  try {
    const body=await requestJson(req);
    validPosition(body.fen);
    engine=new Engine();
    await engine.start();
    const evaluation=await engine.evaluate(body.fen,9);
    json(res,200,{evaluation:{cp:evaluation.cp,mate:evaluation.mate,depth:evaluation.depth}});
  } catch(error) { json(res,400,{error:error.message}); }
  finally { engine?.close(); }
}
export const server = http.createServer(async (req,res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') return analyze(req,res);
  if (req.method === 'POST' && req.url === '/api/engine-move') return engineMove(req,res);
  if (req.method === 'POST' && req.url === '/api/coach-hint') return coachHint(req,res);
  if (req.method === 'POST' && req.url === '/api/live-eval') return liveEval(req,res);
  if (req.url?.startsWith('/api/')) return json(res,req.method==='POST'?404:405,{error:'This API route is unavailable. Restart the Chessscope server and refresh the page.'});
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/') pathname = '/index.html';
  if (!['/index.html','/style.css','/app.js','/chess.js','/openings.js','/tactics.js','/training.js','/favicon.svg'].includes(pathname)
    && !/^\/assets\/pieces\/[wb][KQRBNP]\.png$/.test(pathname)
    && !/^\/assets\/flat-pieces\/[wb][KQRBNP]\.svg$/.test(pathname)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(path.join(root,pathname));
    res.writeHead(200, {'Content-Type':mime[path.extname(pathname)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`Chess Analyzer running at http://localhost:${port}`));
}
