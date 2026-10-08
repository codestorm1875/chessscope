import { parsePgn } from './chess.js';
import { ECO_POSITIONS } from './eco-book.js';

// Short, legal main lines used for identification and interactive practice.
const definitions = [
  { id:'italian', name:'Italian Game', family:'Open game', side:'white', keyPly:5, line:'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4', idea:'Develop quickly, aim at f7, then build the c3–d4 central break.', watch:'Before d4, check whether your e4 pawn and c4 bishop are safe.' },
  { id:'four-knights', name:'Four Knights Game', family:'Open game', side:'white', keyPly:6, line:'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O', idea:'Develop all four knights naturally, then choose a central break or pin one of the opposing knights.', watch:'Watch the e4 and e5 pawns before opening the center with d4.' },
  { id:'ruy-lopez', name:'Ruy Lopez', family:'Open game', side:'white', keyPly:5, line:'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7', idea:'Pressure the knight that guards e5, castle early, and prepare a central d4 push.', watch:'Ask whether ...b5 wins a tempo on your bishop.' },
  { id:'scotch', name:'Scotch Game', family:'Open game', side:'white', keyPly:5, line:'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5', idea:'Open the center while your pieces develop actively.', watch:'Calculate exchanges on d4 before moving the queen.' },
  { id:'vienna', name:'Vienna Game', family:'Open game', side:'white', keyPly:3, line:'e4 e5 Nc3 Nf6 f4 d5', idea:'Support e4 with the knight, then challenge the center with f4.', watch:'The f-pawn move opens your king: look for checks first.' },
  { id:'petrov', name:'Petrov Defense', family:'Open game', side:'black', keyPly:4, line:'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4', idea:'Counterattack e4 instead of defending e5 passively.', watch:'Do not copy captures automatically; calculate the e-file tactics.' },
  { id:'philidor', name:'Philidor Defense', family:'Open game', side:'black', keyPly:4, line:'e4 e5 Nf3 d6 d4 Nf6 Nc3 Be7', idea:'Hold e5 solidly, develop, then challenge the center with ...d5 or ...f5.', watch:'A cramped position demands careful piece development.' },
  { id:'kings-gambit', name:"King's Gambit", family:'Gambit', side:'white', keyPly:3, line:'e4 e5 f4 exf4 Nf3 g5 Bc4', idea:'Offer the f-pawn to seize the initiative and open lines toward the king.', watch:'Count forcing checks before accepting or declining the pawn.' },
  { id:'sicilian', name:'Sicilian Defense', family:'Semi-open game', side:'black', keyPly:2, line:'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', idea:'Trade a wing pawn for a central pawn and play for unbalanced positions.', watch:'Watch the d4 square and opposite-side attacking chances.' },
  { id:'french', name:'French Defense', family:'Semi-open game', side:'black', keyPly:2, line:'e4 e6 d4 d5 Nc3 Bb4', idea:'Strike at White’s pawn center with ...d5 and later ...c5.', watch:'The light-squared bishop can be cramped; plan its route.' },
  { id:'caro-kann', name:'Caro-Kann Defense', family:'Semi-open game', side:'black', keyPly:2, line:'e4 c6 d4 d5 Nc3 dxe4 Nxe4', idea:'Challenge e4 while keeping a sturdy pawn structure.', watch:'Develop the light-squared bishop before closing it in.' },
  { id:'scandinavian', name:'Scandinavian Defense', family:'Semi-open game', side:'black', keyPly:2, line:'e4 d5 exd5 Qxd5 Nc3 Qa5', idea:'Challenge e4 immediately, then develop around the early queen move.', watch:'The queen can be attacked for free tempos.' },
  { id:'alekhine', name:"Alekhine's Defense", family:'Hypermodern defense', side:'black', keyPly:2, line:'e4 Nf6 e5 Nd5 d4 d6', idea:'Invite White’s pawns forward, then attack the center as a target.', watch:'Do not retreat the knight without a plan to undermine e5.' },
  { id:'pirc', name:'Pirc Defense', family:'Hypermodern defense', side:'black', keyPly:4, line:'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7', idea:'Let White build a center, then pressure it with pieces and pawn breaks.', watch:'Central pawn advances can become threats very quickly.' },
  { id:'queens-gambit', name:"Queen's Gambit Declined", family:'Queen’s pawn game', side:'white', keyPly:4, line:'d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', idea:'Pressure d5, develop naturally, and prepare e4.', watch:'Ask whether the c-pawn can be recaptured before taking on d5.' },
  { id:'slav', name:'Slav Defense', family:'Queen’s pawn game', side:'black', keyPly:4, line:'d4 d5 c4 c6 Nc3 Nf6 Nf3', idea:'Support d5 with ...c6 while keeping the light-squared bishop active.', watch:'Know when ...dxc4 gains time and when it loses the center.' },
  { id:'london', name:'London System', family:'System opening', side:'white', keyPly:3, line:'d4 d5 Bf4 Nf6 e3 e6 Nf3', idea:'Develop the bishop before e3, then build a reliable central setup.', watch:'A familiar setup still needs calculation after every opponent move.' },
  { id:'kings-indian', name:"King's Indian Defense", family:'Indian defense', side:'black', keyPly:6, line:'d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O', idea:'Allow a large center, castle, and strike with ...e5 or ...c5.', watch:'White may attack on the queenside while Black attacks the king.' },
  { id:'nimzo-indian', name:'Nimzo-Indian Defense', family:'Indian defense', side:'black', keyPly:6, line:'d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O', idea:'Pin the c3 knight and fight for control of e4.', watch:'Exchanging on c3 changes the pawn structure: judge the trade.' },
  { id:'english', name:'English Opening', family:'Flank opening', side:'white', keyPly:1, line:'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5', idea:'Control d5 from the flank and stay flexible about the central pawns.', watch:'Watch for reversed Sicilian ideas after ...e5.' },
  { id:'dutch', name:'Dutch Defense', family:'Queen’s pawn game', side:'black', keyPly:2, line:'d4 f5 c4 Nf6 Nc3 e6', idea:'Control e4 and play actively on the kingside.', watch:'Moving the f-pawn weakens the king’s diagonal.' }
];

