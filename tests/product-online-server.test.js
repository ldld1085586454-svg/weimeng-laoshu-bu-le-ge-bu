'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const R = require('../src/product/round');
const apiPath = path.join(__dirname, '../services/online/server.js');
const API = fs.existsSync(apiPath) ? require(apiPath) : {};
const deal = {schema:'astra-deal-1', dealId:'online-fixture', layoutId:'open', origin:'SYNTHETIC_NOT_HISTORICAL', slotCapacity:7,
  cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
const witness = ['t0','t3','t6','t1','t4','t7','t2','t5','t8'];
async function setup(t, options={}) {
  assert.equal(typeof API.createOnlineServer, 'function', 'online server factory must exist');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bu-online-'));
  let time=Date.UTC(2026,9,3,4),server,url;
  const config={dbFile:path.join(dir,'online.sqlite'),deals:[deal],now:()=>time,
    exchangeCode:async code=>({openid:code.split(':')[0],session_key:'secret-never-persist'}),...options};
  async function start(){server=API.createOnlineServer(config);await new Promise(resolve=>server.listen(0,resolve));url='http://127.0.0.1:'+server.address().port;}
  await start();
  async function stop(){if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
  t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
  const request=(route,body,token,headers={})=>new Promise((resolve,reject)=>{const text=JSON.stringify(body),req=http.request(url+route,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),...(token?{Authorization:'Bearer '+token}:{}),...headers}},res=>{let output='';res.on('data',chunk=>output+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(output)});}catch(error){reject(error);}});});req.on('error',reject);req.end(text);});
  const call=(token,action,data={})=>request('/api/call',{action,data},token);
  const login=async code=>{const r=await request('/api/auth/wechat',{code});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  return {request,call,login,config,dir,advance:ms=>time+=ms,get server(){return server;},get url(){return url;},restart:async()=>{await stop();await start();}};
}
async function round(h,token){const r=await h.call(token,'start',{mode:'daily'});assert.equal(r.body.ok,true,JSON.stringify(r.body));const {ticket,deal:d}=r.body.data;return {ticket,state:R.createIntegrated(d,ticket.id)};}
function command(state,type,data={}){const r=R.dispatch(state,{id:'cmd-'+state.revision,roundId:state.roundId,expectedRevision:state.revision,type,...data});assert.equal(r.ok,true,r.code);return r.state;}
function won(state){for(const tileId of witness)state=command(state,'PICK',{tileId});assert.equal(state.board.status,'WON');return state;}
function payload(r,state=r.state){return {ticketId:r.ticket.id,log:R.serialize(state),elapsedMs:0};}
function error(r,code,status){assert.equal(r.body.ok,false);assert.equal(r.body.error,code);if(status)assert.equal(r.status,status);}

test('online: authenticated identities are isolated, login codes single-use and secrets absent',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),again=await h.login('alice:2'),b=await h.login('bob:1');
  assert.equal(a.userId,again.userId);assert.notEqual(a.userId,b.userId);assert.notEqual(a.token,again.token);assert.ok(a.expiresAt>0);
  assert.deepEqual(Object.keys(a).sort(),['expiresAt','token','userId']);
  error(await h.request('/api/auth/wechat',{code:'alice:1'}),'LOGIN_CODE_USED',409);
  const boot=(await h.call(a.token,'bootstrap')).body.data;
  assert.equal(boot.profile.id,a.userId);assert.equal(boot.dataMode,'authenticated_service');assert.deepEqual(boot.capabilities,{rewards:false,cloudProgress:true});
  assert.equal(boot.honors.fast,null);assert.equal(boot.honors.king,null);assert.equal(boot.timingVerification,'unverified_client_duration');
  error(await h.call(a.token,'equip',{skin:'cap'}),'SKIN_LOCKED');
  error(await h.call(a.token,'bootstrap',{profile:{owned:['cap']}}),'INVALID_PAYLOAD');
  error(await h.call('', 'bootstrap'),'SESSION_REQUIRED',401);error(await h.call('fake','bootstrap'),'SESSION_REQUIRED',401);
  h.advance(8*3600000);error(await h.call(a.token,'bootstrap'),'SESSION_EXPIRED',401);
  assert.equal(fs.readFileSync(h.config.dbFile).includes(Buffer.from('secret-never-persist')),false);
});

