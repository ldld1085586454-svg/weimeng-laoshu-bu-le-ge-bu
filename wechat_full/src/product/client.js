'use strict';
const {createSocial}=require('./social');
function localClient(deals,storage,userId='local-player',now=Date.now){
 const service=createSocial({deals,now,initial:storage?.get('social')||null,save:storage?text=>storage.set('social',text):undefined});
 return {request:(action,data={})=>Promise.resolve().then(()=>service.call(userId,action,data)),scope:'local',kind:'local',service};
}
function httpClient(send,deviceId,scope='loopback'){
 let token=null,auth=null;
 const login=()=>auth||(auth=send('/api/login',{deviceId},null).then(r=>{if(r.error)throw Error(r.error);token=r.token;}).finally(()=>auth=null));
 return {scope,kind:'http',request:async(action,data={})=>{if(!token)await login();let r=await send('/api/call',{action,data},token);
  if(r.error==='DEVELOPMENT_SESSION_REQUIRED'){token=null;await login();r=await send('/api/call',{action,data},token);}if(!r.ok)throw Error(r.error||'SERVICE_FAILED');return r.data;}};
}
module.exports={localClient,httpClient};
