'use strict';
const {buildGraph}=require('./layout');
const {validateSnapshotFields}=require('./schema');
const {hashSnapshot}=require('./content-hash');
/** Load an initial, full-pool deal. This is NOT a saved-round resume API.
 * roundId is supplied by the session owner; null means local/unbound, not globally unique.
 */
function createRound(deal,options={}) {
  validateSnapshotFields(deal);
  const roundId=options.roundId===undefined?null:options.roundId;
  if(roundId!==null && (typeof roundId!=='string'||!roundId.trim())) throw new TypeError('INVALID_ROUND_ID');
  const cells=deal.cells.map(c=>({...c,rect:{...c.rect}}));
  const immutableDeal={...deal,cells,snapshotHash:deal.snapshotHash || hashSnapshot(deal)};
  const graph=buildGraph({id:deal.layoutId,cells});
  const byId=Object.create(null);
  cells.forEach((c,i)=>{byId[c.id]=i;Object.freeze(c.rect);Object.freeze(c);});
  Object.freeze(cells);Object.freeze(immutableDeal);
  return {deal:immutableDeal,graph,byId,taken:new Array(cells.length).fill(false),
    blockers:graph.parents.map(a=>a.length),rack:[],cleared:0,status:'PLAYING',revision:0,shuffleOrdinal:0,
    originalDealId:deal.dealId,roundId};
}
function legalMoves(s) {
  if(s.status!=='PLAYING') return [];
  return s.deal.cells.filter((c,i)=>!s.taken[i]&&s.blockers[i]===0).map(c=>c.id).sort();
}
function pick(s,id) {
  function reject(code) {return {ok:false,code,state:s,events:[]};}
  if(s.status!=='PLAYING') return reject('ROUND_FINISHED');
  const i=s.byId[id];if(i===undefined) return reject('UNKNOWN_TILE');
  if(s.taken[i]) return reject('ALREADY_TAKEN');
  if(s.blockers[i]) return reject('BLOCKED');
  const taken=s.taken.slice(),blockers=s.blockers.slice(),rack=s.rack.slice(),cell=s.deal.cells[i];
  taken[i]=true;
  for(const j of s.graph.children[i]) if(!taken[j]) {blockers[j]--;if(blockers[j]<0) throw new Error('NEGATIVE_BLOCKERS');}
  let at=-1;for(let j=0;j<rack.length;j++) if(s.deal.cells[s.byId[rack[j]]].type===cell.type) at=j;
  rack.splice(at<0?rack.length:at+1,0,id);
  const matching=rack.filter(v=>s.deal.cells[s.byId[v]].type===cell.type);
  const clear=matching.length===3?matching:[],cleared=s.cleared+clear.length;
  const finalRack=clear.length?rack.filter(v=>!clear.includes(v)):rack;
  const status=finalRack.length>=7?'LOST':cleared===s.deal.cells.length&&finalRack.length===0?'WON':'PLAYING';
  const state={...s,taken,blockers,rack:finalRack,cleared,status,revision:s.revision+1};
  if(taken.filter(Boolean).length!==cleared+finalRack.length) throw new Error('CARD_CONSERVATION');
  return {ok:true,code:'PICKED',state,events:[{type:'TAKE',id},...(clear.length?[{type:'CLEAR',ids:clear}]:[]),
    ...(status!=='PLAYING'?[{type:status}]:[])]};
}
/** Working shuffle candidate: non-taken board and side labels only. No rescue guarantee.
 * Snapshot hash covers immutable layout+labels, NOT rack/taken/revision or authentication.
 * Caller persists the returned actual mapping, not just a seed or an ordinal.
 */
function shuffleRemaining(s,rng) {
  if(s.status!=='PLAYING') throw new Error('ROUND_FINISHED');
  if(!rng||typeof rng.shuffle!=='function') throw new TypeError('SHUFFLE_RNG_REQUIRED');
  const ids=[];s.deal.cells.forEach((c,i)=>{if(!s.taken[i]) ids.push(i);});
  const original=ids.map(i=>s.deal.cells[i].type),labels=rng.shuffle(original.slice());
  // The injected RNG may be buggy. It must return a permutation, not new cards.
  if(!Array.isArray(labels)||labels.length!==original.length) throw new TypeError('INVALID_SHUFFLE_PERMUTATION');
  const expected=original.slice().sort(),actual=labels.slice().sort();
  if(actual.some((v,i)=>v!==expected[i])) throw new TypeError('INVALID_SHUFFLE_PERMUTATION');
  const cells=s.deal.cells.map(c=>({...c,rect:{...c.rect}}));
  ids.forEach((i,j)=>{cells[i].type=labels[j];});
  const ordinal=s.shuffleOrdinal+1,originalDealId=s.originalDealId;
  const deal={...s.deal,cells};
  deal.snapshotHash=hashSnapshot(deal);
  deal.dealId=`${originalDealId}#shuffle-${ordinal}-${deal.snapshotHash}`;
  const fresh=createRound(deal,{roundId:s.roundId});
  return {...fresh,taken:s.taken.slice(),blockers:s.blockers.slice(),rack:s.rack.slice(),cleared:s.cleared,status:s.status,
    originalDealId,revision:s.revision+1,shuffleOrdinal:ordinal};
}
module.exports={createRound,legalMoves,pick,shuffleRemaining};
