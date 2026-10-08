import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parsePgn, fromFen, toFen, legalMoves, START_FEN } from './chess.js';
import { classify, server, engineMove, liveEval } from './server.js';
import { openings, identifyOpening, identifyCurated } from './openings.js';
import { ECO_POSITIONS } from './eco-book.js';
import { puzzles } from './tactics.js';
import { Readable } from 'node:stream';

test('parses a complete game with captures, castling, checks, and mate', () => {
  const game = parsePgn(`[Event "The Opera Game"]\n[White "Paul Morphy"]\n[Black "Duke & Count"]\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`);
  assert.equal(game.moves.length,33);
  assert.equal(game.moves[23].san,'Rd8');
  assert.equal(game.moves.at(-1).san,'Rd8#');
  assert.equal(game.headers.White,'Paul Morphy');
  assert.equal(game.finalFen.split(' ')[1],'b');
});

test('ignores comments, variations, and annotations', () => {
  const game = parsePgn('1. e4! {King pawn} (1. d4 d5) e5 $1 2. Nf3 Nc6 1-0');
  assert.deepEqual(game.moves.map(m=>m.san),['e4','e5','Nf3','Nc6']);
});

test('preserves PGN player names and move clocks', () => {
  const game=parsePgn('[White "Ada"]\n[Black "Grace"]\n[Result "1-0"]\n1. e4 {[%clk 0:05:00]} e5 {[%clk 0:04:58]} 2. Nf3 1-0');
  assert.equal(game.headers.White,'Ada');
  assert.equal(game.headers.Black,'Grace');
  assert.deepEqual(game.moves.map(move=>move.clock),['0:05:00','0:04:58',undefined]);
});

test('keeps Chess.com clocks with tenths of a second', () => {
  const game=parsePgn('1. e4 {[%clk 0:09:59.9]} e5 {[%clk 0:09:58.2]} 2. Nf3 {[%clk 0:09:55.0]} Nc6 1-0');
  assert.deepEqual(game.moves.map(m=>m.san),['e4','e5','Nf3','Nc6']);
  assert.deepEqual(game.moves.map(move=>move.clock),['0:09:59.9','0:09:58.2','0:09:55.0',undefined]);
});

test('opening lines and tactics answers are legal', () => {
  assert.equal(openings.length,21);
  for(const opening of openings) {
    assert.equal(identifyCurated(opening.moves)?.id,opening.id);
    assert.ok(opening.moves.length>=opening.keyPly);
  }
  const fourKnights = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bb5');
  assert.equal(identifyOpening(fourKnights.moves)?.name,'Four Knights Game');
  assert.equal(identifyOpening(fourKnights.moves)?.variation,'Spanish Variation');
  for(const puzzle of puzzles) {
    const moves=legalMoves(fromFen(puzzle.fen));
    assert.ok(moves.some(move=>`${'abcdefgh'[move.from%8]}${8-Math.floor(move.from/8)}${'abcdefgh'[move.to%8]}${8-Math.floor(move.to/8)}${move.promotion?.toLowerCase()||''}`===puzzle.solution),puzzle.theme);
  }
});

