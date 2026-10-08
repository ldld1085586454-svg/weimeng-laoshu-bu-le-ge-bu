'use strict';

// This module runs in WeChat's JavaScript runtime: no fetch, browser URL,
// Node APIs, persistent credentials, or client-side platform secrets.
const SESSION_ERRORS=new Set(['WECHAT_SESSION_REQUIRED','SESSION_REQUIRED','SESSION_EXPIRED','INVALID_SESSION','UNAUTHORIZED']);
const SECRET_KEYS=new Set(['appsecret','wechatappsecret','wxappsecret','clientsecret','serversecret','sessionkey']);
function failure(code){return Object.assign(new Error(code),{code});}
function safeCode(value,fallback){return typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:fallback;}
function rejectSecrets(value,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return;
 seen.add(value);
 for(const key of Object.keys(value)){
  if(SECRET_KEYS.has(key.toLowerCase().replace(/[_\s-]/g,'')))throw failure('CLIENT_SECRET_FORBIDDEN');
  rejectSecrets(value[key],seen);
 }
}
function snapshot(data){
 // Validate the serialized form as well: toJSON must not smuggle a secret
 // into a later wx.request, and mutation during login must not change it.
 rejectSecrets(data);
 let result;
 try{result=JSON.parse(JSON.stringify(data));}catch(_){throw failure('INVALID_REQUEST_DATA');}
 rejectSecrets(result);
 return result;
}
function normalizeServiceUrl(value,allowLoopback){
 if(typeof value!=='string'||!value||/[\s\\?#\x00-\x1f\x7f]/.test(value))throw failure('INVALID_SERVICE_URL');
 const match=/^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^?#]*)?$/i.exec(value);
 if(!match)throw failure('INVALID_SERVICE_URL');
 const protocol=match[1].toLowerCase(),host=match[2].toLowerCase();
 const port=match[3]?Number(match[3]):null;
 if(port!==null&&(port<1||port>65535))throw failure('INVALID_SERVICE_URL');
 const loopback=host==='localhost'||host==='127.0.0.1'||host==='[::1]';
 if(protocol!=='https'&&!(allowLoopback===true&&loopback))throw failure('INVALID_SERVICE_URL');
 if(!host.startsWith('[')&&host.split('.').some(part=>!part||part.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)))throw failure('INVALID_SERVICE_URL');
 let path=(match[4]||'').replace(/\/+$/,'');
 try{
  for(const part of path.split('/')){
   const decoded=decodeURIComponent(part);
   if(decoded==='.'||decoded==='..'||/[\/?#\\\x00-\x20\x7f]/.test(decoded))throw failure('INVALID_SERVICE_URL');
  }
 }catch(_){throw failure('INVALID_SERVICE_URL');}
 const portSuffix=port&&!(protocol==='https'&&port===443)&&!(protocol==='http'&&port===80)?':'+port:'';
 return protocol+'://'+host+portSuffix+path;
}

function wechatClient(wx,options={}){
 rejectSecrets(options);
 const serviceUrl=normalizeServiceUrl(options.serviceUrl,options.allowLoopbackForTests);
 const timeoutMs=options.timeoutMs===undefined?10000:options.timeoutMs;
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>120000)throw failure('INVALID_TIMEOUT');
 if(!wx||typeof wx.login!=='function'||typeof wx.request!=='function')throw failure('WECHAT_SDK_UNAVAILABLE');
 let session=null,identity=null,identityVersion=0,auth=null,destroyed=false;
 const pending=new Set();
 function active(){if(destroyed)throw failure('CLIENT_DESTROYED');}
 function invoke(start,timeoutCode,failCode){
  return new Promise((resolve,reject)=>{
   if(destroyed){reject(failure('CLIENT_DESTROYED'));return;}
   let done=false,task;
   const finish=(error,value)=>{
    if(done)return;
    done=true;clearTimeout(timer);pending.delete(cancel);
    if(error)reject(error);else resolve(value);
   };
   const abort=()=>{try{task?.abort?.();}catch(_){/* Abort cannot replace the original error. */}};
   const cancel=()=>{finish(failure('CLIENT_DESTROYED'));abort();};
   const timer=setTimeout(()=>{finish(failure(timeoutCode));abort();},timeoutMs);
   pending.add(cancel);
   try{task=start(value=>finish(null,value),()=>finish(failure(failCode)));}
   catch(_){finish(failure(failCode));}
  });
 }
 function post(endpoint,data,token){
  const header={'Content-Type':'application/json'};
  if(token)header.Authorization='Bearer '+token;
  return invoke((success,fail)=>wx.request({url:serviceUrl+endpoint,method:'POST',data,header,timeout:timeoutMs,success,fail}),'REQUEST_TIMEOUT','NETWORK_FAILED');
 }
 function responseData(response){
  const status=response?.statusCode;
  if(!Number.isInteger(status))throw failure('INVALID_SERVICE_RESPONSE');
  if(status>=500)throw failure('SERVICE_UNAVAILABLE');
  if(status<200||status>=300){
   const error=failure(safeCode(response?.data?.error,status===401?'WECHAT_SESSION_REQUIRED':'SERVICE_FAILED'));
   if(status===401)error.sessionExpired=true;
   throw error;
  }
  if(!response.data||typeof response.data!=='object'||Array.isArray(response.data))throw failure('INVALID_SERVICE_RESPONSE');
  return response.data;
 }
 function ensureSession(){
  active();
  if(auth)return auth;
  if(session&&session.expiresAt>Date.now())return Promise.resolve(session);
  session=null;
  const operation=(async()=>{
   const result=await invoke((success,fail)=>wx.login({timeout:timeoutMs,success,fail}),'WECHAT_LOGIN_TIMEOUT','WECHAT_LOGIN_FAILED');
   active();
   if(typeof result?.code!=='string'||!result.code.trim())throw failure('WECHAT_LOGIN_FAILED');
   const data=responseData(await post('/api/auth/wechat',{code:result.code}));
   active();
   if(data.ok===false)throw failure(safeCode(data.error,'WECHAT_AUTH_FAILED'));
   if(typeof data.token!=='string'||!/^[\x21-\x7e]{1,4096}$/.test(data.token)||typeof data.userId!=='string'||!data.userId||data.userId.length>256||/[\x00-\x1f\x7f]/.test(data.userId)||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw failure('INVALID_AUTH_RESPONSE');
   try{encodeURIComponent(data.userId);}catch(_){throw failure('INVALID_AUTH_RESPONSE');}
   if(identity!==null&&identity!==data.userId)identityVersion++;
   identity=data.userId;
   session={token:data.token,userId:data.userId,expiresAt:data.expiresAt};
   return session;
  })();
  const current=operation.then(value=>{if(auth===current)auth=null;return value;},error=>{if(auth===current){auth=null;session=null;}throw error;});
  auth=current;
  return current;
 }
 async function request(action,data={}){
  active();
  if(typeof action!=='string'||!action||action.length>100)throw failure('INVALID_ACTION');
  const payload={action,data:snapshot(data)};
  const startingIdentity=identity;
  let version=identityVersion;
  let used=await ensureSession();
  if(startingIdentity===null)version=identityVersion;
  const sameIdentity=()=>{active();if(identityVersion!==version)throw failure('IDENTITY_CHANGED');};
  sameIdentity();
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await post('/api/call',payload,used.token);
    sameIdentity();
    const result=responseData(response);
    if(result.ok!==true)throw failure(safeCode(result.error,'SERVICE_FAILED'));
    return result.data;
   }catch(error){
    sameIdentity();
    if(!error.sessionExpired&&!SESSION_ERRORS.has(error.code))throw error;
    // Another request may already have installed a newer token. A stale 401
    // must never clear that token or launch a duplicate platform login.
    if(session===used)session=null;
    if(attempt===1)throw error;
    used=await ensureSession();
    sameIdentity();
   }
  }
 }
 const ready=ensureSession().then(()=>undefined);
 // Consumers may wait until their first request to observe login failure.
 // Keep ready rejectable without emitting an unhandled-rejection event.
 ready.catch(()=>{});
 return {
  kind:'online',
  get scope(){return !destroyed&&identity!==null?'online:'+serviceUrl+'|'+encodeURIComponent(identity):null;},
  ready,request,
  destroy(){
   if(destroyed)return;
   destroyed=true;session=null;identity=null;auth=null;
   for(const cancel of [...pending])cancel();
  }
 };
}
module.exports={wechatClient};