test('online: real HTTP settlement persists and deduplicates shared winners across restart',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),b=await h.login('bob:1'),r=await round(h,a.token),data=payload(r,won(r.state));
  error(await h.call(b.token,'settle',data),'TICKET_OWNER');
  const first=await h.call(a.token,'settle',data);assert.equal(first.body.data.replayed,false);assert.equal(first.body.data.result.timingVerification,'unverified_client_duration');
  assert.equal((await h.call(a.token,'settle',data)).body.data.replayed,true);
  await h.restart();assert.equal((await h.call(a.token,'settle',data)).body.data.replayed,true);
  error(await h.call(a.token,'settle',{...data,elapsedMs:1}),'SETTLEMENT_CONFLICT',409);
  const second=await round(h,a.token);await h.call(a.token,'settle',payload(second,won(second.state)));
  const theirs=await round(h,b.token);await h.call(b.token,'settle',payload(theirs,won(theirs.state)));
  const boot=(await h.call(b.token,'bootstrap')).body.data;assert.equal(boot.totals.wins,2);assert.equal(boot.totals.attempts,3);
  const page=(await h.call(a.token,'leaderboard',{limit:1})).body.data;assert.equal(page.entries.length,1);assert.ok(page.nextCursor);assert.equal(page.total,2);
  const next=(await h.call(a.token,'leaderboard',{limit:1,cursor:page.nextCursor})).body.data;assert.equal(next.entries.length,1);assert.notEqual(next.entries[0].userId,page.entries[0].userId);assert.equal(next.nextCursor,null);
});

test('online: progress is user-global CAS, append-only and atomically cleared on settlement',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),b=await h.login('bob:1'),r=await round(h,a.token);
  assert.deepEqual((await h.call(a.token,'progress.get')).body.data,{revision:0,progress:null});
  const one=command(r.state,'PICK',{tileId:'t0'}),first={...payload(r,one),expectedRevision:0};
  error(await h.call(b.token,'progress.put',first),'TICKET_OWNER');
  const saved=(await h.call(a.token,'progress.put',first)).body.data;assert.equal(saved.revision,1);assert.deepEqual(saved.progress.ticket,r.ticket);
  error(await h.call(a.token,'progress.put',first),'PROGRESS_CONFLICT',409);
  error(await h.call(a.token,'progress.put',{...payload(r),expectedRevision:1}),'PROGRESS_LOG_CONFLICT',409);
  const other=await round(h,a.token);error(await h.call(a.token,'progress.put',{...payload(other),expectedRevision:1}),'PROGRESS_ACTIVE_TICKET_CONFLICT',409);
  await h.restart();assert.deepEqual((await h.call(a.token,'progress.get')).body.data,saved);
  error(await h.call(a.token,'progress.clear',{expectedRevision:1,ticketId:other.ticket.id}),'PROGRESS_TICKET_CONFLICT',409);
  let s=one;for(const tileId of witness.slice(1))s=command(s,'PICK',{tileId});
  assert.equal((await h.call(a.token,'settle',payload(r,s))).body.ok,true);
  const cleared=(await h.call(a.token,'progress.get')).body.data;assert.equal(cleared.revision,2);assert.equal(cleared.progress,null);
  error(await h.call(a.token,'progress.put',{...payload(r,s),expectedRevision:2}),'TICKET_SETTLED');
  assert.equal((await h.call(b.token,'progress.get')).body.data.revision,0);
});

test('online: simultaneous CAS saves have exactly one winner and expired tickets cannot save',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),r=await round(h,a.token),body={...payload(r),expectedRevision:0};
  const replies=await Promise.all([h.call(a.token,'progress.put',body),h.call(a.token,'progress.put',body)]);
  assert.equal(replies.filter(r=>r.body.ok).length,1);assert.equal(replies.find(r=>!r.body.ok).body.error,'PROGRESS_CONFLICT');
  h.advance(86400000);const fresh=await h.login('alice:2');
  assert.equal((await h.call(fresh.token,'progress.get')).body.data.progress,null);
  error(await h.call(fresh.token,'progress.put',{...body,expectedRevision:2}),'CYCLE_EXPIRED');
});

