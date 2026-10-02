'use strict';
/** Our development service, not the original server. All ranking/eligibility policies below
 * are disclosed reconstruction choices. Real ad evidence and production auth are not inferred.
 */
const R=require('./round'),{sha256Hex,hashSnapshot}=require('../content-hash');
const {REGIONS,SKINS,BULLETS,cycle,nextReset,tutorial,POLICY}=require('./catalog');
const clone=v=>JSON.parse(JSON.stringify(v)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
function createSocial(options={}){
 if(!Array.isArray(options.deals)||!options.deals.length)throw Error('DEALS_REQUIRED');
 const deals=options.deals,now=options.now||Date.now,save=options.save||(()=>{});
 let db={version:12,serial:0,users:{},tickets:{},results:{},bullets:[]};
 if(options.initial){try{const parsed=JSON.parse(options.initial);if(parsed.version!==12||!parsed.users||!parsed.tickets||!parsed.results||!Array.isArray(parsed.bullets))throw Error();db=parsed;}catch(e){throw Error('INVALID_SOCIAL_SAVE');}}
 function tx(fn){const draft=clone(db),out=fn(draft);save(JSON.stringify(draft));db=draft;return clone(out);}
 function group(user,day){return parseInt(sha256Hex(user+':'+day).slice(0,8),16)%2;}
 function allResults(d){return Object.values(d.results);}
 function wins(d,day,mode){return allResults(d).filter(r=>r.day===day&&r.mode===mode&&r.status==='WON');}
 function winners(d,day,mode){const a=new Map();for(const r of wins(d,day,mode))if(!a.has(r.userId))a.set(r.userId,r);return [...a.values()];}
 function topicScores(d,day){const a=[0,0];for(const r of winners(d,day,'topic'))a[group(r.userId,day)]++;return a;}
 function ensure(user){if(own(db.users,user))return;tx(d=>{d.users[user]={id:user,name:'本地玩家',region:REGIONS[0],skin:'plain',owned:['plain'],tutorialDone:false,createdAt:now()};return null;});}
 function awardPreviousTopic(user){const yesterday=cycle(now()-86400000),scores=topicScores(db,yesterday),team=group(user,yesterday);
  if(scores[team]>scores[1-team]&&winners(db,yesterday,'topic').some(r=>r.userId===user)&&!db.users[user].owned.includes('scarf'))tx(d=>{d.users[user].owned.push('scarf');return null;});}
 function bootstrap(user){awardPreviousTopic(user);const day=cycle(now()),u=db.users[user],daily=winners(db,day,'daily'),results=allResults(db),self=results.filter(r=>r.userId===user),today=self.filter(r=>r.day===day&&r.mode==='daily');
  const regions=REGIONS.map(name=>({name,wins:daily.filter(r=>r.region===name).length,attempts:results.filter(r=>r.day===day&&r.mode==='daily'&&r.region===name).length})).sort((a,b)=>b.wins-a.wins||REGIONS.indexOf(a.name)-REGIONS.indexOf(b.name));
  const yesterday=cycle(now()-86400000),yw=wins(db,yesterday,'daily'),byTime=a=>a.slice().sort((a,b)=>a.elapsedMs-b.elapsedMs||a.endedAt-b.endedAt||a.userId.localeCompare(b.userId))[0]||null;
  const publicHonor=r=>r?{userId:r.userId,name:db.users[r.userId].name,region:r.region,elapsedMs:r.elapsedMs,endedAt:r.endedAt}:null;
  return {dataMode:'development_local',policy:POLICY,day,nextReset:nextReset(now()),profile:u,regions,
   totals:{wins:daily.length,attempts:results.filter(r=>r.day===day&&r.mode==='daily').length},
   today:{won:today.some(r=>r.status==='WON'),failures:today.filter(r=>r.status==='LOST').length},
   topic:{id:'local-topic-'+day,title:'早起派与夜猫派',sampleContent:true,labels:['早起派','夜猫派'],team:group(user,day),scores:topicScores(db,day),won:self.some(r=>r.day===day&&r.mode==='topic'&&r.status==='WON'),previousScores:topicScores(db,yesterday)},
   honors:{day:yesterday,first:publicHonor(yw.slice().sort((a,b)=>a.endedAt-b.endedAt||a.userId.localeCompare(b.userId))[0]),fast:publicHonor(byTime(yw)),king:publicHonor(byTime(yw.filter(r=>Object.values(r.used).every(v=>v===0))))},
   skins:SKINS.map(s=>({...s,owned:u.owned.includes(s.id)})),
   history:{wins:new Set(self.filter(r=>r.status==='WON'&&r.mode==='daily').map(r=>r.day)).size,records:self.slice().reverse().map(r=>({day:r.day,mode:r.mode,status:r.status,elapsedMs:r.elapsedMs}))},
   bullets:db.bullets.filter(b=>b.day===day).slice(-12),presetBullets:BULLETS};
 }
 function call(user,action,data={}){
  if(!validId(user))throw Error('INVALID_USER');
  if(!['bootstrap','start','settle','equip','bullet'].includes(action))throw Error('UNKNOWN_ACTION');
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_PAYLOAD');
  ensure(user);
  if(action==='bootstrap')return clone(bootstrap(user));
  if(action==='start'){
   if(!['tutorial','daily','topic'].includes(data.mode))throw Error('INVALID_MODE');
   const day=cycle(now()),index=parseInt(sha256Hex(day+':'+data.mode).slice(0,8),16)%deals.length;
   const deal=data.mode==='tutorial'?tutorial():clone(deals[index]);
   return tx(d=>{const id='r-'+now().toString(36)+'-'+(++d.serial)+'-'+sha256Hex(user).slice(0,10);
    const ticket={id,userId:user,mode:data.mode,day,createdAt:now(),expiresAt:nextReset(now()),dealId:deal.dealId,index,region:d.users[user].region};
    d.tickets[id]=ticket;return {ticket,deal};});
  }
  if(action==='settle'){
   if(typeof data.ticketId!=='string'||!own(db.tickets,data.ticketId))throw Error('TICKET_UNKNOWN');
   const ticket=db.tickets[data.ticketId];if(ticket.userId!==user)throw Error('TICKET_OWNER');
   const signature=sha256Hex(JSON.stringify([data.ticketId,data.log,data.elapsedMs]));
   if(own(db.results,ticket.id)){if(db.results[ticket.id].signature!==signature)throw Error('SETTLEMENT_CONFLICT');return {replayed:true,result:clone(db.results[ticket.id])};}
   if(ticket.day!==cycle(now())||now()>=ticket.expiresAt)throw Error('CYCLE_EXPIRED');
   if(!Number.isSafeInteger(data.elapsedMs)||data.elapsedMs<0||data.elapsedMs>Math.max(0,now()-ticket.createdAt)+1500)throw Error('INVALID_DURATION');
   const replay=R.restore(data.log);if(!replay.ok)throw Error('LOG_REJECTED:'+replay.code);
   const s=replay.state,assigned=ticket.mode==='tutorial'?tutorial():deals[ticket.index];
   if(s.roundId!==ticket.id||s.initialDeal.dealId!==assigned.dealId||hashSnapshot(s.initialDeal)!==hashSnapshot(assigned))throw Error('DEAL_MISMATCH');
   if(!['WON','LOST'].includes(s.board.status)||s.pending)throw Error('NOT_TERMINAL');
   return tx(d=>{const result={ticketId:ticket.id,userId:user,region:ticket.region,day:ticket.day,mode:ticket.mode,status:s.board.status,elapsedMs:data.elapsedMs,endedAt:now(),used:s.used,signature,
    rewardVerification:'development_observations_only',revenueCny:null};d.results[ticket.id]=result;
    if(result.status==='WON'&&ticket.mode==='tutorial')d.users[user].tutorialDone=true;
    if(result.status==='WON'&&ticket.mode==='daily'&&!d.users[user].owned.includes('cap'))d.users[user].owned.push('cap');
    return {replayed:false,result};});
  }
  if(action==='equip'){
   if(typeof data.skin!=='string'||!SKINS.some(s=>s.id===data.skin))throw Error('INVALID_SKIN');
   if(!db.users[user].owned.includes(data.skin))throw Error('SKIN_LOCKED');
   tx(d=>{d.users[user].skin=data.skin;return null;});return clone(bootstrap(user));
  }
  const b=BULLETS.find(b=>b.id===data.id);if(!b)throw Error('INVALID_BULLET');
  tx(d=>{d.bullets.push({id:'b'+(++d.serial),preset:b.id,text:b.text,day:cycle(now()),time:now(),userId:user,name:d.users[user].name});d.bullets=d.bullets.slice(-100);return null;});
  return clone(bootstrap(user));
 }
 return {call,export:()=>JSON.stringify(db),dataMode:'development_local'};
}
module.exports={createSocial};
