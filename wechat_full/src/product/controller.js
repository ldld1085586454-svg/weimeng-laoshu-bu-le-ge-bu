'use strict';
const R=require('./round'),{permute}=require('../play/shuffle');
const clone=v=>JSON.parse(JSON.stringify(v));
function createController(deal,options={}){
 if(options.mode&&options.mode!=='development')throw Error('PRODUCTION_GATE_CLOSED');
 let state,dirty=false,storageError=null,sequence=0;
 if(options.saved){const r=R.restore(options.saved);if(!r.ok)throw Error('CORRUPT_SAVE:'+r.code);state=r.state;}
 else state=R.createIntegrated(deal,options.roundId);
 const store=options.store||null,nonce=Date.now().toString(36)+'-'+Math.floor(Math.random()*1e9).toString(36);
 function write(s){try{if(store)store.write(R.serialize(s));storageError=null;return true;}catch(e){storageError=String(e.message||e);return false;}}
 function flush(){const ok=write(state);dirty=!ok;return {ok,code:ok?'SAVED':'STORAGE_WRITE_FAILED'};}
 function send(type,extra={},observed=false,roundId=state.roundId){
  if(dirty&&!observed&&!flush().ok)return {ok:false,code:'STORAGE_WRITE_FAILED'};
  const r=R.dispatch(state,{type,id:'p-'+nonce+'-'+(++sequence),roundId,expectedRevision:state.revision,...extra});
  if(!r.ok)return {ok:false,code:r.code};
  const saved=write(r.state);
  if(!saved&&!observed)return {ok:false,code:'STORAGE_WRITE_FAILED'};
  state=r.state;dirty=!saved;return {ok:true,code:r.code,saved,events:clone(r.events)};
 }
 function result(e){
  if(!e||e.roundId!==state.roundId)return {ok:false,code:'WRONG_ROUND'};
  const kind={ad_close:'AD_CLOSE',share_hide:'SHARE_HIDE',share_return:'SHARE_RETURN',failed:'FAIL',cancelled:'CANCEL'}[e.kind];
  if(!kind)return {ok:false,code:'INVALID_PROVIDER_EVENT'};
  return send(kind,{token:e.token,...(kind==='AD_CLOSE'&&typeof e.isEnded==='boolean'?{isEnded:e.isEnded}:{})},true,e.roundId);
 }
 const api={get:()=>clone(state),metrics:()=>R.metrics(state),export:()=>R.serialize(state),flush,
 health:()=>({dirty,storageError,localOnly:true}),pick:id=>send('PICK',{tileId:id}),
 offer(assist,channel='video'){const reason=R.checkOffer(state,assist,channel);if(reason)return {ok:false,code:reason};
  const extra={assist,channel};if(assist==='shuffle')try{extra.permutation=permute(state.board.deal.cells.filter((c,i)=>!state.board.taken[i]).map(c=>c.type),options.nextU32);}catch(e){return {ok:false,code:e.message};}
  return send('OFFER',extra);},
 launch:()=>state.pending?send('LAUNCH',{token:state.pending.token}):{ok:false,code:'NO_PENDING_REWARD'},
 cancel:()=>state.pending?send('CANCEL',{token:state.pending.token}):{ok:false,code:'NO_PENDING_REWARD'},
 apply:()=>state.pending?send('COMMIT',{token:state.pending.token}):{ok:false,code:'NO_PENDING_REWARD'},
 failApplication:()=>state.pending?send('APPLY_FAILED',{token:state.pending.token},true):{ok:false,code:'NO_PENDING_REWARD'},result};
 // Reloading does not turn a waiting ad or share into earned evidence.
 if(options.saved&&state.pending&&state.pending.phase!=='EARNED')send('INTERRUPT',{token:state.pending.token});
 return api;
}
module.exports={createController};