function offered(state,channel='video',tileId='t0'){
  state=command(state,'PICK',{tileId});state=command(state,'OFFER',{assist:'undo',channel});return command(state,'LAUNCH',{token:state.pending.token});
}
function committed(state){state=command(state,'AD_CLOSE',{token:state.pending.token,isEnded:true});return command(state,'COMMIT',{token:state.pending.token});}

test('online: forged client completion cannot save EARNED, COMMIT or settle without issued grant',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  assert.equal((await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)})).body.ok,true);
  error(await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{isEnded:true}}),'TRUSTED_REWARD_VERIFIER_NOT_CONFIGURED',503);
  const earned=command(s,'AD_CLOSE',{token,isEnded:true});
  error(await h.call(a.token,'progress.put',{...payload(r,earned),expectedRevision:0}),'REWARD_GRANT_REQUIRED');
  const applied=committed(s);error(await h.call(a.token,'progress.put',{...payload(r,applied),expectedRevision:0}),'REWARD_GRANT_REQUIRED');
  error(await h.call(a.token,'settle',payload(r,won(applied))),'REWARD_GRANT_REQUIRED');
  assert.equal((await h.call(a.token,'bootstrap')).body.data.totals.wins,0);
});

test('online: verified grants survive restart, bind the exact offer and settle once',async t=>{
  const seen=[];
  const h=await setup(t,{verifyReward:async context=>{seen.push(context);return context.observation.proof==='trusted-test-proof'?{verified:true,evidenceId:'provider-'+context.token}:{verified:false};}});
  const a=await h.login('alice:1'),b=await h.login('bob:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  assert.equal((await h.call(a.token,'bootstrap')).body.data.capabilities.rewards,true);
  const offer=await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});assert.equal(offer.body.data.token,token);assert.ok(offer.body.data.expiresAt>0);
  error(await h.call(b.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{proof:'trusted-test-proof'}}),'TICKET_OWNER');
  error(await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{isEnded:true}}),'REWARD_NOT_VERIFIED');
  const observation={ticketId:r.ticket.id,token,observation:{proof:'trusted-test-proof'}};
  assert.deepEqual((await h.call(a.token,'reward.observe',observation)).body.data,{authorized:true,token});
  assert.deepEqual((await h.call(a.token,'reward.observe',observation)).body.data,{authorized:true,token});
  assert.equal(seen.at(-1).userId,a.userId);assert.equal(seen.at(-1).assist,'undo');assert.equal(seen.at(-1).boardRevision,s.pending.boardRevision);
  error(await h.call(a.token,'reward.observe',{...observation,observation:{proof:'changed'}}),'REWARD_OBSERVATION_CONFLICT',409);
  const branch=offered(r.state,'video','t1');assert.equal(branch.pending.token,token);
  error(await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(branch)}),'REWARD_OFFER_CONFLICT',409);
  error(await h.call(a.token,'progress.put',{...payload(r,committed(branch)),expectedRevision:0}),'REWARD_GRANT_MISMATCH');
  const applied=committed(s);assert.equal((await h.call(a.token,'progress.put',{...payload(r,applied),expectedRevision:0})).body.ok,true);
  await h.restart();h.advance(6*60000); // Already accepted application may finish after its offer expires.
  const settlement=payload(r,won(applied));const result=await h.call(a.token,'settle',settlement);
  assert.equal(result.body.data.result.rewardVerification,'trusted_server_grants');
  assert.equal((await h.call(a.token,'settle',settlement)).body.data.replayed,true);
  assert.equal((await h.call(a.token,'progress.get')).body.data.progress,null);
});

