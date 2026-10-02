'use strict';
// Extension layer. The approved v0.8 algorithm/runtime files remain byte-identical.
const Base=require('../runtime');
const {PROFILE}=require('./profile');
function createPlayRound(deal,roundId) {
  const state={...Base.createRound(deal,{roundId}),buffer:[],undo:null};
  checkRound(state);return state;
}
function legalTiles(s) {
  if(s.status!=='PLAYING')return [];
  return [...Base.legalMoves(s),...s.buffer];
}
function rejected(state,code){return {ok:false,code,state,events:[]};}
function statusOf(s) {
  return s.rack.length>=7?'LOST':s.cleared===s.deal.cells.length&&s.rack.length===0&&s.buffer.length===0?'WON':'PLAYING';
}
/** Defensive invariant. Only trust a board loaded by the snapshot loader or diagnostic replay. */
function checkRound(s) {
  const cells=s.deal.cells,n=cells.length;
  if(s.taken.length!==n||s.blockers.length!==n||s.taken.some(x=>typeof x!=='boolean'))throw new Error('INVALID_TAKEN_MASK');
  if(!Number.isSafeInteger(s.cleared)||s.cleared<0||s.cleared%3)throw new Error('INVALID_CLEARED_COUNT');
  if(!Array.isArray(s.buffer)||s.buffer.length>3)throw new Error('INVALID_BUFFER');
  const ids=[...s.rack,...s.buffer],seen=new Set();
  for(const id of ids){if(s.byId[id]===undefined||seen.has(id)||!s.taken[s.byId[id]])throw new Error('DUPLICATE_OR_MISPLACED_TILE');seen.add(id);}
  if(s.taken.filter(Boolean).length!==s.cleared+ids.length)throw new Error('CARD_CONSERVATION');
  const clearedTypes=new Map(),rackTypes=new Map();
  for(let i=0;i<n;i++){
    const parents=s.graph.parents[i];
    if(!s.taken[i] && s.blockers[i]!==parents.filter(j=>!s.taken[j]).length)throw new Error('BLOCKER_MISMATCH');
    if(s.taken[i]&&!seen.has(cells[i].id))clearedTypes.set(cells[i].type,(clearedTypes.get(cells[i].type)||0)+1);
  }
  if([...clearedTypes.values()].some(x=>x%3))throw new Error('CLEARED_TYPE_CONSERVATION');
  for(const id of s.rack){const t=cells[s.byId[id]].type;rackTypes.set(t,(rackTypes.get(t)||0)+1);}
  if([...rackTypes.values()].some(x=>x>=3))throw new Error('UNRESOLVED_TRIPLE');
  if(s.rack.length>7||s.status!==statusOf(s))throw new Error('INVALID_ROUND_STATUS');
  return true;
}
function pickTile(s,id,profile=PROFILE) {
  if(s.status!=='PLAYING')return rejected(s,'ROUND_NOT_PLAYING');
  const i=s.byId[id];if(i===undefined)return rejected(s,'UNKNOWN_TILE');
  const bi=s.buffer.indexOf(id),fromBuffer=bi>=0;
  if(!fromBuffer && s.taken[i])return rejected(s,'ALREADY_TAKEN');
  if(!fromBuffer && s.blockers[i]!==0)return rejected(s,'BLOCKED');
  if(fromBuffer && profile.bufferReturn!=='any')return rejected(s,'BUFFER_RETURN_RULE_UNBOUND');
  const cell=s.deal.cells[i],taken=s.taken.slice(),blockers=s.blockers.slice(),buffer=s.buffer.slice(),rack=s.rack.slice();
  if(fromBuffer)buffer.splice(bi,1);
  else {taken[i]=true;for(const j of s.graph.children[i])if(!taken[j])blockers[j]--;}
  let index=-1;for(let j=0;j<rack.length;j++)if(s.deal.cells[s.byId[rack[j]]].type===cell.type)index=j;
  rack.splice(index<0?rack.length:index+1,0,id);
  const matching=rack.filter(v=>s.deal.cells[s.byId[v]].type===cell.type),clear=matching.length===3?matching:[];
  const finalRack=clear.length?rack.filter(v=>!clear.includes(v)):rack;
  const next={...s,taken,blockers,buffer,rack:finalRack,cleared:s.cleared+clear.length,revision:s.revision+1,
    undo:clear.length?null:{id,source:fromBuffer?'buffer':cell.zone}};
  next.status=statusOf(next);checkRound(next);
  return {ok:true,code:'PICKED',state:next,events:[{type:'TAKE',id,source:fromBuffer?'buffer':cell.zone},
    ...(clear.length?[{type:'CLEAR',ids:clear}]:[]),...(next.status!=='PLAYING'?[{type:next.status}]:[])]};
}
/** null means effect is currently eligible; quota and reward checks belong to session.js. */
function canAssist(s,kind,profile=PROFILE) {
  if(kind==='revive')return 'REVIVE_RULE_UNBOUND';
  if(!['move','undo','shuffle'].includes(kind))return 'UNKNOWN_ASSIST';
  if(s.status!=='PLAYING')return 'ROUND_NOT_PLAYING';
  if(kind==='move'){
    if(s.rack.length<3)return 'NOT_ENOUGH_RACK_TILES';
    if(s.buffer.length)return 'BUFFER_OCCUPIED';
  }
  if(kind==='undo'){
    if(!s.undo||!s.rack.includes(s.undo.id))return 'NO_UNDO';
    if(!profile.undoSources.includes(s.undo.source))return 'UNDO_SOURCE_UNBOUND';
  }
  if(kind==='shuffle'&&s.taken.every(Boolean))return 'NO_REMAINING_TILES';
  return null;
}
function applyAssist(s,kind,profile=PROFILE,permutation) {
  const reason=canAssist(s,kind,profile);if(reason)return rejected(s,reason);
  let state,events=[];
  if(kind==='move'){
    const ids=s.rack.slice(0,3);
    state={...s,rack:s.rack.slice(3),buffer:ids,undo:null,revision:s.revision+1};
    events=[{type:'MOVE_TO_BUFFER',ids}];
  }else if(kind==='undo'){
    const id=s.undo.id,index=s.byId[id],taken=s.taken.slice();taken[index]=false;
    const blockers=s.graph.parents.map(p=>p.filter(i=>!taken[i]).length);
    state={...s,taken,blockers,rack:s.rack.filter(v=>v!==id),undo:null,revision:s.revision+1};
    events=[{type:'UNDO',id}];
  }else{
    // Base validates that every label is conserved and recomputes content identity.
    try {const fresh=Base.shuffleRemaining(s,{shuffle:()=>Array.isArray(permutation)?permutation.slice():permutation});
      state={...fresh,buffer:s.buffer.slice(),undo:null};
    }catch(e){return rejected(s,e.message);}
    events=[{type:'SHUFFLED',snapshotHash:state.deal.snapshotHash,ordinal:state.shuffleOrdinal}];
  }
  state.status=statusOf(state);checkRound(state);
  return {ok:true,code:'ASSIST_APPLIED',state,events};
}
module.exports={createPlayRound,legalTiles,pickTile,canAssist,applyAssist,checkRound};
