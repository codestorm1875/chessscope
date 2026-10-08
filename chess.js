// Small dependency-free chess rules module. Squares are indexed a8=0 through h1=63.
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const files = 'abcdefgh';
const opponent = c => c === 'w' ? 'b' : 'w';
const color = p => p === '.' ? null : p === p.toUpperCase() ? 'w' : 'b';
const rank = i => 8 - Math.floor(i / 8);
const file = i => i % 8;
export const square = i => files[file(i)] + rank(i);
export const index = s => s && /^[a-h][1-8]$/.test(s) ? (8 - Number(s[1])) * 8 + files.indexOf(s[0]) : -1;

export function fromFen(fen = START_FEN) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw Error('Invalid FEN');
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw Error('Invalid FEN board');
  const board = [];
  for (const row of rows) {
    for (const char of row) {
      if (/^[1-8]$/.test(char)) board.push(...Array(Number(char)).fill('.'));
      else if (/^[prnbqkPRNBQK]$/.test(char)) board.push(char);
      else throw Error('Invalid FEN piece');
    }
  }
  if (board.length !== 64 || !['w', 'b'].includes(parts[1])) throw Error('Invalid FEN board');
  return { board, turn: parts[1], castling: parts[2], ep: parts[3], halfmove: Number(parts[4] || 0), fullmove: Number(parts[5] || 1) };
}

export function toFen(s) {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let row = '', blank = 0;
    for (let x = 0; x < 8; x++) {
      const p = s.board[y * 8 + x];
      if (p === '.') blank++;
      else { if (blank) row += blank; blank = 0; row += p; }
    }
    if (blank) row += blank;
    rows.push(row);
  }
  return `${rows.join('/')} ${s.turn} ${s.castling || '-'} ${s.ep} ${s.halfmove} ${s.fullmove}`;
}

function attacked(s, target, by) {
  const b = s.board, tx = file(target), ty = Math.floor(target / 8);
  const pawnY = ty + (by === 'w' ? 1 : -1);
  for (const dx of [-1, 1]) {
    const x = tx + dx;
    if (x >= 0 && x < 8 && pawnY >= 0 && pawnY < 8 && b[pawnY * 8 + x] === (by === 'w' ? 'P' : 'p')) return true;
  }
  for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) {
    const x = tx + dx, y = ty + dy;
    if (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === (by === 'w' ? 'N' : 'n')) return true;
  }
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let x = tx + dx, y = ty + dy, distance = 1;
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      const p = b[y * 8 + x];
      if (p !== '.') {
        if (color(p) === by) {
          const t = p.toLowerCase();
          if (t === 'q' || (distance === 1 && t === 'k') || (dx * dy === 0 ? t === 'r' : t === 'b')) return true;
        }
        break;
      }
      x += dx; y += dy; distance++;
    }
  }
  return false;
}

export function isSquareAttacked(s, target, by) { return attacked(s, target, by); }

export function inCheck(s, side = s.turn) {
  const king = s.board.indexOf(side === 'w' ? 'K' : 'k');
  return king < 0 || attacked(s, king, opponent(side));
}