test('online: share offers, expired grants, reused evidence and stale saved offers fail closed',async t=>{
  const h=await setup(t,{verifyReward:async()=>({verified:true,evidenceId:'one-provider-event'})}),a=await h.login('alice:1');
  const r=await round(h,a.token),share=offered(r.state,'share');
  error(await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(share)}),'REWARD_CHANNEL_UNSUPPORTED');
  const s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});
  assert.equal((await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}})).body.ok,true);
  h.advance(5*60000);
  error(await h.call(a.token,'progress.put',{...payload(r,committed(s)),expectedRevision:0}),'REWARD_GRANT_EXPIRED');
  const r2=await round(h,a.token),s2=offered(r2.state);await h.call(a.token,'reward.offer',{ticketId:r2.ticket.id,log:R.serialize(s2)});
  error(await h.call(a.token,'reward.observe',{ticketId:r2.ticket.id,token:s2.pending.token,observation:{}}),'REWARD_EVIDENCE_REUSED',409);
  const cancelled=command(s2,'CANCEL',{token:s2.pending.token});await h.call(a.token,'progress.put',{...payload(r2,cancelled),expectedRevision:0});
  error(await h.call(a.token,'reward.observe',{ticketId:r2.ticket.id,token:s2.pending.token,observation:{}}),'REWARD_OFFER_STALE',409);
});

test('online: missing identity configuration fails closed and provider errors never leak secrets',async t=>{
  const h=await setup(t,{exchangeCode:null,env:{}});
  error(await h.request('/api/auth/wechat',{code:'code'}),'WECHAT_AUTH_NOT_CONFIGURED',503);
  const broken=await setup(t,{exchangeCode:async()=>{throw Error('secret-never-persist https://bad/?secret=private');}});
  error(await broken.request('/api/auth/wechat',{code:'code'}),'WECHAT_CODE_EXCHANGE_FAILED',401);
  error(await broken.request('/api/auth/wechat',{code:'code'}),'LOGIN_CODE_USED',409);
  const malformed=await setup(t,{exchangeCode:async()=>({openid:'victim',errcode:40029,session_key:'private'})});
  error(await malformed.request('/api/auth/wechat',{code:'code'}),'WECHAT_CODE_EXCHANGE_FAILED',401);
});

test('online: official exchange sends only the code to configured WeChat and strips session keys',async()=>{
  assert.equal(typeof API.createWechatExchange,'function');
  let url;
  const exchange=API.createWechatExchange({env:{WECHAT_APP_ID:'test-app-id',WECHAT_APP_SECRET:'test-server-only-secret'},fetchImpl:async input=>{url=new URL(input);return {ok:true,json:async()=>({openid:'provider-user',session_key:'must-not-return',unionid:'not-needed'})};}});
  assert.deepEqual(await exchange('one-use-code'),{openid:'provider-user'});
  assert.equal(url.origin,'https://api.weixin.qq.com');assert.equal(url.pathname,'/sns/jscode2session');
  assert.equal(url.searchParams.get('js_code'),'one-use-code');assert.equal(url.searchParams.get('appid'),'test-app-id');assert.equal(url.searchParams.get('grant_type'),'authorization_code');
});

test('online: host, origin, forwarded headers, JSON shape and bounded body are enforced',async t=>{
  const h=await setup(t,{maxBodyBytes:256});
  assert.equal(h.server.address().address,'127.0.0.1');
  error(await h.request('/api/auth/wechat',{code:'a'},'',{Host:'evil.example'}),'LOOPBACK_HOST_REQUIRED',403);
  error(await h.request('/api/auth/wechat',{code:'a'},'',{Origin:'https://evil.example'}),'ORIGIN_REJECTED',403);
  error(await h.request('/api/auth/wechat',{code:'a'},'',{'X-Forwarded-Proto':'https'}),'UNTRUSTED_PROXY_HEADERS',403);
  error(await h.request('/api/auth/wechat',null),'INVALID_PAYLOAD');
  error(await h.request('/api/auth/wechat',{code:'a'},'',{'Content-Type':'text/plain'}),'JSON_REQUIRED',415);
  error(await h.request('/api/auth/wechat',{code:'a'.repeat(1000)}),'BODY_TOO_LARGE',413);
  assert.equal((await fetch(h.url+'/package.json')).status,404);
  assert.equal((await fetch(h.url+'/health')).status,200);
});

