'use strict';
const Board=require('./board');
const {PROFILE,LIMITS}=require('./profile');
const {sha256Hex}=require('../content-hash');
const VERSION='play-session-v09';
const MAX_COMMANDS=10000,MAX_BYTES=8*1024*1024;
function clone(v){return JSON.parse(JSON.stringify(v));}
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
function nonempty(s){return typeof s==='string'&&s.trim().length>0;}
function name(s){return nonempty(s)&&s.length<=160;}
function createSession(deal,options={}) {
  if(!name(options.roundId))throw new TypeError('ROUND_ID_REQUIRED');
  if(options.rewardMode!=='development_mock')throw new TypeError('REAL_REWARD_ADAPTER_NOT_IMPLEMENTED');
  if(options.profileId!==undefined&&options.profileId!==PROFILE.id)throw new TypeError('UNKNOWN_PROFILE');
  const board=Board.createPlayRound(deal,options.roundId);
  return {version:VERSION,roundId:options.roundId,profileId:PROFILE.id,rewardMode:options.rewardMode,initialDeal:board.deal,
    board,revision:0,used:{move:0,undo:0,shuffle:0,revive:0},pending:null,commands:[],
    receipts:Object.create(null),resolvedRewards:Object.create(null)};
}
function validCommand(c) {
  if(!c||!name(c.id)||!name(c.roundId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0)return false;
  const fields={PICK:['tileId'],REQUEST_ASSIST:['assist'],REWARD_RESULT:['token','result','permutation']};
  if(!Object.prototype.hasOwnProperty.call(fields,c.type))return false;
  const allowed=new Set(['id','roundId','expectedRevision','type',...fields[c.type]]);
  if(Object.keys(c).some(k=>!allowed.has(k)))return false;
  if(c.type==='PICK'&&!nonempty(c.tileId))return false;
  if(c.type==='REQUEST_ASSIST'&&!['move','undo','shuffle','revive'].includes(c.assist))return false;
  if(c.type==='REWARD_RESULT'){
    if(!name(c.token)||!['completed','cancelled','failed','share_returned'].includes(c.result))return false;
    if(c.permutation!==undefined&&(!Array.isArray(c.permutation)||c.permutation.length>3000||c.permutation.some(t=>!nonempty(t))))return false;
  }
  return true;
}
function dispatch(s,command) {
  const reject=code=>({ok:false,code,session:s,events:[],replayed:false});
  if(!validCommand(command))return reject('INVALID_COMMAND');
  const c=clone(command),signature=canonical(c);
  if(c.roundId!==s.roundId)return reject('WRONG_ROUND');
  if(Object.prototype.hasOwnProperty.call(s.receipts,c.id)){
    const receipt=s.receipts[c.id];
    if(receipt.signature!==signature)return reject('COMMAND_ID_CONFLICT');
    return {ok:true,code:receipt.code,session:s,events:[],replayed:true};
  }
  if(c.expectedRevision!==s.revision)return reject('STALE_REVISION');
  if(s.commands.length>=MAX_COMMANDS)return reject('SESSION_COMMAND_LIMIT');
  let board=s.board,used=s.used,pending=s.pending,resolvedRewards=s.resolvedRewards,code,events=[];
  if(c.type==='PICK'){
    if(pending)return reject('REWARD_PENDING');
    const result=Board.pickTile(board,c.tileId,PROFILE);if(!result.ok)return reject(result.code);
    board=result.state;code=result.code;events=result.events;
  }else if(c.type==='REQUEST_ASSIST'){
    if(pending)return reject('REWARD_PENDING');
    if(used[c.assist]>=LIMITS[c.assist])return reject('ASSIST_EXHAUSTED');
    const preflight=Board.canAssist(board,c.assist,PROFILE);if(preflight)return reject(preflight);
    const token=sha256Hex(canonical([VERSION,s.roundId,c.id,s.revision,c.assist]));
    pending={token,assist:c.assist,roundId:s.roundId,boardRevision:board.revision,mode:s.rewardMode};
    code='REWARD_REQUESTED';events=[{type:'MOCK_REWARD_REQUESTED',...pending}];
  }else{
    if(Object.prototype.hasOwnProperty.call(resolvedRewards,c.token))return reject('REWARD_ALREADY_RESOLVED');
    if(!pending)return reject('NO_PENDING_REWARD');
    if(c.token!==pending.token)return reject('WRONG_REWARD_TOKEN');
    if(pending.roundId!==s.roundId||pending.boardRevision!==board.revision)return reject('REWARD_STATE_CHANGED');
    if(c.result==='completed'){
      if(used[pending.assist]>=LIMITS[pending.assist])return reject('ASSIST_EXHAUSTED');
      if(pending.assist!=='shuffle'&&c.permutation!==undefined)return reject('UNEXPECTED_PERMUTATION');
      const result=Board.applyAssist(board,pending.assist,PROFILE,c.permutation);
      if(!result.ok)return reject(result.code);
      board=result.state;used={...used,[pending.assist]:used[pending.assist]+1};
      code='REWARD_APPLIED';events=[...result.events,{type:'ASSIST_USED',assist:pending.assist}];
    }else {if(c.permutation!==undefined)return reject('UNEXPECTED_PERMUTATION');code='REWARD_NOT_GRANTED';events=[{type:'REWARD_NOT_GRANTED',reason:c.result}];}
    resolvedRewards=Object.assign(Object.create(null),resolvedRewards,{[c.token]:c.result});pending=null;
  }
  const receipts=Object.assign(Object.create(null),s.receipts,{[c.id]:{signature,code}});
  const session={...s,board,used,pending,resolvedRewards,receipts,revision:s.revision+1,commands:[...s.commands,c]};
  return {ok:true,code,session,events,replayed:false};
}
/** Diagnostic fingerprint/checksum, not authorization, anti-cheat, or proof of ad completion. */
function fingerprint(s) {
  const b=s.board;
  return sha256Hex(canonical([VERSION,s.roundId,s.profileId,s.revision,s.used,s.pending,s.resolvedRewards,
    b.deal.snapshotHash,b.originalDealId,b.revision,b.shuffleOrdinal,b.taken,b.rack,b.buffer,b.cleared,b.status,b.undo]));
}
function exportSession(s) {
  const payload={version:VERSION,profileId:s.profileId,rewardMode:s.rewardMode,roundId:s.roundId,
    initialDeal:s.initialDeal,commands:s.commands,finalFingerprint:fingerprint(s)};
  const text=JSON.stringify({payload,checksum:sha256Hex(canonical(payload))});
  if(text.length>MAX_BYTES)throw new Error('DIAGNOSTIC_LOG_TOO_LARGE');
  return text;
}
function restoreSession(text) {
  try {
    if(typeof text!=='string'||text.length>MAX_BYTES)throw new Error('INVALID_DIAGNOSTIC_INPUT');
    const envelope=JSON.parse(text),p=envelope.payload;
    if(!p||sha256Hex(canonical(p))!==envelope.checksum)throw new Error('DIAGNOSTIC_CHECKSUM_MISMATCH');
    if(p.version!==VERSION||p.profileId!==PROFILE.id||!Array.isArray(p.commands)||p.commands.length>MAX_COMMANDS)throw new Error('INVALID_DIAGNOSTIC_SCHEMA');
    let session=createSession(p.initialDeal,{roundId:p.roundId,rewardMode:p.rewardMode,profileId:p.profileId});
    for(const c of p.commands){const result=dispatch(session,c);if(!result.ok||result.replayed)throw new Error('DIAGNOSTIC_REPLAY_REJECTED:'+result.code);session=result.session;}
    if(fingerprint(session)!==p.finalFingerprint)throw new Error('DIAGNOSTIC_STATE_MISMATCH');
    return {ok:true,code:'RESTORED_FOR_DIAGNOSTICS',session};
  }catch(e){return {ok:false,code:e.message,session:null};}
}
module.exports={createSession,dispatch,fingerprint,exportSession,restoreSession,VERSION};