test('ECO book names deep lines and long games', () => {
  assert.ok(ECO_POSITIONS.length>3000);
  const najdorf = parsePgn('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
  assert.equal(identifyOpening(najdorf.moves)?.name,'Sicilian Defense');
  assert.match(identifyOpening(najdorf.moves)?.variation,/Najdorf/);
  const scholar = parsePgn('[White "You"]\n[Black "Me"]\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
  assert.notEqual(identifyOpening(scholar.moves)?.name,'Irregular Opening');
  const long = parsePgn('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Nbd7 9. Qd2 b5 10. O-O-O Nb6 11. Bxb6 Qxb6 12. f4 exf4 13. Nd5 Nxd5 14. exd5 Bf5 15. Bd3 Bxd3 16. Qxd3 Be7 17. Rhf1 O-O');
  assert.match(identifyOpening(long.moves)?.variation,/Najdorf/);
});

test('play endpoint returns a legal move from the installed engine', async () => {
  const request=Readable.from([JSON.stringify({fen:START_FEN,rating:1500})]);
  const response={writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};
  await engineMove(request,response);
  assert.equal(response.status,200);
  assert.equal(response.body.rating,1500);
  assert.ok(legalMoves(fromFen(START_FEN)).some(move=>`${'abcdefgh'[move.from%8]}${8-Math.floor(move.from/8)}${'abcdefgh'[move.to%8]}${8-Math.floor(move.to/8)}${move.promotion?.toLowerCase()||''}`===response.body.uci));
});

test('live eval returns a fast numeric reading for the play board', async () => {
  const request=Readable.from([JSON.stringify({fen:START_FEN})]);
  const response={writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};
  await liveEval(request,response);
  assert.equal(response.status,200);
  assert.equal(typeof response.body.evaluation.cp,'number');
  assert.ok(response.body.evaluation.depth>=9);
});

test('handles promotions from a custom starting position', () => {
  const game = parsePgn('[SetUp "1"]\n[FEN "k7/4P3/8/8/8/8/8/7K w - - 0 1"]\n1. e8=Q+');
  assert.equal(game.moves[0].uci,'e7e8q');
  assert.equal(game.moves[0].fen.split(' ')[0],'k3Q3/8/8/8/8/8/8/7K');
});

test('keeps legal starting moves and FEN round trip consistent', () => {
  const state = fromFen(START_FEN);
  assert.equal(legalMoves(state).length,20);
  assert.equal(toFen(state),START_FEN);
});

test('reports the first invalid move clearly', () => {
  assert.throws(()=>parsePgn('1. e4 e5 2. Qh5 Qz6'),/move 4: Qz6/);
});

test('marks a critical best move as great using the second engine choice', () => {
  const move=parsePgn('1. e4').moves[0];
  const result=classify(move,
    { best:'e2e4', cp:200, mate:null, second:{ cp:-200, mate:null } },
    { best:'e7e5', cp:200, mate:null });
  assert.equal(result.label,'great');
});

test('recognizes a captured unprotected piece', () => {
  const move=parsePgn('[FEN "4k3/8/8/8/8/8/4n3/4R2K w - - 0 1"]\n1. Rxe2').moves[0];
  const result=classify(move,
    { best:'e1e2', cp:100, mate:null, second:null },
    { best:'e8d7', cp:100, mate:null });
  assert.equal(result.freePiece,true);
});

test('serves the rendered wood pieces and bundled sound code', async () => {
  async function get(url) {
    return new Promise(resolve => {
      const response={
        writeHead(status, headers){this.status=status;this.headers=headers},
        end(data){resolve({status:this.status,headers:this.headers,data})}
      };
      server.emit('request',{method:'GET',url},response);
    });
  }
  const image=await get('/assets/pieces/wK.png');
  assert.equal(image.status,200);
  assert.equal(image.headers['Content-Type'],'image/png');
  assert.equal(image.data.subarray(1,4).toString(),'PNG');
  const sound=await get('/app.js?v=classic4');
  assert.equal(sound.status,200);
  assert.match(sound.data.toString(),/kind==='great'/);
  const styles=await get('/style.css?v=classic4');
  assert.equal(styles.status,200);
  assert.match(styles.data.toString(),/Carved wooden board/);
  assert.equal(styles.headers['Cache-Control'],'no-store');
});

test('unknown API requests return a JSON error', async () => {
  const response=await new Promise(resolve=>{
    const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body){resolve({status:this.status,headers:this.headers,body})}};
    server.emit('request',{method:'POST',url:'/api/unknown'},res);
  });
  assert.equal(response.status,404);
  assert.match(response.headers['Content-Type'],/application\/json/);
  assert.match(JSON.parse(response.body).error,/Restart/);
});

test('sidebar navigation opens the play and study pages', async () => {
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  const source=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(source);
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)){
      const classes=new Set(id==='play-view'||id==='study-view'?['hidden']:[]);
      elements.set(id,{textContent:'',handlers:{},classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name)},contains(name){return classes.has(name)}},addEventListener(name,handler){this.handlers[name]=handler}});
    }
    return elements.get(id);
  };
  const window={scrollTo(){}};
  vm.runInNewContext(source,{window,document:{getElementById:element,querySelector:element}});
  for(const id of ['board','play-board','opening-board','tactic-board']) assert.equal((element(id).innerHTML.match(/data-square=/g)||[]).length,64,id);
  element('nav-play').handlers.click();
  assert.equal(element('play-view').classList.contains('hidden'),false);
  assert.equal(element('analysis-view').classList.contains('hidden'),true);
  element('nav-study').handlers.click();
  assert.equal(element('study-view').classList.contains('hidden'),false);
  assert.equal(element('play-view').classList.contains('hidden'),true);
  assert.equal(element('current-page-name').textContent,'Opening & tactics lab');
});