test('online: HTTPS reverse proxy is explicit and non-loopback binds are refused',async t=>{
  const h=await setup(t,{publicOrigin:'https://game.example',trustProxy:true});
  error(await h.request('/api/auth/wechat',{code:'alice:1'},'',{Host:'game.example'}),'HTTPS_REQUIRED',403);
  error(await h.request('/api/auth/wechat',{code:'alice:1'},'',{Host:'game.example','X-Forwarded-Proto':'https',Origin:'https://other.example'}),'ORIGIN_REJECTED',403);
  const login=await h.request('/api/auth/wechat',{code:'alice:1'},'',{Host:'game.example','X-Forwarded-Proto':'https'});assert.equal(login.status,200);
  assert.throws(()=>API.createOnlineServer({dbFile:':memory:',deals:[deal],publicOrigin:'http://game.example',trustProxy:true}),/HTTPS_PUBLIC_ORIGIN_REQUIRED/);
  assert.throws(()=>h.server.listen(0,'0.0.0.0'),/LOOPBACK_BIND_REQUIRED/);
});

test('online: authentication rate limit survives restart and expires at the next window',async t=>{
  const h=await setup(t,{rateLimit:{auth:2,call:50,windowMs:60000}});
  await h.login('a:1');await h.login('a:2');
  error(await h.request('/api/auth/wechat',{code:'a:3'}),'RATE_LIMITED',429);
  await h.restart();error(await h.request('/api/auth/wechat',{code:'a:4'}),'RATE_LIMITED',429);
  h.advance(60000);await h.login('a:5');
});

test('online: invalid logs, foreign deals, excess durations and paging input cannot mutate data',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),r=await round(h,a.token);
  error(await h.call(a.token,'progress.put',{...payload(r),log:'broken',expectedRevision:0}),'LOG_REJECTED');
  const other=R.createIntegrated({...deal,dealId:'forged'},r.ticket.id);
  error(await h.call(a.token,'progress.put',{...payload(r,other),expectedRevision:0}),'DEAL_MISMATCH');
  error(await h.call(a.token,'progress.put',{...payload(r),elapsedMs:999999,expectedRevision:0}),'INVALID_DURATION');
  error(await h.call(a.token,'leaderboard',{limit:1000}),'INVALID_LEADERBOARD_QUERY');
  error(await h.call(a.token,'leaderboard',{cursor:'garbage'}),'INVALID_CURSOR');
  error(await h.call(a.token,'settle',payload(r)),'NOT_TERMINAL');
  assert.deepEqual((await h.call(a.token,'progress.get')).body.data,{revision:0,progress:null});
});

test('online: cloud-accepted EARNED rewards recover after expiry but cannot change their prefix',async t=>{
  const h=await setup(t,{verifyReward:async ({token})=>({verified:true,evidenceId:token})}),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}});
  const earned=command(s,'AD_CLOSE',{token,isEnded:true});
  assert.equal((await h.call(a.token,'progress.put',{...payload(r,earned),expectedRevision:0})).body.ok,true);
  await h.restart();h.advance(6*60000);
  const applied=command(earned,'COMMIT',{token});
  assert.equal((await h.call(a.token,'progress.put',{...payload(r,applied),expectedRevision:1})).body.ok,true);
  assert.equal((await h.call(a.token,'settle',payload(r,won(applied)))).body.ok,true);
});

test('online: pending verifier is rechecked against cancellation and cannot issue a late grant',async t=>{
  let finish,entered;const started=new Promise(resolve=>entered=resolve);
  const h=await setup(t,{verifyReward:async()=>{entered();return new Promise(resolve=>finish=resolve);}}),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});
  const observe=h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}});await started;
  const cancelled=command(s,'CANCEL',{token});
  assert.equal((await h.call(a.token,'progress.put',{...payload(r,cancelled),expectedRevision:0})).body.ok,true);
  finish({verified:true,evidenceId:'late-event'});error(await observe,'REWARD_OFFER_STALE',409);
  assert.equal((await h.call(a.token,'bootstrap')).body.data.totals.wins,0);
});

