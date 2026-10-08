'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const filename=path.join(__dirname,'../src/product/online-client.js');
const load=()=>{
 const exports=fs.existsSync(filename)?require(filename):{};
 assert.equal(typeof exports.wechatClient,'function','wechatClient must be implemented');
 return exports.wechatClient;
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function platform(){
 const logins=[],requests=[],storage=[];
 const wx={
  login(options){logins.push(options);},
  request(options){const entry={...options,aborted:0};requests.push(entry);return {abort(){entry.aborted++;options.fail?.({errMsg:'request:fail abort'});}};},
  setStorageSync(...args){storage.push(args);}
 };
 return {wx,logins,requests,storage};
}
const body=(data,statusCode=200)=>({statusCode,data});
function client(p,options={}){return load()(p.wx,{serviceUrl:'https://game.example.test',timeoutMs:1000,...options});}
async function login(p,{userId='user-A',token='session-A',expiresAt=Date.now()+60000,code='temporary-code'}={}){
 const attempt=p.logins.at(-1);assert.ok(attempt,'wx.login must have started');attempt.success({code});await tick();
 const request=p.requests.at(-1);assert.ok(request.url.endsWith('/api/auth/wechat'));request.success(body({token,userId,expiresAt}));await tick();
}
async function authenticated(options={}){const p=platform(),c=client(p,options);await login(p);await c.ready;return {p,c};}
const rejectsCode=(promise,code)=>assert.rejects(promise,error=>error.code===code&&error.message===code);

test('online auth uses a one-time WeChat code, normalized URL, memory-only token and account scope',async()=>{
 const p=platform(),c=client(p,{serviceUrl:'HTTPS://GAME.EXAMPLE.TEST:443/game///'});
 assert.equal(c.kind,'online');assert.equal(c.scope,null);assert.equal(p.logins.length,1);
 p.logins[0].success({code:'temporary-code'});await tick();
 assert.equal(p.requests[0].url,'https://game.example.test/game/api/auth/wechat');
 assert.equal(p.requests[0].method,'POST');assert.deepEqual(p.requests[0].data,{code:'temporary-code'});
 assert.equal(p.requests[0].header.Authorization,undefined);
 p.requests[0].success(body({token:'memory-only-token',userId:'user/A',expiresAt:Date.now()+60000}));await c.ready;
 assert.equal(c.scope,'online:https://game.example.test/game|user%2FA');
 const output=c.request('bootstrap');await tick();
 assert.deepEqual(p.requests[1].data,{action:'bootstrap',data:{}});assert.equal(p.requests[1].header.Authorization,'Bearer memory-only-token');
 p.requests[1].success(body({ok:true,data:{profile:{userId:'user/A'}}}));assert.deepEqual(await output,{profile:{userId:'user/A'}});
 assert.deepEqual(p.storage,[]);assert.equal(JSON.stringify(c).includes('memory-only-token'),false);c.destroy();
});

test('all product actions pass their JSON data and successful response through',async()=>{
 const {p,c}=await authenticated();
 for(const action of ['bootstrap','start','settle','equip','bullet','progress.get','progress.put','progress.clear','reward.offer','reward.observe','leaderboard']){
  const data={ticket:'ticket-A',nested:{version:2},list:[1,2]},pending=c.request(action,data);await tick();const sent=p.requests.at(-1);
  assert.deepEqual(sent.data,{action,data});assert.equal(sent.url,'https://game.example.test/api/call');
  sent.success(body({ok:true,data:{action,accepted:true}}));assert.deepEqual(await pending,{action,accepted:true});
 }
 c.destroy();
});

test('concurrent initial requests share one login and retain separate results',async()=>{
 const p=platform(),c=client(p),a=c.request('bootstrap'),b=c.request('leaderboard',{page:2});
 assert.equal(p.logins.length,1);await login(p);await c.ready;
 const calls=p.requests.filter(r=>r.url.endsWith('/api/call'));assert.equal(calls.length,2);
 calls[1].success(body({ok:true,data:'B'}));calls[0].success(body({ok:true,data:'A'}));
 assert.deepEqual(await Promise.all([a,b]),['A','B']);c.destroy();
});

test('configuration rejects non-HTTPS, credentials, query, hash and secret fields before logging in',()=>{
 for(const serviceUrl of ['', 'http://api.example.test','http://localhost:3000','https://u:p@api.example.test','https://api.example.test?secret=x','https://api.example.test#x','https://api.example.test\\evil','https://api.example.test/%2e%2e/evil']){
  const p=platform();assert.throws(()=>client(p,{serviceUrl}),e=>e.code==='INVALID_SERVICE_URL',serviceUrl);assert.equal(p.logins.length,0);
 }
 for(const options of [{appSecret:'do-not-send'},{AppSecret:'do-not-send'},{nested:{session_key:'do-not-send'}}]){
  const p=platform();assert.throws(()=>client(p,options),e=>e.code==='CLIENT_SECRET_FORBIDDEN');assert.equal(p.logins.length,0);
 }
});

test('explicit test permission permits only exact loopback HTTP hosts',async()=>{
 for(const serviceUrl of ['http://localhost:3030','http://127.0.0.1:3030','http://[::1]:3030']){
  const p=platform(),c=client(p,{serviceUrl,allowLoopbackForTests:true});await login(p);await c.ready;assert.ok(c.scope.includes(serviceUrl));c.destroy();
 }
 for(const serviceUrl of ['http://localhost.evil.test','http://127.0.0.1.evil.test','http://192.168.0.1','http://0.0.0.0','http://127.1'])assert.throws(()=>client(platform(),{serviceUrl,allowLoopbackForTests:true}),e=>e.code==='INVALID_SERVICE_URL');
});

test('WeChat runtime does not require the browser URL global',async()=>{
 const previous=global.URL;try{global.URL=undefined;const {c}=await authenticated({serviceUrl:'https://GAME.EXAMPLE.TEST:443/'});assert.equal(c.scope,'online:https://game.example.test|user-A');c.destroy();}finally{global.URL=previous;}
});

test('secret-bearing request JSON is rejected before transmission, including toJSON output',async()=>{
 const {p,c}=await authenticated(),before=p.requests.length;
 for(const data of [{AppSecret:'secret'},{nested:[{session_key:'secret'}]},{toJSON(){return {serverSecret:'secret'};}}])await rejectsCode(c.request('progress.put',data),'CLIENT_SECRET_FORBIDDEN');
 assert.equal(p.requests.length,before);c.destroy();
});

test('request payload is snapshotted before asynchronous login',async()=>{
 const p=platform(),c=client(p),data={value:1},pending=c.request('progress.put',data);data.value=2;data.appSecret='late secret';await login(p);await c.ready;
 const sent=p.requests.at(-1);assert.deepEqual(sent.data,{action:'progress.put',data:{value:1}});sent.success(body({ok:true,data:true}));assert.equal(await pending,true);c.destroy();
});

test('failed login cleans up concurrency state and a later request can authenticate again',async()=>{
 const p=platform(),c=client(p),failed=rejectsCode(c.ready,'WECHAT_LOGIN_FAILED');p.logins[0].fail({errMsg:'contains private details'});await failed;
 const pending=c.request('bootstrap');assert.equal(p.logins.length,2);await login(p);p.requests.at(-1).success(body({ok:true,data:'recovered'}));assert.equal(await pending,'recovered');c.destroy();
});

test('missing login code and malformed authentication fail closed without fallback',async()=>{
 const p=platform(),c=client(p),failed=rejectsCode(c.ready,'WECHAT_LOGIN_FAILED');p.logins[0].success({});await failed;assert.equal(p.requests.length,0);assert.equal(c.scope,null);c.destroy();
 for(const response of [{token:'session',expiresAt:Date.now()+60000},{token:'bad\nheader',userId:'u',expiresAt:Date.now()+60000},{token:'session',userId:'u',expiresAt:Date.now()-1},{token:'session',userId:'u'},{token:'session',userId:'\ud800',expiresAt:Date.now()+60000}]){
  const p=platform(),c=client(p),failed=rejectsCode(c.ready,'INVALID_AUTH_RESPONSE');p.logins[0].success({code:'code'});await tick();p.requests[0].success(body(response));await failed;assert.equal(c.scope,null);c.destroy();
 }
});

test('HTTP and application failures keep safe explicit error codes',async()=>{
 const {p,c}=await authenticated();
 for(const [response,code] of [[body({ok:false,error:'PROGRESS_CONFLICT'}),'PROGRESS_CONFLICT'],[body({ok:true,data:'wrong'},503),'SERVICE_UNAVAILABLE'],[body('invalid JSON'),'INVALID_SERVICE_RESPONSE'],[body({ok:false,error:'secret value from upstream'}),'SERVICE_FAILED']]){
  const pending=c.request('progress.put'),failed=rejectsCode(pending,code);await tick();p.requests.at(-1).success(response);await failed;
 }
 assert.equal(p.logins.length,1);c.destroy();
});

test('session expiry refreshes and retries the original operation exactly once',async()=>{
 const {p,c}=await authenticated(),pending=c.request('settle',{ticket:'same-ticket'});await tick();
 p.requests.at(-1).success(body({ok:false,error:'WECHAT_SESSION_REQUIRED'},401));await tick();assert.equal(p.logins.length,2);
 await login(p,{token:'new-session'});const retry=p.requests.at(-1);assert.equal(retry.header.Authorization,'Bearer new-session');assert.deepEqual(retry.data,{action:'settle',data:{ticket:'same-ticket'}});
 retry.success(body({ok:true,data:{idempotent:true}}));assert.deepEqual(await pending,{idempotent:true});c.destroy();
});

test('a second expiry response rejects instead of looping or retaining the rejected token',async()=>{
 const {p,c}=await authenticated(),pending=c.request('bootstrap'),failed=rejectsCode(pending,'SESSION_EXPIRED');await tick();
 p.requests.at(-1).success(body({ok:false,error:'SESSION_EXPIRED'}));await tick();await login(p,{token:'new-session'});
 p.requests.at(-1).success(body({ok:false,error:'SESSION_EXPIRED'}));await failed;assert.equal(p.logins.length,2);
 const next=c.request('bootstrap');assert.equal(p.logins.length,3);await login(p,{token:'third-session'});p.requests.at(-1).success(body({ok:true,data:true}));await next;c.destroy();
});

test('concurrent expiry responses share reauthentication and stale responses cannot evict a newer token',async()=>{
 const {p,c}=await authenticated(),a=c.request('bootstrap'),b=c.request('leaderboard');await tick();const [first,late]=p.requests.slice(1);
 first.success(body({ok:false,error:'SESSION_EXPIRED'}));await tick();await login(p,{token:'new-session'});
 late.success(body({ok:false,error:'SESSION_EXPIRED'}));await tick();assert.equal(p.logins.length,2);
 const retries=p.requests.filter(r=>r.header.Authorization==='Bearer new-session');assert.equal(retries.length,2);
 retries.forEach((r,i)=>r.success(body({ok:true,data:i})));assert.deepEqual(await Promise.all([a,b]),[0,1]);c.destroy();
});

test('known token expiry triggers login before sending another authenticated call',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 try{const p=platform(),c=client(p);await login(p,{expiresAt:now+1000});await c.ready;now+=1001;
 const pending=c.request('bootstrap');assert.equal(p.logins.length,2);assert.equal(p.requests.length,1);await login(p,{token:'new-session'});p.requests.at(-1).success(body({ok:true,data:true}));await pending;c.destroy();}finally{Date.now=realNow;}
});

