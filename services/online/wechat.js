'use strict';
// Only the server receives these environment values. Never return or log request URLs.
function createWechatExchange({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=8000}={}) {
  const appid=env.WECHAT_APP_ID,secret=env.WECHAT_APP_SECRET;
  if(typeof appid!=='string'||!appid||typeof secret!=='string'||!secret)return null;
  return async function exchangeCode(code){
    try{
      const url=new URL('https://api.weixin.qq.com/sns/jscode2session');
      url.search=new URLSearchParams({appid,secret,js_code:code,grant_type:'authorization_code'}).toString();
      const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw Error();
      const body=await response.json();
      if(!body||body.errcode||typeof body.openid!=='string'||!body.openid||body.openid.length>256)throw Error();
      // session_key and unionid are unnecessary for this service and are not persisted.
      return {openid:body.openid};
    }catch{throw Error('WECHAT_CODE_EXCHANGE_FAILED');}
  };
}
module.exports={createWechatExchange};