test('renders all 64 squares and 32 pieces before analysis responds', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{
      innerHTML:'', textContent:'', value:'', style:{}, disabled:false, handlers:{},
      classList:{toggle(){},add(){},remove(){}},
      addEventListener(type,handler){this.handlers[type]=handler}, setAttribute(){}, querySelectorAll(){return []},
      showModal(){this.open=true},focus(){}
    });
    return elements.get(id);
  };
  const app = await readFile(new URL('./app.js',import.meta.url),'utf8');
  const browser={addEventListener(){}};
  let fetches=0;
  vm.runInNewContext(app,{
    document:{getElementById:element,querySelector(){return element('board-container')},querySelectorAll(){return []},addEventListener(){}},
    window:browser, localStorage:{getItem(){return null}},
    fetch(){fetches++;return new Promise(()=>{})},
    AbortController, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval
  });
  const board=element('board').innerHTML;
  assert.equal((board.match(/class="square /g)||[]).length,64);
  assert.equal((board.match(/class="piece-img"/g)||[]).length,32);
  assert.ok(board.includes('data:image/svg+xml;base64,'),'the flat piece sprites are embedded');
  for(const id of ['play-board','opening-board','tactic-board']) assert.equal((element(id).innerHTML.match(/data-square=/g)||[]).length,64,id);
  assert.equal(browser.chessscopeTrainingReady,true);
  assert.equal(fetches,0,'no demonstration PGN is analyzed on startup');
  assert.equal(element('sidebar-game').textContent,'No game loaded');
  element('nav-analysis').handlers.click();
  assert.equal(element('import-dialog').open,true);
});

test('dragging a move reports an old server response clearly', async () => {
  const app=await readFile(new URL('./app.js',import.meta.url),'utf8');
  const elements=new Map(),documentHandlers={};
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      innerHTML:'',textContent:'',value:id==='elo-range'?'1500':'',style:{},handlers:{},classList:{toggle(){},add(){},remove(){}},
      addEventListener(type,handler){this.handlers[type]=handler},setAttribute(){},querySelectorAll(){return []},querySelector(){return null},contains(){return true}
    });
    return elements.get(id);
  };
  const cell=square=>({dataset:{square},classList:{add(){},remove(){}},getBoundingClientRect(){return {width:70}},querySelector(){return {outerHTML:'<img>'}}});
  const from=cell('e2'),to=cell('e4');
  let engineRequests=0, evalRequests=0;
  vm.runInNewContext(app,{
    document:{getElementById:element,querySelector(){return element('container')},querySelectorAll(){return []},addEventListener(type,handler){(documentHandlers[type]??=[]).push(handler)},elementFromPoint(){return {closest(){return to}}},createElement(){return {style:{},remove(){}}},body:{appendChild(){}}},
    window:{addEventListener(){}},localStorage:{getItem(){return null}},
    fetch(url,options){if(url==='/api/analyze')return new Promise(()=>{});if(url==='/api/live-eval'){evalRequests++;return Promise.resolve({ok:true,text:async()=>JSON.stringify({evaluation:{cp:20,mate:null,depth:9}})});}engineRequests++;return Promise.resolve({ok:false,status:405,text:async()=>''})},
    AbortController,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval
  });
  element('start-game').handlers.click();
  element('play-board').handlers.pointerdown({button:0,pointerId:1,clientX:30,clientY:30,target:{closest(){return from}}});
  for(const handler of documentHandlers.pointermove)handler({pointerId:1,clientX:55,clientY:55,preventDefault(){}});
  for(const handler of documentHandlers.pointerup)handler({type:'pointerup',pointerId:1,clientX:55,clientY:55});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(engineRequests,1);
  assert.ok(evalRequests>=1,'the play board refreshes its live eval bar');
  assert.match(element('play-status').textContent,/older Chessscope version/);
});