test('online: SQLite write failure rolls settlement, grant consumption and progress back together',async t=>{
  const h=await setup(t,{verifyReward:async({token})=>({verified:true,evidenceId:token})}),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}});
  const applied=committed(s);await h.call(a.token,'progress.put',{...payload(r,applied),expectedRevision:0});
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(h.config.dbFile);
  t.after(()=>db.close());
  db.exec("CREATE TRIGGER reject_result BEFORE UPDATE ON online_state WHEN json_extract(NEW.value,'$.social.results') != json_extract(OLD.value,'$.social.results') BEGIN SELECT RAISE(ABORT,'test disk failure'); END");
  const settlement=payload(r,won(applied));error(await h.call(a.token,'settle',settlement),'INTERNAL_ERROR',500);
  const snapshot=JSON.parse(db.prepare('SELECT value FROM online_state').get().value);
  assert.equal(snapshot.social.results[r.ticket.id],undefined);assert.equal(snapshot.grants[token].consumedBy,undefined);assert.equal(snapshot.progress[a.userId].revision,1);assert.ok(snapshot.progress[a.userId].progress);
  db.exec('DROP TRIGGER reject_result');
  assert.equal((await h.call(a.token,'settle',settlement)).body.data.replayed,false);
});

test('online: provider deadlines are bounded and boolean/client-only reward evidence is rejected',async t=>{
  const stuck=await setup(t,{providerTimeoutMs:20,exchangeCode:async()=>new Promise(()=>{})});
  error(await stuck.request('/api/auth/wechat',{code:'hanging'}),'WECHAT_CODE_EXCHANGE_FAILED',401);
  const h=await setup(t,{verifyReward:async()=>true}),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});
  error(await h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{isEnded:true}}),'REWARD_NOT_VERIFIED');
});

test('online: explicit clear retires the ticket before a pending verifier can revive a discarded branch',async t=>{
  let finish,entered;const started=new Promise(resolve=>entered=resolve);
  const h=await setup(t,{verifyReward:async()=>{entered();return new Promise(resolve=>finish=resolve);}}),a=await h.login('alice:1'),r=await round(h,a.token),s=offered(r.state),token=s.pending.token;
  await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)});
  const observe=h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}});await started;
  const cancelled=command(s,'CANCEL',{token});await h.call(a.token,'progress.put',{...payload(r,cancelled),expectedRevision:0});
  assert.deepEqual((await h.call(a.token,'progress.clear',{ticketId:r.ticket.id,expectedRevision:1})).body.data,{revision:2,progress:null});
  finish({verified:true,evidenceId:'discarded-event'});error(await observe,'TICKET_CLOSED');
  error(await h.call(a.token,'progress.put',{...payload(r),expectedRevision:2}),'TICKET_CLOSED');
  error(await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(s)}),'TICKET_CLOSED');
  error(await h.call(a.token,'settle',payload(r,won(r.state))),'TICKET_CLOSED');
  await h.restart();error(await h.call(a.token,'progress.put',{...payload(r),expectedRevision:2}),'TICKET_CLOSED');
  const next=await round(h,a.token),settlement=payload(next,won(next.state));
  assert.equal((await h.call(a.token,'settle',settlement)).body.ok,true);
  assert.equal((await h.call(a.token,'settle',settlement)).body.data.replayed,true);
});

function databaseSnapshot(h){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(h.config.dbFile);try{return JSON.parse(db.prepare('SELECT value FROM online_state').get().value);}finally{db.close();}}
function keepDevice(r,state,expectedRevision){return {...payload(r,state),expectedRevision,choice:'keep_device'};}

