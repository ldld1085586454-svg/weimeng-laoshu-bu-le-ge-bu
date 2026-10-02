'use strict';
const {buildGraph}=require('./layout');
const {createRandom,hashJSON}=require('./random');
const {replay}=require('./replay');
const {hashSnapshot}=require('./content-hash');
const ALGORITHM='ASTRA_DEAL_V1.1';

function generateDeal(options) {
  const {layout,quotas,seed,targetOccupancy=5,candidateId=0,mutationAttempts=0}=options||{};
  const graph=buildGraph(layout),n=layout.cells.length;
  if(!quotas||typeof quotas!=='object') throw new TypeError('QUOTAS_REQUIRED');
  const types=Object.keys(quotas).sort(),amounts=types.map(t=>quotas[t]);
  if(!types.length||types.some(t=>!t)||amounts.some(x=>!Number.isSafeInteger(x)||x<=0||x%3)||amounts.reduce((a,b)=>a+b,0)!==n)
    throw new RangeError('QUOTAS_MUST_MATCH_LAYOUT_IN_TRIPLES');
  if(!Number.isSafeInteger(targetOccupancy)||targetOccupancy<0||targetOccupancy>6) throw new RangeError('TARGET_OCCUPANCY_0_TO_6');
  if(!Number.isSafeInteger(candidateId)||candidateId<0||!Number.isSafeInteger(mutationAttempts)||mutationAttempts<0||mutationAttempts>10000)
    throw new RangeError('INVALID_GENERATION_BUDGET');
  const routeRng=createRandom(seed,`route:${candidateId}`),patternRng=createRandom(seed,`pattern:${candidateId}`);
  const mutationRng=createRandom(seed,`mutation:${candidateId}`);
  const degree=graph.parents.map(p=>p.length),frontier=[],route=[];
  degree.forEach((d,i)=>{if(d===0) frontier.push(i);});
  while(frontier.length) {
    frontier.sort((a,b)=>layout.cells[a].id<layout.cells[b].id?-1:1);
    const [i]=frontier.splice(routeRng.int(frontier.length),1); route.push(i);
    for(const j of graph.children[i]) if(--degree[j]===0) frontier.push(j);
  }
  if(route.length!==n) throw new Error('CYCLIC_LAYOUT');
  const remaining=amounts.slice(),counts=new Array(types.length).fill(0),word=[];
  let q=0;
  for(let step=0;step<n;step++) {
    const candidates=[],weights=[];
    for(let t=0;t<types.length;t++) {
      if(!remaining[t]) continue;
      const next=(counts[t]+1)%3,qn=q+next-counts[t];
      if(qn>6) continue;
      if(qn===6 && !counts.some((v,k)=>(k===t?next:v)===2)) continue;
      candidates.push(t); weights.push(1+6-Math.abs(qn-targetOccupancy));
    }
    if(!candidates.length) throw new Error('SAFE_WORD_INVARIANT_FAILED');
    const t=patternRng.weighted(candidates,weights),next=(counts[t]+1)%3;
    q+=next-counts[t]; counts[t]=next; remaining[t]--; word.push(types[t]);
  }
  if(q!==0||remaining.some(Boolean)) throw new Error('WORD_DID_NOT_CLEAR');
  const cells=layout.cells.map(c=>({...c,rect:{...c.rect},type:''}));
  route.forEach((i,j)=>{cells[i].type=word[j];});
  const deal={schema:'astra-deal-1',dealId:'pending',layoutId:layout.id,origin:layout.origin||'UNVERIFIED_LAYOUT',slotCapacity:7,cells};
  const witness=route.map(i=>cells[i].id);
  let verification=replay(deal,witness); if(!verification.ok) throw new Error(`INDEPENDENT_CHECK_FAILED:${verification.code}`);
  let accepted=0,changed=0;
  for(let k=0;k<mutationAttempts;k++) {
    const i=mutationRng.int(n),j=mutationRng.int(n); if(i===j||cells[i].type===cells[j].type) continue;
    changed++; [cells[i].type,cells[j].type]=[cells[j].type,cells[i].type];
    const check=replay(deal,witness);
    if(check.ok) {accepted++;verification=check;}
    else [cells[i].type,cells[j].type]=[cells[j].type,cells[i].type];
  }
  // Identity binds the final, mutated snapshot. Receipt and seed remain separate.
  const contentHash=hashJSON({schema:deal.schema,layoutId:deal.layoutId,origin:deal.origin,slotCapacity:7,cells});
  deal.dealId=`astra-${contentHash.slice(0,24)}`;
  deal.snapshotHash=hashSnapshot(deal);
  return {deal,receipt:{algorithm:ALGORITHM,randomVersion:routeRng.version,seed,candidateId,targetOccupancy,
    layoutHash:hashJSON(layout),quotas:{...quotas},dealHash:hashJSON(deal),witness,verification,
    mutation:{attempted:mutationAttempts,nontrivial:changed,accepted}}};
}
module.exports={generateDeal,ALGORITHM};
