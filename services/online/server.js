'use strict';
// Independent authenticated service. The development service and frozen round engine stay unchanged.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {createWechatExchange} = require('./wechat');
const {createSocial} = require('../../src/product/social');
const R = require('../../src/product/round');
const {cycle, tutorial} = require('../../src/product/catalog');
const {hashSnapshot} = require('../../src/content-hash');
const clone = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class ApiError extends Error { constructor(code,status=400){super(code);this.status=status;} }
const fail=(code,status)=>{throw new ApiError(code,status);};
const conflict=code=>fail(code,409);
function keys(data,allowed){if(!object(data)||Object.keys(data).some(key=>!allowed.includes(key)))fail('INVALID_PAYLOAD');}
async function bounded(operation,timeoutMs){
  let timer;
  try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PROVIDER_TIMEOUT')),timeoutMs);timer.unref();})]);}
  finally{clearTimeout(timer);}
}
function samePrefix(previous,next){return previous.length<=next.length&&previous.every((command,index)=>JSON.stringify(command)===JSON.stringify(next[index]));}

function createOnlineServer(options={}) {
  const deals=clone(options.deals||[270,540,720].map(n=>require('../../examples/deal-'+n+'.json')));
  if(!Array.isArray(deals)||!deals.length)throw Error('DEALS_REQUIRED');
  const now=options.now||Date.now,sessionTtlMs=options.sessionTtlMs||8*3600000;
  const providerTimeoutMs=options.providerTimeoutMs||8000;
  if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>30000)throw Error('INVALID_PROVIDER_TIMEOUT');
  const exchangeCode=options.exchangeCode||createWechatExchange({env:options.env||process.env});
  let publicOrigin=null;
  if(options.publicOrigin){
    try{publicOrigin=new URL(options.publicOrigin);}catch{throw Error('HTTPS_PUBLIC_ORIGIN_REQUIRED');}
    if(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password||publicOrigin.pathname!=='/'||publicOrigin.search||publicOrigin.hash)throw Error('HTTPS_PUBLIC_ORIGIN_REQUIRED');
    if(options.trustProxy!==true)throw Error('EXPLICIT_TRUST_PROXY_REQUIRED');
  }
  const limits={auth:30,call:600,windowMs:60000,...options.rateLimit};
  for(const key of ['auth','call','windowMs'])if(!Number.isSafeInteger(limits[key])||limits[key]<1)throw Error('INVALID_RATE_LIMIT');
  const dbFile=options.dbFile||path.resolve(__dirname,'../../local-data/online.sqlite');
  if(dbFile!==':memory:')fs.mkdirSync(path.dirname(dbFile),{recursive:true});
  const db=new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS online_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL) STRICT');
  const initial={version:1,social:JSON.parse(createSocial({deals,now}).export()),sessions:{},codes:{},progress:{},offers:{},grants:{},evidence:{}};
  db.prepare('INSERT OR IGNORE INTO online_state(id,value) VALUES(1,?)').run(JSON.stringify(initial));
  function transaction(fn){
    db.exec('BEGIN IMMEDIATE');
    try{const state=JSON.parse(db.prepare('SELECT value FROM online_state WHERE id=1').get().value);
      if(state.version!==1)throw Error('INVALID_ONLINE_DATABASE');
      const result=fn(state);db.prepare('UPDATE online_state SET value=? WHERE id=1').run(JSON.stringify(state));db.exec('COMMIT');return clone(result);
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function socialCall(state,user,action,data){
    const social=createSocial({deals,now,initial:JSON.stringify(state.social)});
    let output;
    try{output=social.call(user,action,data);}catch(error){
      const code=error.message;
      if(['INVALID_MODE','TICKET_UNKNOWN','TICKET_OWNER','CYCLE_EXPIRED','INVALID_DURATION','DEAL_MISMATCH','NOT_TERMINAL','INVALID_SKIN','SKIN_LOCKED','INVALID_BULLET'].includes(code))fail(code);
      if(code==='SETTLEMENT_CONFLICT')conflict(code);
      if(code.startsWith('LOG_REJECTED:'))fail('LOG_REJECTED');
      throw error;
    }
    state.social=JSON.parse(social.export());return output;
  }
  function session(state,token){
    const entry=state.sessions[hash(token)];if(!entry)fail('SESSION_REQUIRED',401);
    if(now()>=entry.expiresAt)fail('SESSION_EXPIRED',401);return entry;
  }
  function ticketFor(state,user,id,allowSettled=false){
    if(typeof id!=='string'||!own(state.social.tickets,id))fail('TICKET_UNKNOWN');
    const ticket=state.social.tickets[id];if(ticket.userId!==user)fail('TICKET_OWNER');
    if(ticket.retiredAt!==undefined)fail('TICKET_CLOSED');
    if(ticket.day!==cycle(now())||now()>=ticket.expiresAt)fail('CYCLE_EXPIRED');
    if(!allowSettled&&own(state.social.results,id))fail('TICKET_SETTLED');return ticket;
  }
  function replay(state,user,data,{allowSettled=false}={}){
    const ticket=ticketFor(state,user,data.ticketId,allowSettled);
    if(typeof data.log!=='string')fail('LOG_REJECTED');
    const restored=R.restore(data.log);if(!restored.ok)fail('LOG_REJECTED');
    const round=restored.state,assigned=ticket.mode==='tutorial'?tutorial():deals[ticket.index];
    if(round.roundId!==ticket.id||!assigned||round.initialDeal.dealId!==assigned.dealId||hashSnapshot(round.initialDeal)!==hashSnapshot(assigned))fail('DEAL_MISMATCH');
    return {ticket,round};
  }
  function duration(ticket,elapsed){if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>Math.max(0,now()-ticket.createdAt)+1500)fail('INVALID_DURATION');}
  function progressFor(state,user){
    const record=state.progress[user]||(state.progress[user]={revision:0,progress:null});
    if(record.progress&&(record.progress.ticket.day!==cycle(now())||record.progress.ticket.expiresAt<=now())){record.revision++;record.progress=null;}
    return record;
  }
  function checkProgressPrefix(record,ticket,round,elapsed){
    if(!record.progress||record.progress.ticket.id!==ticket.id)return;
    const previous=R.restore(record.progress.log).state;
    if(!previous||!samePrefix(previous.commands,round.commands)||elapsed<record.progress.elapsedMs)conflict('PROGRESS_LOG_CONFLICT');
  }
  function bootstrap(output){
    output.dataMode='authenticated_service';output.capabilities={rewards:typeof options.verifyReward==='function',cloudProgress:true};
    output.timingVerification='unverified_client_duration';output.honors.fast=null;output.honors.king=null;
    output.policy={...output.policy,productionEnabled:false,service:'authenticated_sqlite',rewardVerification:'trusted_verifier_required',speedHonorsEnabled:false};
    return output;
  }
  function offerPrefix(round){
    const index=round.commands.findLastIndex(command=>command.type==='OFFER');
    return round.commands.slice(0,index+1);
  }
  function checkGrants(state,user,ticket,round,accept=false){
    let cursor=R.createIntegrated(round.initialDeal,round.roundId);
    const used=[];
    for(let index=0;index<round.commands.length;index++){
      const command=round.commands[index];
      if(command.type==='SHARE_RETURN')fail('REWARD_CHANNEL_UNSUPPORTED');
      if(command.type==='COMMIT'||(command.type==='AD_CLOSE'&&command.isEnded===true)){
        const grant=state.grants[command.token];if(!grant)fail('REWARD_GRANT_REQUIRED');
        const pending=cursor.pending;
        if(!pending||grant.userId!==user||grant.ticketId!==ticket.id||grant.assist!==pending.assist||grant.boardRevision!==pending.boardRevision||grant.channel!=='video'||
          grant.offerHash!==hash(JSON.stringify(offerPrefix(cursor))))fail('REWARD_GRANT_MISMATCH');
        if(grant.consumedBy&&grant.consumedBy!==ticket.id)fail('REWARD_GRANT_CONSUMED');
        if(grant.earnedHash&&grant.earnedHash!==hash(JSON.stringify(round.commands.slice(0,grant.earnedLength))))fail('REWARD_GRANT_MISMATCH');
        if(grant.commitHash){
          if(grant.commitHash!==hash(JSON.stringify(round.commands.slice(0,grant.commitLength))))fail('REWARD_GRANT_MISMATCH');
        }else if(!grant.earnedHash&&now()>=grant.expiresAt)fail('REWARD_GRANT_EXPIRED');
        if(accept&&command.type==='AD_CLOSE'){grant.earnedHash=hash(JSON.stringify(round.commands.slice(0,index+1)));grant.earnedLength=index+1;}
        if(command.type==='COMMIT'){
          const commitHash=hash(JSON.stringify(round.commands.slice(0,index+1)));
          if(grant.commitHash&&grant.commitHash!==commitHash)fail('REWARD_GRANT_MISMATCH');
          if(accept){grant.commitHash=commitHash;grant.commitLength=index+1;grant.appliedAt=grant.appliedAt||now();}
          used.push(command.token);
        }
      }
      cursor=R.dispatch(cursor,command).state;
    }
    return used;
  }
  function currentOffer(state,user,data){
    const ticket=ticketFor(state,user,data.ticketId);
    if(typeof data.token!=='string'||!own(state.offers,data.token))fail('REWARD_OFFER_UNKNOWN');
    const offer=state.offers[data.token];
    if(offer.revokedAt!==undefined)conflict('REWARD_OFFER_REVOKED');
    if(offer.userId!==user||offer.ticketId!==ticket.id)fail('REWARD_GRANT_MISMATCH');
    const record=progressFor(state,user);
    if(record.progress){
      if(record.progress.ticket.id!==ticket.id)conflict('REWARD_OFFER_STALE');
      const saved=R.restore(record.progress.log).state;
      if(!saved||(!samePrefix(offer.commands,saved.commands)&&!samePrefix(saved.commands,offer.commands))||
        (own(saved.resolved,offer.token)&&saved.resolved[offer.token].status!=='APPLIED'))conflict('REWARD_OFFER_STALE');
    }
    return offer;
  }
  async function observe(token,data){
    keys(data,['ticketId','token','observation']);
    if(!object(data.observation)||JSON.stringify(data.observation).length>16384)fail('INVALID_OBSERVATION');
    transaction(state=>{session(state,token);return null;});
    if(typeof options.verifyReward!=='function')fail('TRUSTED_REWARD_VERIFIER_NOT_CONFIGURED',503);
    const observationHash=hash(JSON.stringify(data.observation));
    const pending=transaction(state=>{
      const {userId}=session(state,token),offer=currentOffer(state,userId,data),grant=state.grants[data.token];
      if(grant){if(grant.observationHash!==observationHash)conflict('REWARD_OBSERVATION_CONFLICT');return {authorized:true,token:data.token};}
      if(now()>=offer.expiresAt)fail('REWARD_GRANT_EXPIRED');
      return {userId,ticketId:offer.ticketId,token:offer.token,assist:offer.assist,channel:offer.channel,boardRevision:offer.boardRevision,expiresAt:offer.expiresAt,observation:data.observation};
    });
    if(pending.authorized)return pending;
    let verification;try{verification=await bounded(()=>options.verifyReward(clone(pending)),providerTimeoutMs);}catch{fail('REWARD_VERIFICATION_FAILED',503);}
    if(!object(verification)||verification.verified!==true||typeof verification.evidenceId!=='string'||!verification.evidenceId.length||verification.evidenceId.length>512)fail('REWARD_NOT_VERIFIED');
    return transaction(state=>{
      const {userId}=session(state,token),offer=currentOffer(state,userId,data),existing=state.grants[data.token];
      if(existing){if(existing.observationHash!==observationHash)conflict('REWARD_OBSERVATION_CONFLICT');return {authorized:true,token:data.token};}
      if(now()>=offer.expiresAt)fail('REWARD_GRANT_EXPIRED');
      const evidenceHash=hash(verification.evidenceId);
      if(own(state.evidence,evidenceHash))conflict('REWARD_EVIDENCE_REUSED');
      state.evidence[evidenceHash]=data.token;
      state.grants[data.token]={userId,ticketId:offer.ticketId,token:offer.token,assist:offer.assist,channel:offer.channel,boardRevision:offer.boardRevision,
        offerHash:offer.offerHash,issuedAt:now(),expiresAt:offer.expiresAt,evidenceHash,observationHash};
      return {authorized:true,token:data.token};
    });
  }
  function dispatch(state,user,action,data){
    const schema={bootstrap:[],start:['mode'],settle:['ticketId','log','elapsedMs'],equip:['skin'],bullet:['id'],
      'reward.offer':['ticketId','log'],'progress.get':[],'progress.put':['expectedRevision','ticketId','log','elapsedMs'],'progress.clear':['expectedRevision','ticketId'],'progress.resolve':['expectedRevision','ticketId','log','elapsedMs','choice'],leaderboard:['mode','day','limit','cursor']};
    if(!own(schema,action))fail('UNKNOWN_ACTION');keys(data,schema[action]);
    if(['bootstrap','equip','bullet'].includes(action))return bootstrap(socialCall(state,user,action,data));
    if(action==='start')return socialCall(state,user,action,data);
    if(action==='reward.offer'){
      const {ticket,round}=replay(state,user,data);checkGrants(state,user,ticket,round);
      const pending=round.pending;if(!pending||!['OFFERED','WAITING'].includes(pending.phase))fail('REWARD_OFFER_REQUIRED');
      if(pending.channel!=='video')fail('REWARD_CHANNEL_UNSUPPORTED');
      const commands=offerPrefix(round),offerHash=hash(JSON.stringify(commands));
      const existing=state.offers[pending.token];
      if(existing){if(existing.revokedAt!==undefined)conflict('REWARD_OFFER_REVOKED');if(existing.offerHash!==offerHash||existing.userId!==user||existing.ticketId!==ticket.id)conflict('REWARD_OFFER_CONFLICT');return {token:existing.token,expiresAt:existing.expiresAt};}
      const offer={userId:user,ticketId:ticket.id,token:pending.token,assist:pending.assist,channel:pending.channel,boardRevision:pending.boardRevision,
        commands,offerHash,createdAt:now(),expiresAt:Math.min(ticket.expiresAt,now()+5*60000)};
      state.offers[pending.token]=offer;return {token:offer.token,expiresAt:offer.expiresAt};
    }
    if(action==='progress.get')return progressFor(state,user);
    if(action==='progress.put'){
      const {ticket,round}=replay(state,user,data),record=progressFor(state,user);duration(ticket,data.elapsedMs);
      if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==record.revision)conflict('PROGRESS_CONFLICT');
      if(record.progress&&record.progress.ticket.id!==ticket.id)conflict('PROGRESS_ACTIVE_TICKET_CONFLICT');
      checkProgressPrefix(record,ticket,round,data.elapsedMs);
      checkGrants(state,user,ticket,round,true);
      record.revision++;record.progress={ticket,log:data.log,elapsedMs:data.elapsedMs};return record;
    }
    if(action==='progress.resolve'){
      if(data.choice!=='keep_device')fail('INVALID_RESOLUTION_CHOICE');
      const {ticket,round}=replay(state,user,data),record=progressFor(state,user);duration(ticket,data.elapsedMs);
      if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==record.revision)conflict('PROGRESS_CONFLICT');
      if(!record.progress)conflict('PROGRESS_NO_CONFLICT');
      const previous=record.progress,oldTicketId=previous.ticket.id,sameTicket=oldTicketId===ticket.id;
      if(sameTicket){
        const saved=R.restore(previous.log);if(!saved.ok)fail('LOG_REJECTED');
        const pure=state=>state.commands.every(command=>command.type==='PICK');
        if(!pure(saved.state)||!pure(round)||Object.values(state.grants).some(grant=>grant.ticketId===ticket.id))conflict('PROGRESS_REWARD_BRANCH_CONFLICT');
      }
      checkGrants(state,user,ticket,round,true);
      const serial=(state.progressBackupSerial||0)+1,backupId='progress-backup-'+serial;
      state.progressBackupSerial=serial;
      const backups=state.progressBackups||(state.progressBackups={});
      backups[backupId]={userId:user,createdAt:now(),oldRevision:record.revision,kind:sameTicket?'same_ticket_pick_branch':'different_ticket',
        replacedByTicketId:ticket.id,progress:clone(previous)};
      if(!sameTicket)state.social.tickets[oldTicketId].retiredAt=now();
      // No SDK callback started before the user's explicit resolution may mint a new grant.
      for(const offer of Object.values(state.offers))if(offer.userId===user&&
        (offer.ticketId===oldTicketId||(offer.ticketId===ticket.id&&!own(state.grants,offer.token))))offer.revokedAt=now();
      record.revision++;record.progress={ticket,log:data.log,elapsedMs:data.elapsedMs};
      return {...record,backupId};
    }
    if(action==='progress.clear'){
      ticketFor(state,user,data.ticketId,true);const record=progressFor(state,user);
      if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==record.revision)conflict('PROGRESS_CONFLICT');
      if(record.progress&&record.progress.ticket.id!==data.ticketId)conflict('PROGRESS_TICKET_CONFLICT');
      state.social.tickets[data.ticketId].retiredAt=now();
      record.revision++;record.progress=null;return record;
    }
    if(action==='settle'){
      // Exact retries remain valid after expiry; the original accepted result is immutable.
      const accepted=state.social.results[data.ticketId];
      if(accepted){
        if(accepted.userId!==user)fail('TICKET_OWNER');
        if(accepted.signature!==hash(JSON.stringify([data.ticketId,data.log,data.elapsedMs])))conflict('SETTLEMENT_CONFLICT');
        return {replayed:true,result:accepted};
      }
      const {ticket,round}=replay(state,user,data),record=progressFor(state,user);duration(ticket,data.elapsedMs);
      checkProgressPrefix(record,ticket,round,data.elapsedMs);
      const used=checkGrants(state,user,ticket,round,true);
      const result=socialCall(state,user,'settle',data);
      for(const token of used)state.grants[token].consumedBy=ticket.id;
      const persisted=state.social.results[ticket.id];persisted.rewardVerification=used.length?'trusted_server_grants':'no_rewards_used';persisted.timingVerification='unverified_client_duration';
      if(record.progress&&record.progress.ticket.id===ticket.id){record.revision++;record.progress=null;}
      result.result=persisted;return result;
    }
    const mode=data.mode||'daily',day=data.day||cycle(now()),limit=data.limit===undefined?20:data.limit;
    if(!['daily','topic'].includes(mode)||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_LEADERBOARD_QUERY');
    let offset=0;
    if(data.cursor!==undefined){try{const cursor=JSON.parse(Buffer.from(data.cursor,'base64url').toString());if(cursor.day!==day||cursor.mode!==mode||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)throw Error();offset=cursor.offset;}catch{fail('INVALID_CURSOR');}}
    const winners=new Map();
    for(const result of Object.values(state.social.results).filter(r=>r.day===day&&r.mode===mode&&r.status==='WON').sort((a,b)=>a.endedAt-b.endedAt||a.ticketId.localeCompare(b.ticketId)))if(!winners.has(result.userId))winners.set(result.userId,result);
    const results=[...winners.values()],entries=results.slice(offset,offset+limit).map(r=>({userId:r.userId,name:state.social.users[r.userId].name,region:r.region,endedAt:r.endedAt}));
    return {day,mode,ordering:'accepted_completion_time',timingVerification:'unverified_client_duration',entries,total:results.length,
      nextCursor:offset+limit<results.length?Buffer.from(JSON.stringify({day,mode,offset:offset+limit})).toString('base64url'):null};
  }
  const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  const maxBody=options.maxBodyBytes||10*1024*1024;
  function parse(req){
    return new Promise((resolve,reject)=>{
      let bytes=0,chunks=[],failed=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBody){failed=true;chunks=[];reject(new ApiError('BODY_TOO_LARGE',413));}else if(!failed)chunks.push(chunk);});
      req.on('end',()=>{if(failed)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new ApiError('INVALID_JSON'));}});
      req.on('error',()=>reject(new ApiError('INVALID_BODY')));
    });
  }
  function rateLimit(kind,peer){
    transaction(state=>{
      const counters=state.limits||(state.limits={}),key=kind+':'+peer,time=now();
      for(const key of Object.keys(counters))if(counters[key].resetAt<=time)delete counters[key];
      const counter=counters[key]||(counters[key]={count:0,resetAt:time+limits.windowMs});
      if(counter.count>=limits[kind])fail('RATE_LIMITED',429);counter.count++;return null;
    });
  }
  const server=http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'',origin=req.headers.origin;
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail('LOOPBACK_PEER_REQUIRED',403);
      if(publicOrigin){
        if(host!==publicOrigin.host)fail('HOST_REJECTED',403);
        if(req.headers['x-forwarded-proto']!=='https')fail('HTTPS_REQUIRED',403);
        if(origin&&origin!==publicOrigin.origin)fail('ORIGIN_REJECTED',403);
      }else{
        if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))fail('LOOPBACK_HOST_REQUIRED',403);
        if(Object.keys(req.headers).some(key=>key==='forwarded'||key.startsWith('x-forwarded-')))fail('UNTRUSTED_PROXY_HEADERS',403);
        if(origin&&origin!=='http://'+host)fail('ORIGIN_REJECTED',403);
      }
      if(req.method==='GET'&&req.url==='/health')return send(res,200,{mode:'authenticated_service',production:false});
      if(req.method!=='POST'||!['/api/auth/wechat','/api/call'].includes(req.url))fail('NOT_FOUND',404);
      rateLimit(req.url==='/api/auth/wechat'?'auth':'call',req.socket.remoteAddress);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))fail('JSON_REQUIRED',415);
      const body=await parse(req);if(!object(body))fail('INVALID_PAYLOAD');
      if(req.url==='/api/auth/wechat'){
        keys(body,['code']);if(typeof body.code!=='string'||!/^[A-Za-z0-9._:\-]{1,256}$/.test(body.code))fail('INVALID_LOGIN_CODE');
        if(typeof exchangeCode!=='function')fail('WECHAT_AUTH_NOT_CONFIGURED',503);
        const codeHash=hash(body.code);
        transaction(state=>{if(own(state.codes,codeHash))conflict('LOGIN_CODE_USED');state.codes[codeHash]=now();return null;});
        let identity;try{identity=await bounded(()=>exchangeCode(body.code),providerTimeoutMs);}catch{fail('WECHAT_CODE_EXCHANGE_FAILED',401);}
        if(!object(identity)||identity.errcode||typeof identity.openid!=='string'||!identity.openid.length||identity.openid.length>256)fail('WECHAT_CODE_EXCHANGE_FAILED',401);
        const userId='wx-'+hash(identity.openid).slice(0,40),token=crypto.randomBytes(32).toString('base64url'),expiresAt=now()+sessionTtlMs;
        transaction(state=>{state.sessions[hash(token)]={userId,expiresAt};socialCall(state,userId,'bootstrap',{});return null;});
        return send(res,200,{token,userId,expiresAt});
      }
      keys(body,['action','data']);const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1]||'';
      const output=body.action==='reward.observe'?await observe(token,body.data):transaction(state=>{const identity=session(state,token);return dispatch(state,identity.userId,body.action,body.data===undefined?{}:body.data);});
      return send(res,200,{ok:true,data:output});
    }catch(error){if(!res.headersSent)send(res,error instanceof ApiError?error.status:500,{ok:false,error:error instanceof ApiError?error.message:'INTERNAL_ERROR'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const listen=server.listen;
  server.listen=function(port,host,...rest){
    if(typeof port==='object'){if(port.host&&!['127.0.0.1','::1','localhost'].includes(port.host))throw Error('LOOPBACK_BIND_REQUIRED');return listen.call(this,{...port,host:port.host||'127.0.0.1'},host,...rest);}
    if(typeof host==='function'||host===undefined)return listen.call(this,port,'127.0.0.1',host,...rest);
    if(!['127.0.0.1','::1','localhost'].includes(host))throw Error('LOOPBACK_BIND_REQUIRED');return listen.call(this,port,host,...rest);
  };
  server.once('close',()=>db.close());return server;
}
if(require.main===module){
  const port=Number(process.env.ONLINE_PORT||8771);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
  const server=createOnlineServer({dbFile:process.env.ONLINE_DB_FILE,publicOrigin:process.env.ONLINE_PUBLIC_ORIGIN,trustProxy:process.env.ONLINE_TRUST_PROXY==='1'});
  server.on('error',()=>{console.error('Online service could not start');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Authenticated service listening on loopback port '+port+'; production acceptance is not enabled'));
}
module.exports={createOnlineServer,createWechatExchange};
