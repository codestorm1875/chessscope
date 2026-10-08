import { START_FEN, fromFen, toFen, legalMoves, play, san, square, index, inCheck } from './chess.js';
import { openings, identifyOpening, openingFallback } from './openings.js';
import { puzzles } from './tactics.js';

const $=id=>document.getElementById(id);
const files='abcdefgh';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sideOf=piece=>piece==='.'?null:piece===piece.toUpperCase()?'w':'b';
const uciOf=move=>square(move.from)+square(move.to)+(move.promotion?.toLowerCase()||'');
async function apiJson(response) {
  const raw=await response.text();
  let data;
  try { data=raw?JSON.parse(raw):null; } catch { data=null; }
  if(!response.ok) {
    if(response.status===404||response.status===405)throw Error('This server is running an older Chessscope version. Restart npm start, then refresh the page.');
    throw Error(data?.error||`Stockfish request failed (${response.status}).`);
  }
  if(!data)throw Error('Stockfish returned an empty response. Restart the Chessscope server and try again.');
  return data;
}

function renderTrainingBoard(id,state,{flipped=false,selected=null,last=null}={}) {
  const legal=selected?legalMoves(state).filter(move=>square(move.from)===selected):[];
  const targets=new Set(legal.map(move=>square(move.to)));
  const mated=inCheck(state)&&legalMoves(state).length===0;
  const chk=mated||inCheck(state)?state.board.indexOf(state.turn==='w'?'K':'k'):-1;
  const winner=mated?state.board.indexOf(state.turn==='w'?'k':'K'):-1;
  const order=[...Array(64).keys()];
  if(flipped)order.reverse();
  $(id).innerHTML=order.map((at,visual)=>{
    const x=at%8,y=Math.floor(at/8),name=files[x]+(8-y),piece=state.board[at];
    const side=sideOf(piece), key=side+piece.toUpperCase();
    const sprite=piece!=='.'?(window.chessscopePieceImages?.[key]||`/assets/flat-pieces/${key}.svg`):null;
    const rank=visual%8===0?`<span class="coordinate rank">${8-y}</span>`:'';
    const file=Math.floor(visual/8)===7?`<span class="coordinate file">${files[x]}</span>`:'';
    return `<div class="square ${(x+y)%2===0?'light':'dark'} ${selected===name?'picked':''} ${last?.from===name?'last-from':''} ${last?.to===name?'last-to':''} ${at===chk&&!mated?'in-check':''} ${mated&&at===chk?'mate-loser':''} ${at===winner?'mate-winner':''}" data-square="${name}">${rank}${sprite?`<img class="piece-img" src="${sprite}" alt="${side==='w'?'White':'Black'} ${piece.toUpperCase()}" draggable="false">`:''}${targets.has(name)?'<span class="legal-dot"></span>':''}${(at===chk)?'<span class="check-alert">!</span>':''}${file}</div>`;
  }).join('');
}
function selectedMove(state,boardId,from,to) {
  const choices=legalMoves(state).filter(move=>square(move.from)===from&&square(move.to)===to);
  if(choices.length<=1)return Promise.resolve(choices[0]||null);
  const side=state.turn;
  return offerPromotion(boardId,to,side).then(answer=>{
    if(!answer)return null;
    return choices.find(move=>move.promotion?.toUpperCase()===answer)||null;
  });
}
let promoResolve=null;
function closePromo(choice) {
  const picker=$('promo-picker');
  picker?.classList.add('hidden');
  document.removeEventListener('pointerdown',promoOutside,true);
  const done=promoResolve; promoResolve=null;
  if(done)done(choice);
}
function promoOutside(event) {
  if(!event.target?.closest?.('#promo-picker'))closePromo(null);
}
function offerPromotion(boardId,to,color) {
  if(promoResolve)closePromo(null);
  return new Promise(resolve=>{
    promoResolve=resolve;
    const picker=$('promo-picker');
    if(!picker){resolve('Q');return;}
    const names={Q:'Queen',R:'Rook',B:'Bishop',N:'Knight'};
    picker.innerHTML=`<div class="promo-title">PROMOTE TO</div><div class="promo-choices">${['Q','R','B','N'].map(p=>{
      const key=(color==='w'?'w':'b')+p;
      const sprite=window.chessscopePieceImages?.[key]||`/assets/flat-pieces/${key}.svg`;
      return `<button type="button" data-promo="${p}" title="${names[p]}"><img src="${sprite}" alt="${names[p]}" draggable="false"><span>${names[p]}</span></button>`;
    }).join('')}</div>`;
    picker.classList.remove('hidden');
    try {
      const board=$(boardId), cell=board?.querySelector?.(`[data-square="${to}"]`);
      const r=(cell||board).getBoundingClientRect();
      picker.style.visibility='hidden'; picker.style.left='0px'; picker.style.top='0px';
      const pw=picker.offsetWidth||280, ph=picker.offsetHeight||120;
      const left=Math.max(8,Math.min(window.innerWidth-pw-8,r.left+r.width/2-pw/2));
      let top=r.top-ph-10;
      if(top<8)top=r.bottom+10;
      top=Math.max(8,Math.min(window.innerHeight-ph-8,top));
      picker.style.left=`${left}px`; picker.style.top=`${top}px`; picker.style.visibility='';
    } catch {}
    picker.querySelectorAll('[data-promo]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();closePromo(button.dataset.promo);}));
    document.addEventListener('pointerdown',promoOutside,true);
  });
}
document.addEventListener('keydown',event=>{ if(event.key==='Escape'&&promoResolve)closePromo(null); });
function soundFor(move,notation) {
  const kind=notation.includes('#')?'mate':notation.includes('+')?'check':move.captured?'capture':'move';
  window.chessscopePlaySound?.(kind);
}
function animateLanding(boardId,from,to) {
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const board=$(boardId),start=board.querySelector?.(`[data-square="${from}"]`),end=board.querySelector?.(`[data-square="${to}"]`),piece=end?.querySelector('.piece-img');
  if(!start||!piece?.animate)return;
  const a=start.getBoundingClientRect(),b=end.getBoundingClientRect(),base=getComputedStyle(piece).transform;
  piece.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px) ${base}`,opacity:.85},{transform:base,opacity:1}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
}
const suppressedClicks=new Set();
let dragSession=null;
function enableDrag(id,canPick,onDrop) {
  const board=$(id);
  board.addEventListener('pointerdown',event=>{
    const cell=event.target.closest('[data-square]');
    if(event.button!==0||!cell||!canPick(cell.dataset.square))return;
    dragSession={id,pointerId:event.pointerId,from:cell.dataset.square,startX:event.clientX,startY:event.clientY,cell,ghost:null};
  });
  document.addEventListener('pointermove',event=>{
    const session=dragSession;
    if(!session||session.id!==id||session.pointerId!==event.pointerId)return;
    if(!session.ghost&&Math.hypot(event.clientX-session.startX,event.clientY-session.startY)<7)return;
    if(!session.ghost){
      const ghost=document.createElement('div');
      ghost.className='drag-piece';
      ghost.style.width=`${session.cell.getBoundingClientRect().width}px`;
      ghost.style.height=ghost.style.width;
      ghost.innerHTML=session.cell.querySelector('.piece-img')?.outerHTML||session.cell.querySelector('.piece-fallback')?.outerHTML||'';
      document.body.appendChild(ghost);
      session.cell.classList.add('drag-source');
      session.ghost=ghost;
      window.chessscopePlaySound?.('lift');
    }
    event.preventDefault();
    session.ghost.style.transform=`translate(${event.clientX}px,${event.clientY}px) translate(-50%,-50%)`;
  },{passive:false});
  const end=async event=>{
    const session=dragSession;
    if(!session||session.id!==id||session.pointerId!==event.pointerId)return;
    dragSession=null;
    if(!session.ghost)return;
    session.ghost.remove();session.cell.classList.remove('drag-source');
    suppressedClicks.add(id);
    setTimeout(()=>suppressedClicks.delete(id),0);
    if(event.type==='pointercancel')return;
    const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]');
    let placed=false;
    if(cell&&board.contains(cell))placed=!!await onDrop(session.from,cell.dataset.square);
    if(!placed) {
      window.chessscopePlaySound?.('drop');
      session.cell.classList.add('drop-reject');
      setTimeout(()=>session.cell.classList.remove('drop-reject'),280);
    }
  };
  document.addEventListener('pointerup',end);
  document.addEventListener('pointercancel',end);
}

let playState=fromFen(START_FEN),playHistory=[],playColor='w',playFlipped=false,playSelected=null,playLast=null,playStarted=false,playBusy=false,playEpoch=0,playEvalEpoch=0;
const TIME_CONTROLS={casual:{label:'Casual · no clock',baseMs:0,incMs:0},bullet:{label:'Bullet · 1+0',baseMs:60000,incMs:0},blitz32:{label:'Blitz · 3+2',baseMs:180000,incMs:2000},blitz5:{label:'Blitz · 5+0',baseMs:300000,incMs:0},rapid10:{label:'Rapid · 10+0',baseMs:600000,incMs:0},rapid15:{label:'Rapid · 15+10',baseMs:900000,incMs:10000},classical:{label:'Classical · 30+0',baseMs:1800000,incMs:0}};
let timeControl='casual',clockW=0,clockB=0,lastTickTs=0,timeWinner=null;
const activeTc=()=>TIME_CONTROLS[timeControl]||TIME_CONTROLS.casual;
const isTimed=()=>activeTc().baseMs>0;
function formatClock(ms) {
  const total=Math.max(0,ms)/1000;
  if(total<20)return `0:${String(Math.floor(total)).padStart(2,'0')}.${Math.floor(total%1*10)}`;
  return `${Math.floor(total/60)}:${String(Math.floor(total%60)).padStart(2,'0')}`;
}
function paintClocks() {
  const top=$('clock-top'), bottom=$('clock-bottom');
  if(!top||!bottom)return;
  const show=playStarted&&isTimed();
  top.classList.toggle('hidden',!show); bottom.classList.toggle('hidden',!show);
  if(!show)return;
  const topColor=playFlipped?'w':'b', bottomColor=playFlipped?'b':'w';
  const paint=(el,color)=>{
    el.textContent=formatClock(color==='w'?clockW:clockB);
    el.classList.toggle('active',playStarted&&!playResult()&&playState.turn===color);
    el.classList.toggle('low',(color==='w'?clockW:clockB)<10000);
  };
  paint(top,topColor); paint(bottom,bottomColor);
}
function tickClocks() {
  if(!playStarted||timeWinner||!isTimed()||playResult())return;
  const now=Date.now(), dt=now-lastTickTs; lastTickTs=now;
  if(playState.turn==='w')clockW-=dt; else clockB-=dt;
  if(clockW<=0||clockB<=0) {
    clockW=Math.max(0,clockW); clockB=Math.max(0,clockB);
    timeWinner=playState.turn==='w'?'b':'w';
    window.chessscopePlaySound?.(timeWinner===playColor?'win':'lose');
    renderPlay();
  } else paintClocks();
}
const clockTimer=setInterval(tickClocks,100);
if(clockTimer&&clockTimer.unref)clockTimer.unref();
function renderTcMenu() {
  const menu=$('time-control-menu'), label=$('time-control-label');
  if(label)label.textContent=(TIME_CONTROLS[timeControl]||TIME_CONTROLS.casual).label;
  if(!menu)return;
  menu.innerHTML=Object.entries(TIME_CONTROLS).map(([id,tc])=>`<button type="button" data-tc="${id}" class="${id===timeControl?'active':''}">${escapeHtml(tc.label)}</button>`).join('');
}
$('time-control-button')?.addEventListener('click',event=>{event.stopPropagation();renderTcMenu();$('time-control-menu')?.classList.toggle('hidden');});
$('time-control-menu')?.addEventListener('click',event=>{
  const choice=event.target.closest('[data-tc]');
  if(!choice)return;
  timeControl=choice.dataset.tc;
  renderTcMenu();
  $('time-control-menu')?.classList.add('hidden');
});
document.addEventListener('pointerdown',event=>{if(!event.target?.closest?.('#time-control-wrap'))$('time-control-menu')?.classList.add('hidden');});
renderTcMenu();
function playScoreText(e) {
  if (!e) return '—';
  if (e.mate !== null && e.mate !== undefined) return `${e.mate > 0 ? '+' : '−'}M${Math.abs(e.mate)}`;
  return (e.cp >= 0 ? '+' : '−') + (Math.abs(e.cp)/100).toFixed(1);
}
function playWinChance(e) {
  if (!e) return 50;
  const cp = (e.mate !== null && e.mate !== undefined) ? (e.mate > 0 ? 1500 : -1500) : e.cp;
  return 100/(1+Math.exp(-cp/130));
}
function paintPlayEval(e) {
  const fill=$('play-eval-fill'), text=$('play-eval-text');
  if (!fill || !text) return;
  const pct=Math.max(5,Math.min(95,100-playWinChance(e)));
  fill.style.height=`${pct}%`;
  text.textContent=playScoreText(e);
}
async function refreshPlayEval() {
  const epoch=++playEvalEpoch, fen=toFen(playState);
  try {
    const response=await fetch('/api/live-eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fen})});
    const data=await apiJson(response);
    if (epoch!==playEvalEpoch || fen!==toFen(playState)) return;
    paintPlayEval(data.evaluation);
  } catch { /* keep the previous reading; engine errors already surface elsewhere */ }
}
function playResult() {
  if(timeWinner)return `${timeWinner==='w'?'White':'Black'} wins on time.`;
  const legal=legalMoves(playState);
  if(!legal.length) return inCheck(playState)?`${playState.turn==='w'?'Black':'White'} wins by checkmate.`:'Draw by stalemate.';
  if(playState.halfmove>=100)return 'Draw by the fifty-move rule.';
  return null;
}
function renderPlay() {
  renderTrainingBoard('play-board',playState,{flipped:playFlipped,selected:playSelected,last:playLast});
  $('play-opponent').textContent=`Stockfish ${$('elo-range').value}`;
  const end=playResult();
  $('play-status').textContent=end||(!playStarted?'Choose your settings and start a game.':playBusy?'Stockfish is thinking…':playState.turn===playColor?'Your move. Check the opponent’s threats.':'Stockfish to move.');
  // Live opening + variation label: always show what is on the board (e.g. Four Knights Game — Spanish Variation).
  try {
    const nameEl=$('play-opening-name'), variationEl=$('play-variation-name');
    if (nameEl && variationEl) {
      if (!playHistory.length) {
        nameEl.textContent='Starting position';
        variationEl.textContent='The name will update as you play';
      } else {
        const found=(typeof identifyOpening==='function' ? identifyOpening(playHistory) : null)
          || (typeof openingFallback==='function' ? openingFallback(playHistory) : null);
        nameEl.textContent=found?.name || 'Opening not identified';
        variationEl.textContent=[found?.variation || 'Main line', found?.family].filter(Boolean).join(' · ');
      }
    }
  } catch {}
  $('play-moves').innerHTML=playHistory.length?Array.from({length:Math.ceil(playHistory.length/2)},(_,i)=>`<div class="play-move-row"><span>${i+1}.</span><strong>${escapeHtml(playHistory[i*2]?.san||'')}</strong><strong>${escapeHtml(playHistory[i*2+1]?.san||'')}</strong></div>`).join(''):'<div class="empty-list">Your game will appear here.</div>';
  $('play-moves').scrollTop=$('play-moves').scrollHeight;
  $('analyze-play-game')?.classList.toggle('hidden',!playHistory.length);
  paintClocks();
}
function playGameResult() {
  const end=playResult();
  if(!end)return '*';
  if(/^White wins/.test(end))return '1-0';
  if(/^Black wins/.test(end))return '0-1';
  return '1/2-1/2';
}
function playHistoryPgn() {
  const elo=$('elo-range').value;
  const white=playColor==='w'?'You':`Stockfish ${elo}`, black=playColor==='w'?`Stockfish ${elo}`:'You';
  const result=playGameResult(), now=new Date();
  const date=`${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  const tc=isTimed()?`${activeTc().baseMs/1000}+${activeTc().incMs/1000}`:'-';
  let text='';
  playHistory.forEach((m,i)=>{
    if(m.color==='w')text+=`${i/2+1}. ${m.san} `;
    else text+=`${m.san} `;
  });
  return `[Event "Casual game vs Stockfish"]\n[Site "Chessscope"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[TimeControl "${tc}"]\n\n${text}${result}`;
}
$('analyze-play-game')?.addEventListener('click',()=>{
  if(!playHistory.length)return;
  window.chessscopeShowPage?.('analysis');
  analyzePgn(playHistoryPgn());
});
function commitPlay(move) {
  const notation=san(playState,move), color=playState.turn;
  playState=play(playState,move);
  if(isTimed()){ if(color==='w')clockW+=activeTc().incMs; else clockB+=activeTc().incMs; }
  lastTickTs=Date.now();
  playHistory.push({san:notation,color,uci:uciOf(move),fen:toFen(playState)});
  playLast={from:square(move.from),to:square(move.to)};
  playSelected=null;
  $('hint-result').classList.add('hidden');
  const end=playResult();
  if (end) {
    const winner=end.match(/^(White|Black) wins/)?.[1];
    soundFor(move,notation);
    window.chessscopePlaySound?.(!winner?'draw':winner===(playColor==='w'?'White':'Black')?'win':'lose');
  } else soundFor(move,notation);
  renderPlay();
  animateLanding('play-board',playLast.from,playLast.to);
  refreshPlayEval();
}
async function engineTurn() {
  if(!playStarted||playResult())return;
  const epoch=playEpoch;
  playBusy=true;$('play-status').textContent='Stockfish is thinking…';
  // On a clock, keep the engine's thinking inside ~1/25 of its remaining time.
  const engineClock=playState.turn==='w'?clockW:clockB;
  const thinkMs=isTimed()?Math.max(120,Math.min(650,engineClock/25)):650;
  try {
    const response=await fetch('/api/engine-move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fen:toFen(playState),rating:Number($('elo-range').value),thinkMs})});
    const data=await apiJson(response);
    if(epoch!==playEpoch)return;
    const move=legalMoves(playState).find(item=>uciOf(item)===data.uci);
    if(!move)throw Error('Stockfish returned a move that is not legal here.');
    playBusy=false;commitPlay(move);
  } catch(error) {
    if(epoch!==playEpoch)return;
    playBusy=false;renderPlay();$('play-status').textContent=error.message;
  }
}
function startGame() {
  playEpoch++;
  playEvalEpoch++;
  $('time-control-menu')?.classList.add('hidden');
  clockW=clockB=activeTc().baseMs; timeWinner=null; lastTickTs=Date.now();
  playState=fromFen(START_FEN);playHistory=[];playSelected=null;playLast=null;playStarted=true;playBusy=false;playFlipped=playColor==='b';
  $('hint-result').classList.add('hidden');
  window.chessscopePlaySound?.('start');
  paintPlayEval({cp:20,mate:null});
  renderPlay();
  refreshPlayEval();
  if(playColor==='b')engineTurn();
}
$('elo-range').addEventListener('input',()=>{$('elo-value').textContent=$('elo-range').value;if(!playStarted)$('play-opponent').textContent=`Stockfish ${$('elo-range').value}`});
$('play-color').addEventListener('click',event=>{const button=event.target.closest('[data-color]');if(!button)return;playColor=button.dataset.color;for(const item of $('play-color').querySelectorAll('button'))item.classList.toggle('active',item===button)});
$('start-game').addEventListener('click',startGame);
$('play-flip').addEventListener('click',()=>{playFlipped=!playFlipped;renderPlay()});
async function playHumanMove(from,to) {
  if(!playStarted||playBusy||playResult()||playState.turn!==playColor)return false;
  const move=await selectedMove(playState,'play-board',from,to);
  if(!move)return false;
  commitPlay(move);if(!playResult())engineTurn();
  return true;
}
$('play-board').addEventListener('click',async event=>{
  if(suppressedClicks.delete('play-board'))return;
  const cell=event.target.closest('[data-square]');
  if(!cell||!playStarted||playBusy||playResult()||playState.turn!==playColor)return;
  const target=cell.dataset.square;
  if(playSelected&&await playHumanMove(playSelected,target))return;
  const piece=playState.board[index(target)];
  const picked=sideOf(piece)===playColor?target:null;
  if(picked&&picked!==playSelected)window.chessscopePlaySound?.('select');
  playSelected=picked;
  renderPlay();
});
enableDrag('play-board',from=>playStarted&&!playBusy&&!playResult()&&playState.turn===playColor&&sideOf(playState.board[index(from)])===playColor,playHumanMove);
$('thinking-hint').addEventListener('click',()=>{
  if(!playStarted||playState.turn!==playColor||playBusy)return;
  window.chessscopePlaySound?.('select');
  const moves=legalMoves(playState),checks=moves.filter(move=>/[+#]/.test(san(playState,move,moves))),captures=moves.filter(move=>move.captured);
  const clue=inCheck(playState)?'Your king is in check. Find every legal response before considering a plan.':checks.length?`There ${checks.length===1?'is':'are'} ${checks.length} checking ${checks.length===1?'move':'moves'}. Calculate the forcing replies first.`:captures.length?`There ${captures.length===1?'is':'are'} ${captures.length} available ${captures.length===1?'capture':'captures'}. Count defenders before taking.`:'No immediate check or capture stands out. Improve your least active piece and look for loose targets.';
  $('hint-result').textContent=clue;$('hint-result').classList.remove('hidden');
});
$('engine-hint').addEventListener('click',async()=>{
  if(!playStarted||playState.turn!==playColor||playBusy)return;
  window.chessscopePlaySound?.('select');
  const epoch=playEpoch,fen=toFen(playState);
  $('hint-result').textContent='Stockfish is checking your options…';$('hint-result').classList.remove('hidden');
  try {
    const response=await fetch('/api/coach-hint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fen})});
    const data=await apiJson(response);
    if(epoch!==playEpoch||fen!==toFen(playState))return;
    $('hint-result').textContent=`Stockfish suggests ${data.bestMove?.san||'a different move'}. Candidate line: ${data.evaluation.line?.join(' ')||'not available'}. Ask what this move attacks and what it leaves behind.`;
  } catch(error){$('hint-result').textContent=error.message;}
});

let opening=openings[0],openingStep=0,openingPractice=false,openingPicked=null,openingFilter='all',openingFeedback='',openingAttempts={};
try { openingAttempts=JSON.parse(localStorage.getItem('chessscope-opening-progress')||'{}'); } catch {}
function openingState(){return fromFen(openingStep?opening.moves[openingStep-1].fen:START_FEN)}
function saveOpeningProgress(){try{localStorage.setItem('chessscope-opening-progress',JSON.stringify(openingAttempts))}catch{}}
function renderOpeningCatalog(){
  const query=$('opening-search').value.trim().toLowerCase();
  const choices=openings.filter(item=>(openingFilter==='all'||item.side===openingFilter)&&(`${item.name} ${item.family}`.toLowerCase().includes(query)));
  $('opening-catalog').innerHTML=choices.map(item=>{const progress=openingAttempts[item.id]||{correct:0,tries:0};return `<button class="opening-item ${opening.id===item.id?'active':''}" data-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.family)} · ${item.side==='white'?'White':'Black'}${progress.correct?` · ${progress.correct} correct`:''}</span></button>`}).join('')||'<div class="empty-list">No opening matches that search.</div>';
}
function renderOpeningDetail(){
  $('opening-detail').innerHTML=`<div class="eyebrow small">${escapeHtml(opening.family.toUpperCase())}</div><h2>${escapeHtml(opening.name)}</h2><p class="coach-copy">${escapeHtml(opening.idea)}</p><div class="opening-watch"><strong>Watch for</strong><p>${escapeHtml(opening.watch)}</p></div><div class="opening-line">${opening.moves.map((move,i)=>`<span class="${i===openingStep-1?'current':''}">${i%2===0?`${Math.floor(i/2)+1}.`:''}${escapeHtml(move.san)}</span>`).join(' ')}</div><button id="opening-practice" class="primary-button">${openingPractice?'Restart practice':'Practice this line'} →</button><div class="hint-result ${openingFeedback?'':'hidden'}" id="opening-feedback">${escapeHtml(openingFeedback)}</div>`;
}
function renderOpeningBoard(){
  const state=openingState();
  renderTrainingBoard('opening-board',state,{flipped:opening.side==='black',selected:openingPicked,last:openingStep?opening.moves[openingStep-1]:null});
  $('opening-board-title').textContent=opening.name;
  $('opening-board-status').textContent=openingPractice?'Your move when your color is to play.':'Follow the main line, then test yourself.';
  $('opening-step').textContent=openingPractice?(openingStep>=opening.moves.length?'Line complete':state.turn===opening.side[0]?'Find your move':'Opponent response'):(openingStep?`${Math.ceil(openingStep/2)}${openingStep%2?'.':'...'} ${opening.moves[openingStep-1].san}`:'Starting position');
  $('opening-prev').disabled=openingPractice||openingStep===0;
  $('opening-next').disabled=openingPractice||openingStep>=opening.moves.length;
  renderOpeningDetail();renderOpeningCatalog();
}
function selectOpening(id){const found=openings.find(item=>item.id===id);if(!found)return;opening=found;openingStep=0;openingPractice=false;openingPicked=null;openingFeedback='';renderOpeningBoard()}
function startOpeningPractice(){openingStep=0;openingPractice=true;openingPicked=null;openingFeedback='Find the next move for your color.';while(openingStep<opening.moves.length&&opening.moves[openingStep].color!==opening.side[0])openingStep++;renderOpeningBoard()}
$('opening-search').addEventListener('input',renderOpeningCatalog);
$('opening-catalog').addEventListener('click',event=>{const item=event.target.closest('[data-id]');if(item)selectOpening(item.dataset.id)});
document.querySelector('.opening-filters').addEventListener('click',event=>{const button=event.target.closest('[data-side]');if(!button)return;openingFilter=button.dataset.side;for(const item of document.querySelectorAll('.opening-filters button'))item.classList.toggle('active',item===button);renderOpeningCatalog()});
$('opening-detail').addEventListener('click',event=>{if(event.target.closest('#opening-practice'))startOpeningPractice()});
$('opening-prev').addEventListener('click',()=>{openingStep=Math.max(0,openingStep-1);openingFeedback='';renderOpeningBoard()});
$('opening-next').addEventListener('click',()=>{openingStep=Math.min(opening.moves.length,openingStep+1);openingFeedback='';renderOpeningBoard()});
async function attemptOpeningMove(from,to) {
  if(!openingPractice||openingStep>=opening.moves.length)return false;
  const state=openingState();
  if(state.turn!==opening.side[0])return false;
  const move=await selectedMove(state,'opening-board',from,to);
  if(!move)return false;
  const progress=openingAttempts[opening.id]||{correct:0,tries:0};progress.tries++;
  const correct=uciOf(move)===opening.moves[openingStep].uci;
  if(correct){
    progress.correct++;openingStep++;openingFeedback=openingStep>=opening.moves.length?'Line complete. You played the studied moves.':'Correct. Notice which square or piece that move improves.';
    while(openingStep<opening.moves.length&&opening.moves[openingStep].color!==opening.side[0])openingStep++;
    window.chessscopePlaySound?.('move');
  }else openingFeedback=`Try again. Think about the plan: ${opening.idea}`;
  if(!correct)window.chessscopePlaySound?.('illegal');
  openingAttempts[opening.id]=progress;saveOpeningProgress();openingPicked=null;renderOpeningBoard();
  if(correct)animateLanding('opening-board',from,to);
  return true;
}
$('opening-board').addEventListener('click',async event=>{
  if(suppressedClicks.delete('opening-board'))return;
  if(!openingPractice||openingStep>=opening.moves.length)return;
  const cell=event.target.closest('[data-square]');if(!cell)return;
  const state=openingState(),target=cell.dataset.square;
  if(state.turn!==opening.side[0])return;
  if(openingPicked&&await attemptOpeningMove(openingPicked,target))return;
  openingPicked=sideOf(state.board[index(target)])===state.turn?target:null;renderOpeningBoard();
});
enableDrag('opening-board',from=>openingPractice&&openingStep<opening.moves.length&&openingState().turn===opening.side[0]&&sideOf(openingState().board[index(from)])===opening.side[0],attemptOpeningMove);
window.addEventListener('chessscope:practice-opening',event=>{selectOpening(event.detail.id);window.chessscopeShowPage?.('study');$('study-openings-tab').click();startOpeningPractice()});

let tacticIndex=0,tacticPicked=null,tacticSolved=false,tacticFeedback='Select a piece and play your candidate move.';
function tacticState(){const puzzle=puzzles[tacticIndex],state=fromFen(puzzle.fen);if(tacticSolved){const move=legalMoves(state).find(item=>uciOf(item)===puzzle.solution);if(move)return play(state,move)}return state}
function renderTactic(){
  const puzzle=puzzles[tacticIndex];
  renderTrainingBoard('tactic-board',tacticState(),{flipped:false,selected:tacticPicked});
  $('tactic-title').textContent=puzzle.theme;
  $('tactic-status').textContent=tacticSolved?'Solved. Review why it works.':'White to move · Find the forcing move';
  $('tactic-prompt').textContent=puzzle.theme;
  $('tactic-description').textContent=puzzle.prompt;
  $('tactic-feedback').textContent=tacticFeedback;
  $('tactic-feedback').classList.toggle('success',tacticSolved);
  $('tactic-counter').textContent=`Puzzle ${tacticIndex+1} of ${puzzles.length}`;
  $('tactic-prev').disabled=tacticIndex===0;$('tactic-next').disabled=tacticIndex===puzzles.length-1;
}
function changeTactic(delta){tacticIndex=Math.max(0,Math.min(puzzles.length-1,tacticIndex+delta));tacticPicked=null;tacticSolved=false;tacticFeedback='Select a piece and play your candidate move.';renderTactic()}
$('tactic-prev').addEventListener('click',()=>changeTactic(-1));$('tactic-next').addEventListener('click',()=>changeTactic(1));
$('tactic-hint').addEventListener('click',()=>{tacticFeedback=puzzles[tacticIndex].hint;renderTactic()});
$('tactic-reveal').addEventListener('click',()=>{const p=puzzles[tacticIndex],state=fromFen(p.fen),moves=legalMoves(state),move=moves.find(item=>uciOf(item)===p.solution);tacticSolved=true;tacticFeedback=`${san(state,move,moves)}. ${p.explanation}`;renderTactic()});
async function attemptTacticMove(from,to) {
  if(tacticSolved)return false;
  const state=tacticState(),move=await selectedMove(state,'tactic-board',from,to);
  if(!move)return false;
  const notation=san(state,move);
  if(uciOf(move)===puzzles[tacticIndex].solution){tacticSolved=true;tacticFeedback=`Correct: ${notation}. ${puzzles[tacticIndex].explanation}`;soundFor(move,notation)}
  else {tacticFeedback='That move misses the tactic. Recheck forcing checks, captures, and threats.';window.chessscopePlaySound?.('illegal');}
  tacticPicked=null;renderTactic();
  if(tacticSolved)animateLanding('tactic-board',from,to);
  return true;
}
$('tactic-board').addEventListener('click',async event=>{
  if(suppressedClicks.delete('tactic-board'))return;
  if(tacticSolved)return;const cell=event.target.closest('[data-square]');if(!cell)return;
  const state=tacticState(),target=cell.dataset.square;
  if(tacticPicked&&await attemptTacticMove(tacticPicked,target))return;
  tacticPicked=sideOf(state.board[index(target)])===state.turn?target:null;renderTactic();
});
enableDrag('tactic-board',from=>!tacticSolved&&sideOf(tacticState().board[index(from)])===tacticState().turn,attemptTacticMove);
for(const tab of ['openings','tactics']) $(`study-${tab}-tab`).addEventListener('click',()=>{for(const name of ['openings','tactics']){$(`study-${name}-tab`).classList.toggle('active',name===tab);$(`${name==='openings'?'opening':'tactics'}-lab`).classList.toggle('hidden',name!==tab)}});

renderPlay();renderOpeningBoard();renderTactic();
window.chessscopeIdentifyOpening=moves=>identifyOpening(moves)||openingFallback(moves);
window.chessscopeAnimateLanding=animateLanding;
window.chessscopeTrainingReady=true;
