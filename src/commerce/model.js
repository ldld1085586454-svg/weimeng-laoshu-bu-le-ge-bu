'use strict';
/* Commercial workflow reference model, NOT a production backend or ad-authenticity proof.
 * It records completion evidence separately from application and monetary settlement.
 * No generation, tile, gameplay or existing session code is changed by this module.
 */
const copy=v=>JSON.parse(JSON.stringify(v));
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const id=v=>typeof v==='string'&&v.trim().length>0&&v.length<=180;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const ratio=(n,d)=>d>0?n/d:null;
function decideOffer(ctx,cfg) {
  const deny=reason=>({allowed:false,reason});
  if(!ctx||!cfg||!id(ctx.placement)||!has(cfg.placements||{},ctx.placement))return deny('UNKNOWN_PLACEMENT');
  if(!id(ctx.roundId)||!Number.isSafeInteger(ctx.boardRevision)||ctx.boardRevision<0||!Number.isSafeInteger(ctx.used)||ctx.used<0)return deny('INVALID_CONTEXT');
  const p=cfg.placements[ctx.placement];
  if(!p.effectBound)return deny('EFFECT_UNBOUND');
  if(ctx.used>=p.maxPerRound)return deny('ROUND_LIMIT');
  if(ctx.phase!==p.phase)return deny('WRONG_PHASE');
  if(ctx.effectReady!==true)return deny('EFFECT_NOT_APPLICABLE');
  if(!['simulation','production'].includes(ctx.mode))return deny('UNKNOWN_MODE');
  if(ctx.mode==='production') {
    if(!cfg.productionEnabled||!id(p.adUnitId)||!id(ctx.appId)||!Object.values(cfg.releaseApprovals||{}).length||Object.values(cfg.releaseApprovals).some(v=>v!==true))return deny('PRODUCTION_GATE_CLOSED');
    // Policy cap is optional, separate from provider-side limits, and never guessed.
    if(cfg.dailyProductCap!==null&&(!Number.isSafeInteger(ctx.dailyGrants)||ctx.dailyGrants>=cfg.dailyProductCap))return deny('DAY_LIMIT_OR_UNKNOWN');
  }
  return {allowed:true,reason:'ELIGIBLE',placement:ctx.placement,maxPerRound:p.maxPerRound,configVersion:cfg.version};
}
function createFlow(input) {
  if(!input||!['id','roundId','placement','configVersion'].every(k=>id(input[k]))||!/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)||!Number.isSafeInteger(input.boardRevision)||input.boardRevision<0)throw TypeError('INVALID_FLOW');
  return {...copy(input),state:'OFFERED',events:[],receipts:{},recoveryReason:null};
}
function advance(flow,event) {
  if(!event||!id(event.id)||!id(event.kind)||!Number.isFinite(event.at)||event.at<0)throw TypeError('INVALID_EVENT');
  const e=copy(event),signature=stable(e);
  if(has(flow.receipts,e.id)) {
    if(flow.receipts[e.id]!==signature)throw Error('EVENT_ID_CONFLICT');
    return {flow,replayed:true};
  }
  const s=flow.state,k=e.kind;
  let next=null,recoveryReason=null;
  const oneOf=(...states)=>states.includes(s);
  if(k==='ACCEPT'&&s==='OFFERED')next='LOADING';
  if(k==='DECLINE'&&s==='OFFERED')next='CANCELLED';
  if(k==='AD_READY'&&s==='LOADING')next='READY';
  // SHOW is a client-observed successful presentation, not a billed impression.
  if(k==='SHOW'&&s==='READY')next='SHOWING';
  if(k==='AD_FAILED'&&oneOf('LOADING','READY','SHOWING'))next='FAILED';
  if(k==='AD_CLOSE'&&s==='SHOWING')next=e.isEnded===true?'EARNED_PENDING':e.isEnded===false?'CANCELLED':'UNVERIFIED';
  if(k==='SHARE_RETURN'&&oneOf('OFFERED','LOADING','READY','SHOWING'))next='UNVERIFIED';
  if(k==='GRANT_FAILED'&&oneOf('EARNED_PENDING','RECOVERY_REQUIRED')){next='RECOVERY_REQUIRED';recoveryReason='APPLY_OR_NETWORK_FAILED';}
  if(k==='GRANT_COMMITTED'&&oneOf('EARNED_PENDING','RECOVERY_REQUIRED')){
    const match=e.roundId===flow.roundId&&e.beforeRevision===flow.boardRevision;
    next=match?'APPLIED':'RECOVERY_REQUIRED';recoveryReason=match?null:'ORIGINAL_ROUND_OR_REVISION_MISMATCH';
  }
  if(k==='PLAY_RESUMED'&&s==='APPLIED'&&e.roundId===flow.roundId)next='RESUMED';
  if(next===null)throw Error('INVALID_TRANSITION:'+s+'->'+k);
  const receipts=Object.assign(Object.create(null),flow.receipts,{[e.id]:signature});
  return {replayed:false,flow:{...flow,state:next,recoveryReason,receipts,events:[...flow.events,{...e,toState:next}]}};
}
function summarizeFlows(flows) {
  if(!Array.isArray(flows))throw TypeError('INVALID_FLOWS');
  const seen=new Set(),m={offers:0,optedIn:0,clientPresented:0,observedComplete:0,grants:0,resumed:0,failedAttempts:0,pendingGrants:0,unverified:0,revenueCny:null};
  for(const f of flows){
    if(seen.has(f.id))throw Error('DUPLICATE_FLOW');seen.add(f.id);m.offers++;
    const contains=(k,s)=>f.events.some(e=>e.kind===k&&(!s||e.toState===s));
    if(contains('ACCEPT'))m.optedIn++;
    if(contains('SHOW'))m.clientPresented++;
    if(contains('AD_CLOSE','EARNED_PENDING'))m.observedComplete++;
    if(contains('GRANT_COMMITTED','APPLIED'))m.grants++;
    if(contains('PLAY_RESUMED','RESUMED'))m.resumed++;
    if(f.state==='FAILED')m.failedAttempts++;
    if(['EARNED_PENDING','RECOVERY_REQUIRED'].includes(f.state))m.pendingGrants++;
    if(f.state==='UNVERIFIED')m.unverified++;
  }
  return {...m,optInRate:ratio(m.optedIn,m.offers),clientPresentationRate:ratio(m.clientPresented,m.optedIn),completionRate:ratio(m.observedComplete,m.clientPresented),grantRate:ratio(m.grants,m.observedComplete),resumeRate:ratio(m.resumed,m.grants)};
}
function reconcile(report) {
  if(!report||report.currency!=='CNY')throw TypeError('EXPLICIT_CNY_CURRENCY_REQUIRED');
  if(report.timezone!=='Asia/Shanghai')throw TypeError('EXPLICIT_REPORT_TIMEZONE_REQUIRED');
  if(!['partial','final'].includes(report.status))throw TypeError('EXPLICIT_COVERAGE_STATUS_REQUIRED');
  const money=['estimatedNetFen','settledNetFen','cashReceivedFen','paidTrafficFen','variableCostFen'];
  for(const k of money)if(report[k]!=null&&(!Number.isSafeInteger(report[k])||(['paidTrafficFen','variableCostFen'].includes(k)&&report[k]<0)))throw TypeError('INTEGER_FEN_REQUIRED:'+k);
  if(report.platformImpressions!=null&&(!Number.isSafeInteger(report.platformImpressions)||report.platformImpressions<0))throw TypeError('INVALID_PLATFORM_IMPRESSIONS');
  const cny=k=>report[k]==null?null:report[k]/100;
  const r={...copy(report),estimatedNetCny:cny('estimatedNetFen'),settledNetCny:cny('settledNetFen'),cashReceivedCny:cny('cashReceivedFen')};
  r.ecpmNetCny=report.platformImpressions>0&&r.estimatedNetCny!==null?r.estimatedNetCny*1000/report.platformImpressions:null;
  r.settledContributionCny=report.settledNetFen!=null&&report.paidTrafficFen!=null&&report.variableCostFen!=null?(report.settledNetFen-report.paidTrafficFen-report.variableCostFen)/100:null;
  r.note='Net means developer-side report amount; no second share deduction. Contribution excludes fixed cost/tax not included in input. Cash is not revenue addition.';
  return r;
}
module.exports={decideOffer,createFlow,advance,summarizeFlows,reconcile};
