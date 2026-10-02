'use strict';
// Pure command state machine. Completion evidence and board effect are separate commits.
// This is a local development/integration service, NOT a trusted production reward server.
const B=require('./board'),E=require('./effects'),{sha256Hex}=require('../content-hash');
const VERSION='full-round-v012',LIMITS=Object.freeze({move:1,undo:1,shuffle:1,revive:1});
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const name=s=>typeof s==='string'&&s.trim().length>0&&s.length<=160;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function createIntegrated(deal,roundId){
  if(!name(roundId))throw TypeError('ROUND_ID_REQUIRED');
  const board=B.createPlayRound(deal,roundId);
  return {version:VERSION,roundId,initialDeal:board.deal,board,revision:0,
    used:{move:0,undo:0,shuffle:0,revive:0},pending:null,resolved:Object.create(null),
    receipts:Object.create(null),commands:[],events:[{id:roundId+':e0',type:'ROUND_STARTED',roundId}],unresumed:[]};
}
function checkOffer(s,assist,channel){
  if(!has(LIMITS,assist))return 'UNKNOWN_ASSIST';
  if(!['video','share'].includes(channel))return 'UNKNOWN_CHANNEL';
  if(s.pending)return 'REWARD_PENDING';
  if(s.used[assist]>=LIMITS[assist])return 'ASSIST_EXHAUSTED';
  return E.eligible(s.board,assist);
}
function valid(c){
  if(!c||!name(c.id)||!name(c.roundId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0)return false;
  const types={PICK:['tileId'],OFFER:['assist','channel','permutation'],LAUNCH:['token'],SHARE_HIDE:['token'],SHARE_RETURN:['token'],
    AD_CLOSE:['token','isEnded'],FAIL:['token'],CANCEL:['token'],COMMIT:['token'],APPLY_FAILED:['token'],INTERRUPT:['token']};
  if(!has(types,c.type))return false;
  if(Object.keys(c).some(k=>!['id','roundId','expectedRevision','type',...types[c.type]].includes(k)))return false;
  if(c.type==='PICK'&&(typeof c.tileId!=='string'||!c.tileId.length))return false;
  if(c.type!=='PICK'&&c.type!=='OFFER'&&!name(c.token))return false;
  if(c.type==='AD_CLOSE'&&c.isEnded!==undefined&&typeof c.isEnded!=='boolean')return false;
  return true;
}
function dispatch(s,input){
  const reject=code=>({ok:false,code,state:s,events:[],replayed:false});
  if(!valid(input))return reject('INVALID_COMMAND');
  const c=clone(input),signature=stable(c);
  if(c.roundId!==s.roundId)return reject('WRONG_ROUND');
  if(has(s.receipts,c.id)){const old=s.receipts[c.id];return old.signature===signature?
    {ok:true,code:old.code,state:s,events:[],replayed:true}:reject('COMMAND_ID_CONFLICT');}
  if(c.expectedRevision!==s.revision)return reject('STALE_REVISION');
  if(s.commands.length>=10000)return reject('COMMAND_LIMIT');
  let board=s.board,used=s.used,pending=s.pending,resolved=s.resolved,unresumed=s.unresumed,code,events=[];
  const emit=(type,data={})=>events.push({id:s.roundId+':e'+(s.events.length+events.length),type,roundId:s.roundId,...data});
  const close=(status,eventType)=>{
    resolved=Object.assign(Object.create(null),resolved,{[pending.token]:{status,assist:pending.assist,channel:pending.channel}});
    emit(eventType,{token:pending.token,assist:pending.assist,channel:pending.channel});pending=null;
  };
  if(c.type==='PICK'){
    if(pending)return reject('REWARD_PENDING');
    const r=B.pickTile(board,c.tileId);if(!r.ok)return reject(r.code);board=r.state;code='PICKED';
    for(const e of r.events)emit(e.type,e);
    for(const token of unresumed)emit('PLAY_RESUMED_AFTER_GRANT',{token});unresumed=[];
  }else if(c.type==='OFFER'){
    const reason=checkOffer(s,c.assist,c.channel);if(reason)return reject(reason);
    if(c.assist==='shuffle'){
      if(!Array.isArray(c.permutation)||c.permutation.length>3000)return reject('INVALID_SHUFFLE_PERMUTATION');
      const probe=E.apply(board,'shuffle',c.permutation);if(!probe.ok)return reject(probe.code);
    }else if(c.permutation!==undefined)return reject('UNEXPECTED_PERMUTATION');
    pending={token:sha256Hex(stable([VERSION,s.roundId,c.id,s.revision])),assist:c.assist,channel:c.channel,roundId:s.roundId,
      boardRevision:board.revision,phase:'OFFERED',leftGame:false,recoveryReason:null,
      ...(c.permutation===undefined?{}:{permutation:c.permutation.slice()})};
    emit('REWARD_OFFERED',{token:pending.token,assist:c.assist,channel:c.channel});code='OFFERED';
  }else{
    if(has(resolved,c.token))return reject('REWARD_ALREADY_RESOLVED');
    if(!pending)return reject('NO_PENDING_REWARD');
    if(c.token!==pending.token)return reject('WRONG_REWARD_TOKEN');
    if(pending.roundId!==s.roundId||pending.boardRevision!==board.revision)return reject('REWARD_STATE_CHANGED');
    pending={...pending};
    if(c.type==='LAUNCH'){
      if(pending.phase!=='OFFERED')return reject('INVALID_TRANSITION');
      pending.phase='WAITING';code='WAITING';emit(pending.channel==='share'?'SHARE_INITIATED':'VIDEO_REQUESTED',{token:pending.token});
    }else if(c.type==='SHARE_HIDE'){
      if(pending.phase!=='WAITING'||pending.channel!=='share')return reject('INVALID_TRANSITION');
      pending.leftGame=true;code='SHARE_LEFT';emit('SHARE_LEFT_GAME',{token:pending.token});
    }else if(c.type==='SHARE_RETURN'){
      if(pending.phase!=='WAITING'||pending.channel!=='share'||!pending.leftGame)return reject('SHARE_RETURN_NOT_QUALIFIED');
      pending.phase='EARNED';code='EARNED';emit('SHARE_RETURN_UNVERIFIED',{token:pending.token,assist:pending.assist});
      emit('ENTITLEMENT_EARNED',{token:pending.token,source:'accepted-return-candidate',verifiedSend:false});
    }else if(c.type==='AD_CLOSE'){
      if(pending.phase!=='WAITING'||pending.channel!=='video')return reject('INVALID_TRANSITION');
      if(c.isEnded===true){pending.phase='EARNED';code='EARNED';emit('VIDEO_COMPLETE_OBSERVED',{token:pending.token});emit('ENTITLEMENT_EARNED',{token:pending.token,source:'client-completion-observation'});}
      else {code=c.isEnded===false?'VIDEO_INCOMPLETE':'VIDEO_UNVERIFIED';close(code,code);}
    }else if(c.type==='COMMIT'){
      if(pending.phase!=='EARNED')return reject('REWARD_NOT_EARNED');
      if(used[pending.assist]>=LIMITS[pending.assist])return reject('ASSIST_EXHAUSTED');
      const r=E.apply(board,pending.assist,pending.permutation);if(!r.ok)return reject(r.code);
      board=r.state;used={...used,[pending.assist]:used[pending.assist]+1};
      for(const e of r.events)emit(e.type,e);
      unresumed=[...unresumed,pending.token];close('APPLIED','GRANT_APPLIED');code='APPLIED';
    }else if(c.type==='APPLY_FAILED'){
      if(pending.phase!=='EARNED')return reject('REWARD_NOT_EARNED');
      pending.recoveryReason='APPLY_OR_STORAGE_FAILED';code='RECOVERY_REQUIRED';emit('GRANT_RETRY_REQUIRED',{token:pending.token});
    }else if(['FAIL','CANCEL','INTERRUPT'].includes(c.type)){
      if(pending.phase==='EARNED')return reject('EARNED_REWARD_MUST_BE_RECOVERED');
      code=c.type==='INTERRUPT'?'INTERRUPTED_UNVERIFIED':c.type==='FAIL'?'REQUEST_FAILED':'CANCELLED';close(code,code);
    }else return reject('INVALID_TRANSITION');
  }
  B.checkRound(board);
  const receipts=Object.assign(Object.create(null),s.receipts,{[c.id]:{signature,code}});
  return {ok:true,code,replayed:false,events,state:{...s,board,used,pending,resolved,receipts,unresumed,
    revision:s.revision+1,commands:[...s.commands,c],events:[...s.events,...events]}};
}
function fingerprint(s){return sha256Hex(stable([s.roundId,s.revision,s.used,s.pending,s.resolved,s.unresumed,
  s.board.deal.snapshotHash,s.board.taken,s.board.rack,s.board.buffer,s.board.status,s.board.revision,s.board.cleared,s.board.undo,
  s.board.reviveCandidate||null]));}
function serialize(s){const payload={version:VERSION,roundId:s.roundId,initialDeal:s.initialDeal,commands:s.commands,fingerprint:fingerprint(s)};
  const text=JSON.stringify({payload,checksum:sha256Hex(stable(payload))});if(text.length>8*1024*1024)throw Error('SAVE_TOO_LARGE');return text;}
function restore(text){try{if(typeof text!=='string'||text.length>8*1024*1024)throw Error('INVALID_SAVE');const o=JSON.parse(text),p=o.payload;
  if(!p||sha256Hex(stable(p))!==o.checksum)throw Error('SAVE_CHECKSUM_MISMATCH');
  if(p.version!==VERSION||!Array.isArray(p.commands)||p.commands.length>10000)throw Error('INVALID_SAVE_VERSION');
  let s=createIntegrated(p.initialDeal,p.roundId);for(const c of p.commands){const r=dispatch(s,c);if(!r.ok||r.replayed)throw Error('SAVE_REPLAY_REJECTED:'+r.code);s=r.state;}
  if(fingerprint(s)!==p.fingerprint)throw Error('SAVE_STATE_MISMATCH');return {ok:true,code:'RESTORED',state:s};
}catch(e){return {ok:false,code:e.message,state:null};}}
function metrics(s){const count=t=>s.events.filter(e=>e.type===t).length;return {roundId:s.roundId,offers:count('REWARD_OFFERED'),
  videoRequests:count('VIDEO_REQUESTED'),videoCompletions:count('VIDEO_COMPLETE_OBSERVED'),shareInitiated:count('SHARE_INITIATED'),
  shareReturnsUnverified:count('SHARE_RETURN_UNVERIFIED'),grants:count('GRANT_APPLIED'),continuedAfterGrant:count('PLAY_RESUMED_AFTER_GRANT'),
  failures:count('LOST'),wins:count('WON'),used:{...s.used},platformRevenueCny:null,verifiedShares:null};}
module.exports={VERSION,LIMITS,createIntegrated,dispatch,checkOffer,serialize,restore,fingerprint,metrics};
