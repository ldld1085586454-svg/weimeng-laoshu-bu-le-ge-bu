'use strict';
/**
 * Development integration reducer. Provenance and entitlement are separate from the
 * frozen v0.9 session's internal completion command. This is NOT an ad verification
 * server: share_return_only is explicitly not confirmation that a message was sent.
 */
const Session=require('../play/session');
const Board=require('../play/board');
const {sha256Hex}=require('../content-hash');
const VERSION='integration-v011',MAX_COMMANDS=10000,MAX_TEXT=8*1024*1024;
const copy=v=>JSON.parse(JSON.stringify(v));
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const name=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function createRound(deal,options={}) {
  if(options.mode!=='development')throw TypeError('PRODUCTION_GATE_CLOSED');
  const session=Session.createSession(deal,{roundId:options.roundId,rewardMode:'development_mock'});
  return {version:VERSION,mode:'development',candidateShareReturn:options.candidateShareReturn===true,
    initialDeal:session.initialDeal,session,revision:0,activeFlowId:null,flows:[],commands:[],receipts:{}};
}
function getFlow(s,id=s.activeFlowId){return s.flows.find(f=>f.id===id)||null;}
function valid(c){
  const fields={PICK:['tileId'],REQUEST:['assist','permutation'],CHOOSE:['source'],
    PROVIDER_RESULT:['flowId','kind','isEnded'],APPLY:['flowId'],APPLY_FAILED:['flowId'],CANCEL:[]};
  if(!c||!name(c.id)||!name(c.roundId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||!has(fields,c.type))return false;
  const keys=new Set(['id','roundId','expectedRevision','type',...fields[c.type]]);
  if(Object.keys(c).some(k=>!keys.has(k)))return false;
  if(c.type==='PICK'&&(typeof c.tileId!=='string'||!c.tileId.length))return false;
  if(c.type==='REQUEST'&&!['move','undo','shuffle','revive'].includes(c.assist))return false;
  if(c.permutation!==undefined&&(!Array.isArray(c.permutation)||c.permutation.length>3000||c.permutation.some(v=>typeof v!=='string'||!v.length)))return false;
  if(c.type==='CHOOSE'&&!['ad','share'].includes(c.source))return false;
  if(['PROVIDER_RESULT','APPLY','APPLY_FAILED'].includes(c.type)&&!name(c.flowId))return false;
  if(c.type==='PROVIDER_RESULT'){
    if(!['ad_closed','share_returned','failed','cancelled'].includes(c.kind))return false;
    if(c.isEnded!==undefined&&(typeof c.isEnded!=='boolean'||c.kind!=='ad_closed'))return false;
  }
  return true;
}
function dispatch(s,input) {
  const reject=code=>({ok:false,code,state:s,replayed:false});
  if(!valid(input))return reject('INVALID_COMMAND');
  const c=copy(input),signature=stable(c);
  if(c.roundId!==s.session.roundId)return reject('WRONG_ROUND');
  if(has(s.receipts,c.id))return s.receipts[c.id].signature===signature?
    {ok:true,code:s.receipts[c.id].code,state:s,replayed:true}:reject('COMMAND_ID_CONFLICT');
  if(c.expectedRevision!==s.revision)return reject('STALE_REVISION');
  if(s.commands.length>=MAX_COMMANDS)return reject('COMMAND_LIMIT');
  let session=s.session,flows=s.flows,activeFlowId=s.activeFlowId,code,flow=getFlow(s);
  // Prefix hash permits long external IDs without violating the legacy session contract.
  const internal=(type,extra={})=>Session.dispatch(session,{id:'int-'+sha256Hex(c.id),roundId:session.roundId,
    expectedRevision:session.revision,type,...extra});
  const updateFlow=f=>{flow=f;flows=flows.map(v=>v.id===f.id?f:v);};
  if(c.type==='PICK'){
    const r=internal('PICK',{tileId:c.tileId});if(!r.ok)return reject(r.code);
    session=r.session;code=r.code;
    flows=flows.map(f=>f.status==='APPLIED'?{...f,status:'RESUMED',resumed:true}:f);
  }else if(c.type==='REQUEST'){
    if(c.assist==='shuffle'){
      if(c.permutation===undefined)return reject('SHUFFLE_PERMUTATION_REQUIRED');
      const check=Board.applyAssist(session.board,'shuffle',undefined,c.permutation);
      if(!check.ok)return reject(check.code);
    }else if(c.permutation!==undefined)return reject('UNEXPECTED_PERMUTATION');
    const r=internal('REQUEST_ASSIST',{assist:c.assist});if(!r.ok)return reject(r.code);
    session=r.session;activeFlowId=session.pending.token;
    const f={id:activeFlowId,roundId:session.roundId,boardRevision:session.board.revision,assist:c.assist,
      source:null,status:'OFFERED',evidence:null,resumed:false,permutation:c.permutation||null,error:null};
    flows=[...flows,f];code='OFFERED';
  }else{
    if(!flow)return reject('NO_ACTIVE_FLOW');
    if(c.flowId!==undefined&&c.flowId!==flow.id)return reject('WRONG_FLOW');
    if(c.type==='CHOOSE'){
      if(flow.status!=='OFFERED')return reject('SOURCE_ALREADY_SELECTED');
      if(c.source==='share'&&!s.candidateShareReturn)return reject('SHARE_CANDIDATE_DISABLED');
      updateFlow({...flow,source:c.source,status:'AWAITING_PROVIDER'});code='PROVIDER_REQUESTED';
    }else if(c.type==='CANCEL'){
      if(!['OFFERED','AWAITING_PROVIDER'].includes(flow.status))return reject('ENTITLEMENT_CANNOT_CANCEL');
      const r=internal('REWARD_RESULT',{token:flow.id,result:'cancelled'});if(!r.ok)return reject(r.code);
      session=r.session;updateFlow({...flow,status:'CANCELLED'});code='CANCELLED';
    }else if(c.type==='PROVIDER_RESULT'){
      if(flow.status!=='AWAITING_PROVIDER')return reject('FLOW_ALREADY_RESOLVED');
      if((c.kind==='ad_closed'&&flow.source!=='ad')||(c.kind==='share_returned'&&flow.source!=='share'))return reject('SOURCE_MISMATCH');
      const earned=c.kind==='share_returned'||(c.kind==='ad_closed'&&c.isEnded===true);
      if(earned){
        updateFlow({...flow,status:'EARNED_PENDING',evidence:c.kind==='share_returned'?'share_return_only':'ad_client_complete'});
        code='EARNED_PENDING';
      }else{
        const r=internal('REWARD_RESULT',{token:flow.id,result:c.kind==='failed'?'failed':'cancelled'});if(!r.ok)return reject(r.code);
        session=r.session;updateFlow({...flow,status:c.kind==='failed'?'FAILED':c.kind==='ad_closed'&&c.isEnded===undefined?'UNVERIFIED':'CANCELLED'});
        code='NOT_GRANTED';
      }
    }else{
      if(!['EARNED_PENDING','RECOVERY_REQUIRED'].includes(flow.status))return reject('ENTITLEMENT_NOT_PENDING');
      if(c.type==='APPLY_FAILED'){updateFlow({...flow,status:'RECOVERY_REQUIRED',error:'APPLY_FAILED'});code='RECOVERY_REQUIRED';}
      else{
        if(session.board.revision!==flow.boardRevision||session.roundId!==flow.roundId)return reject('ORIGINAL_STATE_MISMATCH');
        const r=internal('REWARD_RESULT',{token:flow.id,result:'completed',...(flow.assist==='shuffle'?{permutation:flow.permutation}:{})});
        if(!r.ok)return reject(r.code);
        session=r.session;updateFlow({...flow,status:'APPLIED',error:null});code='APPLIED';
      }
    }
  }
  const receipts=Object.assign(Object.create(null),s.receipts,{[c.id]:{signature,code}});
  return {ok:true,code,replayed:false,state:{...s,session,flows,activeFlowId,receipts,
    revision:s.revision+1,commands:[...s.commands,c]}};
}
function summary(s) {
  return {offers:s.flows.length,adSelected:s.flows.filter(f=>f.source==='ad').length,
    shareSelected:s.flows.filter(f=>f.source==='share').length,
    observedAdCompletions:s.flows.filter(f=>f.evidence==='ad_client_complete').length,
    shareReturns:s.flows.filter(f=>f.evidence==='share_return_only').length,
    applied:s.flows.filter(f=>['APPLIED','RESUMED'].includes(f.status)).length,
    resumed:s.flows.filter(f=>f.resumed).length,
    pending:s.flows.filter(f=>['EARNED_PENDING','RECOVERY_REQUIRED'].includes(f.status)).length,
    revenueCny:null};
}
function fingerprint(s){return sha256Hex(stable([VERSION,Session.fingerprint(s.session),s.revision,s.flows,s.activeFlowId,s.candidateShareReturn]));}
function encode(s) {
  const payload={version:VERSION,roundId:s.session.roundId,initialDeal:s.initialDeal,mode:s.mode,
    candidateShareReturn:s.candidateShareReturn,commands:s.commands,fingerprint:fingerprint(s)};
  const text=JSON.stringify({payload,checksum:sha256Hex(stable(payload))});
  if(text.length>MAX_TEXT)throw Error('LOG_TOO_LARGE');
  return text;
}
function decode(text){
  try{
    if(typeof text!=='string'||text.length>MAX_TEXT)throw Error('INVALID_LOG');
    const {payload:p,checksum}=JSON.parse(text);
    if(!p||p.version!==VERSION||!Array.isArray(p.commands)||p.commands.length>MAX_COMMANDS)throw Error('INVALID_SCHEMA');
    if(sha256Hex(stable(p))!==checksum)throw Error('CHECKSUM_MISMATCH');
    let state=createRound(p.initialDeal,p);
    for(const c of p.commands){const r=dispatch(state,c);if(!r.ok||r.replayed)throw Error('REPLAY_REJECTED:'+r.code);state=r.state;}
    if(fingerprint(state)!==p.fingerprint)throw Error('FINGERPRINT_MISMATCH');
    return {ok:true,code:'DIAGNOSTIC_RESTORED',state};
  }catch(e){return {ok:false,code:e.message,state:null};}
}
module.exports={VERSION,createRound,dispatch,getFlow,summary,encode,decode,fingerprint};