const positionKey=fen=>fen?.split(' ').slice(0,3).join(' ');
const compile=item=>{
  const game = parsePgn(item.line);
  return { ...item, variation:item.variation||'Main line', moves:game.moves, initialFen:game.initialFen, finalFen:game.finalFen, uci:game.moves.map(move=>move.uci), keyFen:game.moves[item.keyPly-1]?.fen };
};
export const openings = definitions.map(compile);

// Named branches are identified at the position where their distinctive move appears.
const branches = [
  { baseId:'four-knights', variation:'Spanish Variation', keyPly:7, line:'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5' },
  { baseId:'four-knights', variation:'Scotch Variation', keyPly:7, line:'e4 e5 Nf3 Nc6 Nc3 Nf6 d4' },
  { baseId:'four-knights', variation:'Italian Variation', keyPly:7, line:'e4 e5 Nf3 Nc6 Nc3 Nf6 Bc4' },
  { baseId:'italian', variation:'Giuoco Piano', keyPly:6, line:'e4 e5 Nf3 Nc6 Bc4 Bc5' },
  { baseId:'italian', variation:'Two Knights Defense', keyPly:6, line:'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { baseId:'ruy-lopez', variation:'Morphy Defense', keyPly:6, line:'e4 e5 Nf3 Nc6 Bb5 a6' },
  { baseId:'ruy-lopez', variation:'Berlin Defense', keyPly:6, line:'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { baseId:'scotch', variation:'Classical Variation', keyPly:8, line:'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5' },
  { baseId:'vienna', variation:'Vienna Gambit', keyPly:5, line:'e4 e5 Nc3 Nf6 f4' },
  { baseId:'kings-gambit', variation:'Accepted', keyPly:4, line:'e4 e5 f4 exf4' },
  { baseId:'sicilian', variation:'Najdorf Variation', keyPly:10, line:'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { baseId:'sicilian', variation:'Dragon Variation', keyPly:10, line:'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6' },
  { baseId:'sicilian', variation:'Scheveningen Variation', keyPly:10, line:'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6' },
  { baseId:'french', variation:'Winawer Variation', keyPly:6, line:'e4 e6 d4 d5 Nc3 Bb4' },
  { baseId:'french', variation:'Advance Variation', keyPly:5, line:'e4 e6 d4 d5 e5' },
  { baseId:'french', variation:'Exchange Variation', keyPly:5, line:'e4 e6 d4 d5 exd5' },
  { baseId:'caro-kann', variation:'Advance Variation', keyPly:5, line:'e4 c6 d4 d5 e5' },
  { baseId:'caro-kann', variation:'Classical Variation', keyPly:8, line:'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { baseId:'queens-gambit', name:"Queen's Gambit Accepted", variation:'Accepted', keyPly:4, line:'d4 d5 c4 dxc4' },
  { baseId:'queens-gambit', variation:'Orthodox Defense', keyPly:8, line:'d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7' },
  { baseId:'slav', variation:'Exchange Variation', keyPly:6, line:'d4 d5 c4 c6 cxd5 cxd5' },
  { baseId:'kings-indian', variation:'Classical Variation', keyPly:12, line:'d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5' },
  { baseId:'nimzo-indian', variation:'Classical Variation', keyPly:7, line:'d4 Nf6 c4 e6 Nc3 Bb4 Qc2' },
  { baseId:'english', variation:'Symmetrical Variation', keyPly:2, line:'c4 c5' }
];
export const openingBranches=branches.map(item=>{
  const base=openings.find(opening=>opening.id===item.baseId);
  return compile({ ...base, ...item, id:item.baseId, name:item.name||base.name, family:base.family, idea:base.idea, watch:base.watch });
});
const known=[...openings,...openingBranches];
const byPosition=new Map();
for(const item of known){
  const key=positionKey(item.keyFen),existing=byPosition.get(key);
  if(!existing||item.keyPly>existing.keyPly||(item.keyPly===existing.keyPly&&item.variation!=='Main line'))byPosition.set(key,item);
}

export function identifyCurated(gameMoves) {
  if (!gameMoves?.length) return null;
  for(let i=gameMoves.length-1;i>=0;i--){
    const match=byPosition.get(positionKey(gameMoves[i]?.fen));
    if(match)return match;
  }
  const uci=gameMoves.map(move=>typeof move==='string'?move:move.uci);
  const matches=known.filter(item=>uci.length>=item.keyPly&&item.uci.slice(0,item.keyPly).every((move,i)=>uci[i]===move));
  matches.sort((a,b)=>b.keyPly-a.keyPly||(b.variation!=='Main line')-(a.variation!=='Main line'));
  return matches[0]||null;
}

// Full ECO book (lichess-org/chess-openings, ~3,800 positions): deepest match wins,
// so even a 60-move game is named by the book position it passed through.
const ecoByFen=new Map();
for(const [key,eco,base,variation,ply]of ECO_POSITIONS) {
  if(!ecoByFen.has(key))ecoByFen.set(key,{eco,base,variation,ply});
}
const curatedByName=new Map(openings.map(opening=>[opening.name.toLowerCase(),opening]));
const ecoFamily=eco=>({'A':'Flank & irregular openings','B':'Semi-open game','C':'Open game','D':'Closed game','E':'Indian defense'}[eco?.[0]]||'Game opening');
function ecoMatch(gameMoves) {
  for(let i=gameMoves.length-1;i>=0;i--){
    const found=ecoByFen.get(positionKey(gameMoves[i]?.fen));
    if(found)return found;
  }
  return null;
}

export function identifyOpening(gameMoves) {
  if (!gameMoves?.length) return null;
  const eco=ecoMatch(gameMoves);
  if(eco){
    const curated=curatedByName.get(eco.base.toLowerCase());
    return {
      id:curated?.id, eco:eco.eco, name:eco.base, variation:eco.variation,
      family:curated?.family||ecoFamily(eco.eco),
      idea:curated?.idea||'Develop your pieces, control the center, and secure your king before launching an attack.',
      watch:curated?.watch||'Look for checks, captures, and threats before following a memorized move.',
      side:curated?.side, ply:eco.ply, source:'eco'
    };
  }
  return identifyCurated(gameMoves);
}

export function openingFallback(gameMoves) {
  const bookNote=`Sideline — not in the ${ECO_POSITIONS.length.toLocaleString()}-position library`;
  const uci=(gameMoves||[]).map(move=>typeof move==='string'?move:move?.uci).filter(Boolean);
  const first = uci[0];
  const early=(name,variation,family,idea,watch)=>({ name, variation, family, idea, watch });
  // 1.e4 e5 branch: the library needs 5-6 ply to name Italian / Ruy / Four Knights,
  // so name the early position instead of showing "Unclassified".
  if (first === 'e2e4') {
    if (uci.length===1) return early("King's Pawn Game",'Main line','Open game','Control the center, develop pieces, and castle.','Look for checks, captures, and threats before every move.');
    if (uci[1] === 'e7e5') {
      if (uci.length===2) return early('Open Game','Main line','Open game','Both sides stake the center. Develop knights before committing the bishops.','Watch the e4/e5 tension before opening the position.');
      if (uci[2] === 'g1f3') {
        if (uci.length===3) return early("King's Knight Opening",'Main line','Open game','The natural developing move. Black usually answers ...Nc6, ...Nf6 or ...d6.','Notice whether Black protects e5 or counterattacks it.');
        // 4+ moves starting e4 e5 Nf3 that match no library line (e.g. a sideline on move 4-5).
        return early('Open Game',"King's Knight Opening — sideline",'Open game','You left book on move 4-5. Develop, castle, and fight for d4.','Your line is playable but not named here — calculate checks, captures, and threats.');
      }
      if (uci[2] === 'b1c3') return early('Vienna Game','Early position','Open game','Support e4, then challenge with f4 or d4.','The f-pawn plan opens your king — check for tactics first.');
      if (uci[2] === 'f2f4') return early("King's Gambit",'Early position','Gambit','Offer the f-pawn for speed and open lines.','Count forcing checks before accepting or declining.');
      if (uci[2] === 'd2d4') return early('Center Game','Early position','Open game','Strike at e5 immediately.','Recapture on d4 carefully — the queen can be exposed.');
      return early('Open Game','Early / sideline','Open game','You left book early. Develop knights and bishops toward the center.','Unlisted sideline — play principled moves and watch tactics.');
    }
    // Other 1.e4 replies (c5, e6, c6, d5, Nf6, d6) are named from ply 2, so reaching
    // here means a truly rare reply or sideline.
    return early("King's Pawn Game",bookNote,'Open game','A rare reply to e4. Occupy the center and develop quickly.','Not in the local book — trust development and king safety.');
  }
  if (first === 'd2d4') {
    if (uci.length===1) return early("Queen's Pawn Game",'Main line','Queen’s pawn game','Build central space and develop behind the pawn chain.','Track the tension between the c- and d-pawns.');
    if (uci[1] === 'd7d5') {
      if (uci.length===2) return early('Closed Game','Main line','Queen’s pawn game','A solid central structure. Develop and prepare c4 or e4.','Closed centers reward patient piece play.');
      if (uci[2] === 'c2c4') {
        if (uci.length===3) return early("Queen's Gambit",'Early position','Queen’s pawn game','Pressure d5 before committing the bishops.','Ask whether ...dxc4 can be met by recapture or e4.');
      }
      if (uci[2] === 'c1f4') return early('London System','Early position','System opening','Develop the bishop before e3 for a solid setup.','A solid setup still needs tactics after every move.');
    }
    if (uci[1] === 'g8f6') {
      if (uci.length===2) return early('Indian Game','Main line','Indian defense','Black lets White build the center, then attacks it.','Watch ...e5, ...c5 and ...b6 pawn breaks.');
      return early('Indian Game','Early / sideline','Indian defense','You left book early. Control e4 and finish development.','Unlisted sideline — play principled moves.');
    }
    return early("Queen's Pawn Game",bookNote,'Queen’s pawn game','Build central space and develop behind the pawn chain.','Not in the local book — trust development and king safety.');
  }
  if (first === 'c2c4') return openings.find(opening=>opening.id==='english');
  if (first === 'g1f3') return { name:'Réti Opening', variation:'Main line', family:'Flank opening', idea:'Develop flexibly and wait to decide how to occupy the center.', watch:'Watch the opponent’s central pawn advances.' };
  return { name:'Irregular Opening', variation:bookNote, family:'Irregular opening', idea:'Develop pieces, control the center, and make your king safe.', watch:'Check forcing moves before following a memorized pattern.' };
}
