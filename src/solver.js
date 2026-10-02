'use strict';
// Offline bounded exact search, fixed labels and no props. Not a client dependency.
const {buildGraph}=require('./layout');
const {replay}=require('./replay');
const {validateSnapshotFields}=require('./schema');
function solve(deal,options={}) {
  const {maxNodes=100000,capacity=7,maxMilliseconds=null}=options;
  if(!Number.isSafeInteger(maxNodes)||maxNodes<0||!Number.isSafeInteger(capacity)||capacity<1)
    throw new RangeError('INVALID_SEARCH_BUDGET_OR_CAPACITY');
  if(maxMilliseconds!==null&&(!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0)) throw new RangeError('INVALID_TIME_BUDGET');
  validateSnapshotFields(deal);
  const graph=buildGraph({id:deal.layoutId,cells:deal.cells}),n=deal.cells.length;
  // Recursion bound is explicit; caller must split/queue larger workloads.
  if(n>900) throw new RangeError('SOLVER_LIMIT_900');
  const types=[...new Set(deal.cells.map(c=>c.type))].sort(),typeOf=deal.cells.map(c=>types.indexOf(c.type));
  const total=new Array(types.length).fill(0); typeOf.forEach(t=>total[t]++);
  if(types.some(t=>typeof t!=='string'||!t)||total.some(v=>v%3)) throw new TypeError('UNBALANCED_OR_INVALID_TYPES');
  const bit=deal.cells.map((_,i)=>1n<<BigInt(i)),requires=graph.parents.map(p=>p.reduce((a,i)=>a|bit[i],0n));
  const full=(1n<<BigInt(n))-1n,dead=new Set(),counts=new Array(types.length).fill(0),path=[];
  let visited=0,cutoff=null,answer=null; const start=Date.now();
  function dfs(mask,q) {
    if(mask===full) {if(q===0){answer=path.slice();return true;}return false;}
    if(visited>=maxNodes) {cutoff='NODE_BUDGET';return false;}
    if(maxMilliseconds!==null&&Date.now()-start>=maxMilliseconds) {cutoff='TIME_BUDGET';return false;}
    if(dead.has(mask)) return false;
    visited++;
    const moves=[];
    for(let i=0;i<n;i++) {
      if((mask&bit[i])!==0n || (mask&requires[i])!==requires[i]) continue;
      const t=typeOf[i],next=(counts[t]+1)%3,qn=q+next-counts[t];
      if(q+1>capacity||qn>=capacity) continue;
      moves.push({i,t,next,qn,score:counts[t]===2?1000:counts[t]===1?10:0});
    }
    moves.sort((a,b)=>b.score-a.score || (deal.cells[a.i].id<deal.cells[b.i].id?-1:1));
    for(const m of moves) {
      const prev=counts[m.t]; counts[m.t]=m.next;path.push(m.i);
      if(dfs(mask|bit[m.i],m.qn)) return true;
      counts[m.t]=prev;path.pop();
      if(cutoff) return false; // never memoize partially searched states as dead
    }
    dead.add(mask);return false;
  }
  const found=dfs(0n,0);
  if(found) {
    const witness=answer.map(i=>deal.cells[i].id),v=replay(deal,witness,{capacity});
    if(!v.ok) throw new Error(`SOLVER_WITNESS_INVALID:${v.code}`);
    return {status:'SOLVED',visited,memoizedDead:dead.size,capacity,witness,verification:v};
  }
  return {status:cutoff?'UNKNOWN':'UNSOLVABLE',reason:cutoff||'EXHAUSTED',visited,memoizedDead:dead.size,capacity};
}
module.exports={solve};