function pseudo(s) {
  const moves = [], b = s.board, side = s.turn;
  const add = (from, to, extra = {}) => {
    if (to < 0 || to >= 64 || color(b[to]) === side || b[to].toLowerCase() === 'k') return;
    const base = { from, to, piece: b[from], captured: b[to] === '.' ? null : b[to], ...extra };
    if (b[from].toLowerCase() === 'p' && (Math.floor(to / 8) === 0 || Math.floor(to / 8) === 7)) {
      for (const p of ['q', 'r', 'b', 'n']) moves.push({ ...base, promotion: side === 'w' ? p.toUpperCase() : p });
    } else moves.push(base);
  };
  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (color(p) !== side) continue;
    const x = file(from), y = Math.floor(from / 8), t = p.toLowerCase();
    if (t === 'p') {
      const d = side === 'w' ? -1 : 1, ny = y + d;
      if (ny >= 0 && ny < 8) {
        const one = ny * 8 + x;
        if (b[one] === '.') {
          add(from, one);
          if (y === (side === 'w' ? 6 : 1) && b[(y + 2 * d) * 8 + x] === '.') add(from, (y + 2 * d) * 8 + x);
        }
        for (const dx of [-1, 1]) {
          if (x + dx < 0 || x + dx > 7) continue;
          const to = ny * 8 + x + dx;
          if (b[to] !== '.' && color(b[to]) !== side) add(from, to);
          else if (s.ep !== '-' && index(s.ep) === to) add(from, to, { captured: side === 'w' ? 'p' : 'P', enPassant: true });
        }
      }
    } else if (t === 'n' || t === 'k') {
      const dirs = t === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for (const [dx, dy] of dirs) if (x + dx >= 0 && x + dx < 8 && y + dy >= 0 && y + dy < 8) add(from, (y + dy) * 8 + x + dx);
      if (t === 'k' && !inCheck(s, side)) {
        const enemy = opponent(side), back = side === 'w' ? 7 : 0;
        if (y === back && x === 4) {
          if (s.castling.includes(side === 'w' ? 'K' : 'k') && b[back*8+7] === (side === 'w' ? 'R' : 'r') && b[back*8+5] === '.' && b[back*8+6] === '.' && !attacked(s,back*8+5,enemy) && !attacked(s,back*8+6,enemy)) add(from,back*8+6,{castle:'king'});
          if (s.castling.includes(side === 'w' ? 'Q' : 'q') && b[back*8] === (side === 'w' ? 'R' : 'r') && b[back*8+1] === '.' && b[back*8+2] === '.' && b[back*8+3] === '.' && !attacked(s,back*8+3,enemy) && !attacked(s,back*8+2,enemy)) add(from,back*8+2,{castle:'queen'});
        }
      }
    } else {
      const dirs = t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx,dy] of dirs) {
        let nx = x + dx, ny = y + dy;
        while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
          const to = ny*8+nx;
          add(from,to);
          if (b[to] !== '.') break;
          nx += dx; ny += dy;
        }
      }
    }
  }
  return moves;
}

export function play(s, m) {
  const b = [...s.board], side = s.turn, p = b[m.from];
  b[m.from] = '.';
  if (m.enPassant) b[m.to + (side === 'w' ? 8 : -8)] = '.';
  b[m.to] = m.promotion || p;
  if (m.castle) {
    const back = side === 'w' ? 7 : 0, rookFrom = back*8+(m.castle === 'king' ? 7 : 0), rookTo = back*8+(m.castle === 'king' ? 5 : 3);
    b[rookTo] = b[rookFrom]; b[rookFrom] = '.';
  }
  let castling = s.castling;
  if (p === 'K') castling = castling.replace(/[KQ]/g,'');
  if (p === 'k') castling = castling.replace(/[kq]/g,'');
  for (const [sq, flag] of [[0,'q'],[7,'k'],[56,'Q'],[63,'K']]) if (m.from === sq || m.to === sq) castling = castling.replace(flag,'');
  const ep = p.toLowerCase() === 'p' && Math.abs(m.to-m.from) === 16 ? square((m.to+m.from)/2) : '-';
  return { board:b, turn:opponent(side), castling:castling || '-', ep, halfmove:p.toLowerCase()==='p'||m.captured?0:s.halfmove+1, fullmove:s.fullmove+(side==='b'?1:0) };
}

export function legalMoves(s) { return pseudo(s).filter(m => !inCheck(play(s,m),s.turn)); }