test('online: explicit resolution backs up another ticket and atomically retires only the displaced round',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),cloud=await round(h,a.token),device=await round(h,a.token);
  const cloudState=command(cloud.state,'PICK',{tileId:'t0'}),deviceState=command(device.state,'PICK',{tileId:'t1'});
  const saved=(await h.call(a.token,'progress.put',{...payload(cloud,cloudState),expectedRevision:0})).body.data;
  error(await h.call(a.token,'progress.put',{...payload(device,deviceState),expectedRevision:1}),'PROGRESS_ACTIVE_TICKET_CONFLICT',409);
  const resolved=await h.call(a.token,'progress.resolve',keepDevice(device,deviceState,1));assert.equal(resolved.body.ok,true,JSON.stringify(resolved.body));
  assert.equal(resolved.body.data.revision,2);assert.equal(resolved.body.data.progress.log,R.serialize(deviceState));assert.ok(resolved.body.data.backupId);
  const db=databaseSnapshot(h),backup=db.progressBackups[resolved.body.data.backupId];
  assert.equal(backup.userId,a.userId);assert.equal(backup.oldRevision,1);assert.deepEqual(backup.progress,saved.progress);assert.equal(backup.replacedByTicketId,device.ticket.id);
  error(await h.call(a.token,'progress.put',{...payload(cloud,cloudState),expectedRevision:2}),'TICKET_CLOSED');
  await h.restart();const current=(await h.call(a.token,'progress.get')).body.data;assert.equal(current.revision,2);assert.equal(current.progress.ticket.id,device.ticket.id);
  assert.ok(databaseSnapshot(h).progressBackups[resolved.body.data.backupId]);
  assert.equal((await h.call(a.token,'progress.put',{...payload(device,command(deviceState,'PICK',{tileId:'t4'})),expectedRevision:2})).body.ok,true);
});

test('online: explicit same-ticket pure-PICK resolution preserves the chosen board without relaxing put',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),r=await round(h,a.token);
  const cloud=command(r.state,'PICK',{tileId:'t0'}),device=command(r.state,'PICK',{tileId:'t1'});
  await h.call(a.token,'progress.put',{...payload(r,cloud),expectedRevision:0});
  error(await h.call(a.token,'progress.put',{...payload(r,device),expectedRevision:1}),'PROGRESS_LOG_CONFLICT',409);
  const resolved=await h.call(a.token,'progress.resolve',keepDevice(r,device,1));assert.equal(resolved.body.ok,true,JSON.stringify(resolved.body));
  assert.equal(resolved.body.data.progress.ticket.id,r.ticket.id);assert.deepEqual(R.restore(resolved.body.data.progress.log).state.board.rack,['t1']);
  assert.equal(databaseSnapshot(h).progressBackups[resolved.body.data.backupId].progress.log,R.serialize(cloud));
  error(await h.call(a.token,'progress.put',{...payload(r,command(cloud,'PICK',{tileId:'t3'})),expectedRevision:2}),'PROGRESS_LOG_CONFLICT',409);
  assert.equal((await h.call(a.token,'progress.put',{...payload(r,command(device,'PICK',{tileId:'t4'})),expectedRevision:2})).body.ok,true);
});

test('online: explicit branch resolution revokes every old offer before a waiting verifier returns',async t=>{
  let finish,entered;const started=new Promise(resolve=>entered=resolve);
  const h=await setup(t,{verifyReward:async()=>{entered();return new Promise(resolve=>finish=resolve);}}),a=await h.login('alice:1'),r=await round(h,a.token);
  const cloud=command(r.state,'PICK',{tileId:'t0'}),device=command(r.state,'PICK',{tileId:'t1'}),pending=offered(r.state),token=pending.pending.token;
  await h.call(a.token,'progress.put',{...payload(r,cloud),expectedRevision:0});await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(pending)});
  const observe=h.call(a.token,'reward.observe',{ticketId:r.ticket.id,token,observation:{}});await started;
  const resolved=await h.call(a.token,'progress.resolve',keepDevice(r,device,1));assert.equal(resolved.body.ok,true,JSON.stringify(resolved.body));
  finish({verified:true,evidenceId:'obsolete-offer'});error(await observe,'REWARD_OFFER_REVOKED',409);
  error(await h.call(a.token,'reward.offer',{ticketId:r.ticket.id,log:R.serialize(pending)}),'REWARD_OFFER_REVOKED',409);
  const db=databaseSnapshot(h);assert.equal(db.grants[token],undefined);assert.ok(db.offers[token].revokedAt!==undefined);
});