test('identity-changing refresh updates scope but never resends an old account operation',async()=>{
 const {p,c}=await authenticated(),pending=c.request('settle',{ticket:'user-A-ticket'}),failed=rejectsCode(pending,'IDENTITY_CHANGED');await tick();
 p.requests.at(-1).success(body({ok:false,error:'SESSION_EXPIRED'}));await tick();await login(p,{userId:'user-B',token:'session-B'});await failed;
 assert.equal(c.scope,'online:https://game.example.test|user-B');assert.equal(p.requests.filter(r=>r.url.endsWith('/api/call')).length,1);
 const newRequest=c.request('bootstrap');await tick();p.requests.at(-1).success(body({ok:true,data:'new-account'}));assert.equal(await newRequest,'new-account');c.destroy();
});

test('old account successful responses are discarded after a concurrent identity change',async()=>{
 const {p,c}=await authenticated(),old=c.request('progress.get'),refresh=c.request('bootstrap');const oldFailed=rejectsCode(old,'IDENTITY_CHANGED'),refreshFailed=rejectsCode(refresh,'IDENTITY_CHANGED');await tick();const oldReply=p.requests[1];
 p.requests[2].success(body({ok:false,error:'SESSION_EXPIRED'}));await tick();await login(p,{userId:'user-B',token:'session-B'});await refreshFailed;
 oldReply.success(body({ok:true,data:{ticket:'old-user-progress'}}));await oldFailed;c.destroy();
});

