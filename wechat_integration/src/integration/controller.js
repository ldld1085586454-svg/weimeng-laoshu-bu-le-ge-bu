'use strict';
const Core=require('./round');
const {permute}=require('../play/shuffle');
const copy=v=>JSON.parse(JSON.stringify(v));
/** Sync local diagnostic storage: one JSON document contains both entitlement and board.
 * It is not a secure account ledger. Atomic backend entitlement service is still required.
 */
function attach(initial,options={}){
  let state=initial,dirty=false,storageError=null,counter=0;
  const nonce='ctl-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e8).toString(36);
  const storage=options.storage||null;
  function write(s){
    if(!storage)return true;
    try {storage.write(Core.encode(s));storageError=null;dirty=false;return true;}
    catch(e){storageError=String(e.message||e);return false;}
  }
  function send(type,extra={},observation=false){
    const c={id:nonce+'-'+(++counter),roundId:state.session.roundId,expectedRevision:state.revision,type,...extra};
    const r=Core.dispatch(state,c);if(!r.ok||r.replayed)return {...r,state:copy(state),saved:!dirty};
    const saved=write(r.state);
    if(!saved&&!observation)return {ok:false,code:'STORAGE_WRITE_FAILED',saved:false,state:copy(state)};
    state=r.state;if(!saved)dirty=true;
    return {...r,state:copy(state),saved};
  }
  function sync(){const ok=write(state);return {ok,code:ok?'SAVED':'STORAGE_WRITE_FAILED'};}
  function request(assist){
    const s=state.session.board;
    let permutation;
    if(assist==='shuffle'){
      try{permutation=permute(s.deal.cells.filter((c,i)=>!s.taken[i]).map(c=>c.type),options.nextU32);}
      catch(e){return {ok:false,code:e.message};}
    }
    return send('REQUEST',{assist,...(permutation?{permutation}:{})});
  }
  return {
    view:()=>copy(state),getSession:()=>copy(state.session),flow:()=>copy(Core.getFlow(state)),
    health:()=>({mode:'development',persistence:storage?'local_diagnostic':'memory_only',dirty,storageError}),
    request,choose:source=>send('CHOOSE',{source}),cancel:()=>send('CANCEL'),
    pick:tileId=>send('PICK',{tileId}),
    receive:event=>send('PROVIDER_RESULT',event,true),
    apply:()=>{
      if(dirty&&!sync().ok)return {ok:false,code:'STORAGE_WRITE_FAILED'};
      return send('APPLY',{flowId:state.activeFlowId});
    },
    failApplication:()=>send('APPLY_FAILED',{flowId:state.activeFlowId},true),
    sync,exportDiagnostic:()=>Core.encode(state),summary:()=>Core.summary(state),
  };
}
function createController(deal,options={}){
  return attach(Core.createRound(deal,{roundId:options.roundId,mode:options.mode||'development',
    candidateShareReturn:options.candidateShareReturn!==false}),options);
}
function restoreController(text,options={}){
  const r=Core.decode(text);if(!r.ok)throw Error('INVALID_LOG:'+r.code);
  return attach(r.state,options);
}
module.exports={createController,restoreController};
