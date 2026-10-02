'use strict';
/**
 * Optional WeChat SDK preview connector. All real calls are OFF by default.
 * Share hide->show produces return-only evidence, never a send confirmation.
 * No policy approval, server validation, billable impression or cash is inferred.
 */
function createWechatPreviewProvider(wx,config={}) {
  let active=null,disposed=false;
  function detach(a){
    if(!a||!a.ad)return;
    if(a.close&&typeof a.ad.offClose==='function')a.ad.offClose(a.close);
    if(a.error&&typeof a.ad.offError==='function')a.ad.offError(a.error);
  }
  function settle(a,kind,extra={}){
    if(disposed||active!==a)return;
    active=null;detach(a);
    if(!a.abandoned)a.callback({flowId:a.id,roundId:a.roundId,kind,...extra});
  }
  const hide=()=>{if(active&&active.source==='share')active.hidden=true;};
  const show=()=>{const a=active;if(a&&a.source==='share'&&a.hidden)settle(a,'share_returned');};
  if(typeof wx.onHide==='function')wx.onHide(hide);
  if(typeof wx.onShow==='function')wx.onShow(show);
  function open(source,flow,callback){
    if(disposed)return {ok:false,code:'PROVIDER_DISPOSED'};
    if(active)return {ok:false,code:'PROVIDER_BUSY'};
    if(!flow||typeof flow.id!=='string'||typeof flow.roundId!=='string'||typeof callback!=='function')return {ok:false,code:'INVALID_PROVIDER_REQUEST'};
    if(source==='share'&&(!config.allowSharePreview||typeof wx.shareAppMessage!=='function'))return {ok:false,code:'NATIVE_SHARE_PREVIEW_DISABLED'};
    if(source==='ad'&&(!config.allowAdPreview||!config.adUnitId||typeof wx.createRewardedVideoAd!=='function'))return {ok:false,code:'NATIVE_AD_PREVIEW_DISABLED'};
    if(!['share','ad'].includes(source))return {ok:false,code:'UNKNOWN_SOURCE'};
    const a=active={source,id:flow.id,roundId:flow.roundId,callback,hidden:false};
    try{
      if(source==='share')wx.shareAppMessage({title:config.shareTitle||'三消挑战',query:'source=challenge'});
      else{
        a.ad=wx.createRewardedVideoAd({adUnitId:config.adUnitId});
        a.close=res=>{if(!a.showRequested)return;settle(a,'ad_closed',
          res&&typeof res.isEnded==='boolean'?{isEnded:res.isEnded}:{});};
        a.error=()=>settle(a,'failed');
        a.ad.onClose(a.close);a.ad.onError(a.error);
        Promise.resolve().then(()=>{if(active!==a)return;return a.ad.load();})
          .then(()=>{if(active!==a)return;a.showRequested=true;return a.ad.show();})
          .catch(()=>settle(a,'failed'));
      }
    }catch(e){settle(a,'failed');}
    return {ok:true,code:'PROVIDER_OPENED'};
  }
  function cancel(){
    const a=active;
    // A displayed SDK singleton cannot be closed by this connector. Keep its
    // listener quarantined until it drains; otherwise its close could credit a new request.
    if(a&&a.ad&&a.showRequested){a.abandoned=true;return;}
    active=null;detach(a);
  }
  function destroy(){const a=active;active=null;detach(a);disposed=true;
    if(typeof wx.offHide==='function')wx.offHide(hide);
    if(typeof wx.offShow==='function')wx.offShow(show);
  }
  return {open,cancel,destroy};
}
module.exports={createWechatPreviewProvider};