export function san(s,m,moves=legalMoves(s)) {
  if (m.castle) return m.castle === 'king' ? 'O-O' : 'O-O-O';
  const p = m.piece.toUpperCase(), peers = moves.filter(n => n.to === m.to && n.piece === m.piece && n.from !== m.from);
  let disambiguation = '';
  if (peers.length) {
    if (!peers.some(n => file(n.from) === file(m.from))) disambiguation = files[file(m.from)];
    else if (!peers.some(n => rank(n.from) === rank(m.from))) disambiguation = String(rank(m.from));
    else disambiguation = square(m.from);
  }
  const capture = m.captured ? 'x' : '';
  const name = p === 'P' ? (capture ? files[file(m.from)] : '') : p + disambiguation;
  const next = play(s,m);
  const check = inCheck(next) ? (legalMoves(next).length ? '+' : '#') : '';
  return name + capture + square(m.to) + (m.promotion ? '='+m.promotion.toUpperCase() : '') + check;
}

export function parsePgn(pgn) {
  if (!pgn || !pgn.trim()) throw Error('Paste a PGN to begin.');
  const headers = {};
  for (const match of pgn.matchAll(/^\s*\[([^\s]+)\s+"((?:\\.|[^"])*)"\s*\]/gm)) headers[match[1]] = match[2].replace(/\\"/g,'"');
  let body = pgn.replace(/^\s*\[[^\n]*\]\s*$/gm,' ');
  body = body.replace(/;[^\n]*/g,' ');
  let clean = '', brace = 0, variation = 0, comment = '';
  const clocks = [];
  for (const ch of body) {
    if (ch === '{') { if (!brace) comment = ''; brace++; }
    else if (ch === '}') {
      brace = Math.max(0,brace-1);
      if (!brace && !variation) {
        const clock = comment.match(/\[%clk\s+([0-9:.]+)\]/i)?.[1];
        // Numeric placeholder: the raw clock (e.g. 0:09:59.9) contains dots that
        // the move-number stripper below would mangle, so stash it aside.
        if (clock) { clocks.push(clock); clean += ` __CLK${clocks.length-1}__ `; }
      }
    }
    else if (brace) comment += ch;
    else if (!brace && ch === '(') variation++;
    else if (!brace && ch === ')') variation = Math.max(0,variation-1);
    else if (!brace && !variation) clean += ch;
  }
  const tokens = clean.replace(/\$\d+/g,' ').replace(/\d+\.(?:\.\.)?/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  let state = fromFen(headers.FEN || START_FEN);
  const initialFen = toFen(state), moves = [];
  for (const raw of tokens) {
    const clockSlot = raw.match(/^__CLK(\d+)__$/);
    if (clockSlot) {
      const stamp = clocks[Number(clockSlot[1])];
      if (stamp && moves.length) moves.at(-1).clock = stamp;
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) break;
    const target = raw.replace(/[!?]+/g,'').replace(/0/g,'O').replace(/[+#]+$/g,'');
    if (!target) continue;
    const choices = legalMoves(state);
    const move = choices.find(m => san(state,m,choices).replace(/[+#]+$/g,'') === target || square(m.from)+square(m.to)+(m.promotion?.toLowerCase()||'') === target);
    if (!move) throw Error(`Could not read move ${moves.length+1}: ${raw}. Check the PGN for a typo or unsupported notation.`);
    const notation = san(state,move,choices), beforeFen = toFen(state);
    state = play(state,move);
    moves.push({ ply:moves.length+1, san:notation, uci:square(move.from)+square(move.to)+(move.promotion?.toLowerCase()||''), from:square(move.from), to:square(move.to), piece:move.piece.toUpperCase(), captured:move.captured?.toUpperCase()||null, promotion:move.promotion?.toUpperCase()||null, beforeFen, fen:toFen(state), color:move.piece===move.piece.toUpperCase()?'w':'b', moveNumber:Math.ceil((moves.length+1)/2) });
  }
  if (!moves.length) throw Error('No playable moves found in this PGN.');
  return { headers, initialFen, moves, finalFen:toFen(state) };
}
