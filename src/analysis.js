'use strict';
const {playPolicy}=require('./policies');
const {generateDeal}=require('./generator');
const {buildGraph}=require('./layout');
function analyzeDeal(deal,options={}) {
  const {seed='02'.repeat(32),trials=4,policies=['random','triple','pair']}=options;
  if(!Number.isSafeInteger(trials)||trials<1||trials>1000||!Array.isArray(policies)||!policies.length)
    throw new RangeError('INVALID_ANALYSIS_OPTIONS');
  const results={};
  for(const policy of policies) {
    const runs=[];for(let t=0;t<trials;t++) runs.push(playPolicy(deal,policy,seed,t));
    results[policy]={trials,wins:runs.filter(r=>r.status==='WON').length,
      meanClearFraction:runs.reduce((s,r)=>s+r.clearFraction,0)/trials,
      meanSteps:runs.reduce((s,r)=>s+r.steps,0)/trials,runs};
  }
  const graph=buildGraph({id:deal.layoutId,cells:deal.cells});
  return {interpretation:'BOT_MEASUREMENTS_NOT_HUMAN_WIN_RATES',observationModel:'TOP_ONLY_V1',
    tiles:deal.cells.length,initialLegal:graph.parents.filter(p=>!p.length).length,
    edges:graph.parents.reduce((s,p)=>s+p.length,0),policies:results};
}
/** Offline candidate screening; band applies to pair-bot mean clear fraction only.
 * No player-facing difficulty selector, no per-player advertising manipulation.
 */
function selectCandidate(options) {
  const {maxCandidates=8,trials=3,band=[0,1],minPeakStable=0,...generation}=options;
  if(!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>200||
      !Array.isArray(band)||band.length!==2||!band.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||band[0]>band[1]||
      !Number.isFinite(minPeakStable)||minPeakStable<0) throw new RangeError('INVALID_SELECTION_PARAMETERS');
  const reports=[];
  for(let candidateId=0;candidateId<maxCandidates;candidateId++) {
    const g=generateDeal({...generation,candidateId});
    const evaluation=analyzeDeal(g.deal,{seed:generation.seed,trials,policies:['pair']});
    const proxy=evaluation.policies.pair.meanClearFraction;
    const meetsBand=proxy>=band[0]&&proxy<=band[1]&&g.receipt.verification.peakStable>=minPeakStable;
    reports.push({candidateId,dealId:g.deal.dealId,proxy,peakStable:g.receipt.verification.peakStable,meetsBand});
    if(meetsBand) return {status:'TARGET_MET',selected:g,evaluation,reports};
  }
  return {status:'TARGET_UNMET',selected:null,reports};
}
module.exports={analyzeDeal,selectCandidate};