test('login timeout rejects, ignores late login callbacks and permits a clean retry',async()=>{
 const p=platform(),c=client(p,{timeoutMs:100}),first=p.logins[0];await rejectsCode(c.ready,'WECHAT_LOGIN_TIMEOUT');
 first.success({code:'too-late'});await tick();assert.equal(p.requests.length,0);
 const pending=c.request('bootstrap');await login(p);p.requests.at(-1).success(body({ok:true,data:true}));await pending;c.destroy();
});

test('request timeout aborts the platform task and late callbacks cannot replace its result',async()=>{
 const {p,c}=await authenticated({timeoutMs:100}),pending=c.request('progress.get');await tick();const request=p.requests.at(-1);
 await rejectsCode(pending,'REQUEST_TIMEOUT');assert.equal(request.aborted,1);request.success(body({ok:true,data:'late'}));
 const next=c.request('bootstrap');await tick();p.requests.at(-1).success(body({ok:true,data:'next'}));assert.equal(await next,'next');c.destroy();
});

test('platform transport exceptions and failures are safe and never auto-retry mutating requests',async()=>{
 const {p,c}=await authenticated();let pending=c.request('settle'),failed=rejectsCode(pending,'NETWORK_FAILED');await tick();p.requests.at(-1).fail({errMsg:'token=do-not-leak'});await failed;
 const count=p.requests.length;p.wx.request=()=>{throw new Error('secret');};await rejectsCode(c.request('settle'),'NETWORK_FAILED');assert.equal(p.requests.length,count);assert.equal(p.logins.length,1);c.destroy();
 const p2=platform();p2.wx.login=()=>{throw new Error('secret');};const c2=client(p2);await rejectsCode(c2.ready,'WECHAT_LOGIN_FAILED');c2.destroy();
});

test('destroy cancels pending auth and ignores late callbacks without starting a request',async()=>{
 const p=platform(),c=client(p),readyFailed=rejectsCode(c.ready,'CLIENT_DESTROYED'),pending=c.request('bootstrap'),failed=rejectsCode(pending,'CLIENT_DESTROYED');c.destroy();c.destroy();
 await Promise.all([readyFailed,failed]);p.logins[0].success({code:'late'});await tick();assert.equal(p.requests.length,0);assert.equal(c.scope,null);await rejectsCode(c.request('bootstrap'),'CLIENT_DESTROYED');
});

test('destroy aborts active requests, rejects queued consumers and erases authenticated scope',async()=>{
 const {p,c}=await authenticated(),pending=c.request('progress.put'),failed=rejectsCode(pending,'CLIENT_DESTROYED');await tick();const request=p.requests.at(-1);c.destroy();await failed;assert.equal(request.aborted,1);assert.equal(c.scope,null);
 request.success(body({ok:true,data:'late'}));await tick();assert.equal(p.requests.length,2);await rejectsCode(c.request('bootstrap'),'CLIENT_DESTROYED');
});