test('online: explicit same-ticket reward branches or hidden issued grants require cloud recovery or restart',async t=>{
  const h=await setup(t,{verifyReward:async({token})=>({verified:true,evidenceId:token})}),a=await h.login('alice:1'),r=await round(h,a.token),device=command(r.state,'PICK',{tileId:'t1'}),pending=offered(r.state);
  const cancelled=command(pending,'CANCEL',{token:pending.pending.token});await h.call(a.token,'progress.put',{...payload(r,cancelled),expectedRevision:0});
  error(await h.call(a.token,'progress.resolve',keepDevice(r,device,1)),'PROGRESS_REWARD_BRANCH_CONFLICT',409);
  assert.equal((await h.call(a.token,'progress.get')).body.data.revision,1);
  const h2=await setup(t,{verifyReward:async({token})=>({verified:true,evidenceId:token})}),b=await h2.login('bob:1'),r2=await round(h2,b.token),p2=offered(r2.state),token=p2.pending.token;
  await h2.call(b.token,'progress.put',{...payload(r2,command(r2.state,'PICK',{tileId:'t0'})),expectedRevision:0});
  await h2.call(b.token,'reward.offer',{ticketId:r2.ticket.id,log:R.serialize(p2)});await h2.call(b.token,'reward.observe',{ticketId:r2.ticket.id,token,observation:{}});
  error(await h2.call(b.token,'progress.resolve',keepDevice(r2,command(r2.state,'PICK',{tileId:'t1'}),1)),'PROGRESS_REWARD_BRANCH_CONFLICT',409);
});

test('online: explicit resolution retains CAS, ownership, choice and accepted settlement boundaries',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),b=await h.login('bob:1'),cloud=await round(h,a.token),device=await round(h,a.token),foreign=await round(h,b.token);
  await h.call(a.token,'progress.put',{...payload(cloud),expectedRevision:0});
  error(await h.call(a.token,'progress.resolve',{...payload(device),expectedRevision:1}),'INVALID_RESOLUTION_CHOICE');
  error(await h.call(a.token,'progress.resolve',keepDevice(foreign,foreign.state,1)),'TICKET_OWNER');
  error(await h.call(a.token,'progress.resolve',keepDevice(device,device.state,0)),'PROGRESS_CONFLICT',409);
  const accepted=await round(h,a.token),settlement=payload(accepted,won(accepted.state));assert.equal((await h.call(a.token,'settle',settlement)).body.ok,true);
  error(await h.call(a.token,'progress.resolve',keepDevice(accepted,won(accepted.state),1)),'TICKET_SETTLED');
  const data=keepDevice(device,device.state,1),results=await Promise.all([h.call(a.token,'progress.resolve',data),h.call(a.token,'progress.resolve',data)]);
  assert.equal(results.filter(r=>r.body.ok).length,1);assert.equal(results.find(r=>!r.body.ok).body.error,'PROGRESS_CONFLICT');
  assert.equal((await h.call(a.token,'settle',settlement)).body.data.replayed,true);
});

test('online: failed resolution commits neither backup nor retired ticket nor replacement progress',async t=>{
  const h=await setup(t),a=await h.login('alice:1'),cloud=await round(h,a.token),device=await round(h,a.token);
  const saved=(await h.call(a.token,'progress.put',{...payload(cloud),expectedRevision:0})).body.data;
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(h.config.dbFile);t.after(()=>db.close());
  db.exec("CREATE TRIGGER reject_backup BEFORE UPDATE ON online_state WHEN json_extract(NEW.value,'$.progressBackups') IS NOT json_extract(OLD.value,'$.progressBackups') BEGIN SELECT RAISE(ABORT,'test disk failure'); END");
  error(await h.call(a.token,'progress.resolve',keepDevice(device,device.state,1)),'INTERNAL_ERROR',500);
  const state=databaseSnapshot(h);assert.deepEqual(state.progress[a.userId],saved);assert.equal(state.social.tickets[cloud.ticket.id].retiredAt,undefined);assert.equal(Object.keys(state.progressBackups||{}).length,0);
  db.exec('DROP TRIGGER reject_backup');assert.equal((await h.call(a.token,'progress.resolve',keepDevice(device,device.state,1))).body.ok,true);
});
