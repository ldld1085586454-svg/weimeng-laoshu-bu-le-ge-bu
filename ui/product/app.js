'use strict';
const BaseArt=require('./art'),{P}=BaseArt;
const Theme=require('./theme');
const {createPointerInput}=require('./input');
const {createController}=require('../../src/product/controller');
const Round=require('../../src/product/round');
const Board=require('../../src/product/board');
const {createClock}=require('../../src/product/clock');
const {localClient}=require('../../src/product/client');
const {POLICY,cycle}=require('../../src/product/catalog');
const ASSISTS={move:'移出道具',undo:'撤回道具',shuffle:'洗牌道具',revive:'复活'};
const ERRORS={NOT_ENOUGH_RACK_TILES:'槽内至少需要三张牌',BUFFER_OCCUPIED:'请先处理暂存区的牌',NO_UNDO:'没有可撤回的牌',UNDO_SOURCE_UNBOUND:'当前候选规则不支持撤回这张牌',ASSIST_EXHAUSTED:'本局机会已用完',BLOCKED:'这张牌还被压着',CYCLE_EXPIRED:'今日关卡已更新，请重新挑战',NATIVE_CAPABILITY_UNAVAILABLE:'请在已配置的微信项目中使用',STORAGE_WRITE_FAILED:'保存失败，未消耗道具，请重试',SKIN_LOCKED:'尚未解锁这个形象'};
const clone=v=>JSON.parse(JSON.stringify(v));
function createFullApp(canvas,deals,initialWidth,initialHeight,initialDpr=1,options={}){
 const Art=BaseArt.withAssets(options.artAssets);
 const ctx=canvas.getContext('2d'),now=options.now||Date.now,W=390;
 let width=initialWidth,height=initialHeight,dpr=initialDpr,k=width/W,H=height/k,insets={top:Math.max(0,options.insets?.top||0),bottom:Math.max(0,options.insets?.bottom||0)},originX=0,regions=[],scene='HOME',modal=null,info=null,
  ctl=null,state=null,ticket=null,busy=false,initializing=true,visible=true,disposed=false,notice='',noticeUntil=0,page=0,honor='first',friendHistory=false,
  nativeFriend=null,flying=[],sparks=[],inputUntil=0,submission=null,settlementPending=false,legacySettlement=false,finalError=null,baseElapsed=0,
  rewardRoute=options.rewardRoute||POLICY.rewardRoute,afterTutorial='daily',lastCycleCheck=0,
  modalSince=0,terminalUntil=0,pendingModal=null,clearTiles=[],clearRack=null,assistPulse=null;
 const storage=options.storage||null,provider=options.provider||null,platform=options.platform||null,clock=createClock(now);
 const prefs={sound:true,music:true,vibration:true,bullets:true,reducedMotion:options.motion===false};
 if(storage)try{const p=JSON.parse(storage.get('preferences')||'null');if(p)for(const key of Object.keys(prefs))if(typeof p[key]==='boolean')prefs[key]=p[key];}catch(e){notice='设置记录损坏，使用默认设置';}
 const client=options.client||localClient(deals,storage,options.userId||'local-player',now);
 function elapsed(){return baseElapsed+clock.elapsed();}
 function toast(t){notice=ERRORS[t]||t;noticeUntil=now()+3500;draw();}
 function sound(name){if(prefs.sound&&options.audio?.play)options.audio.play(name);}
 function music(){if(options.audio?.music)options.audio.music(prefs.music&&visible&&!['PROVIDER','OFFER','RECOVERY'].includes(modal));}
 function text(t,x,y,size=15,color=P.ink,align='left',maxWidth=1000,bold=false,heading=bold){ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;let n=size;const family=heading&&options.headingFont?JSON.stringify(options.headingFont)+','+Theme.FONT:Theme.FONT,weight=bold?'700':'400';const font=()=>`${weight} ${n}px ${family}`;ctx.font=font();while(n>10&&ctx.measureText(String(t)).width>maxWidth){n--;ctx.font=font();}ctx.fillText(String(t),x,y);}
 const center=(t,y,size=15,color=P.ink,max=W-48,bold=false,heading=bold)=>text(t,W/2,y,size,color,'center',max,bold,heading);
 function paragraph(lines,y,size=13,color=P.muted,step=23){lines.forEach((s,i)=>center(s,y+i*step,size,color));}
 function uiIcon(name,x,y,size=24,color=P.ink){if(!options.artAssets?.draw(ctx,'icon.'+name,x-size/2,y-size/2,size,size))Theme.icon(ctx,name,x,y,size,color);}
 function button(id,label,x,y,w,h=44,enabled=true,fill=P.yellow,icon=null){
  const down=pointer.pressed()===id,dy=down?2:0,primary=fill===P.yellow,r=Math.min(16,h/2);
  const image=primary&&enabled&&options.artAssets?.draw(ctx,'button.primary',x,y+dy,w,h,{fit:'stretch'});
  if(!image){Art.box(ctx,x,y+3,w,h,r,enabled?(primary?'#cda444':'#c4ceb3'):'#d0d8c4',null);Art.box(ctx,x,y+dy,w,h,r,enabled?fill:'#e3e8da',enabled?(primary?'#d7b354':P.border):'#d4dcc7',1);if(enabled)Art.line(ctx,[[x+r,y+dy+2],[x+w-r,y+dy+2]],primary?'#fff0b7':'#ffffff',1);}
  if(icon)Art.symbol(ctx,icon,x+25,y+h/2+dy,27);
  text(label,x+w/2+(icon?10:0),y+h/2+dy,primary&&h>=47?27:15,enabled?P.ink:'#98a18d','center',w-18,true);
  regions.push({id,kind:'button',x,y,w,h,enabled});
 }
 function small(id,label,x,y,w=46,h=37){
  const name=id==='exit'?'back':id==='settings'?'settings':id==='close'?'close':null;
  if(!name){button(id,label,x,y,w,h,true,P.cream);return;}
  const down=pointer.pressed()===id;Art.box(ctx,x,y+(down?2:0),w,h,Math.min(w,h)/2,P.cream,P.border,1);uiIcon(name,x+w/2,y+h/2+(down?2:0),Math.min(w,h)*.51);regions.push({id,kind:'button',x,y,w,h,enabled:true});
 }
 function showModal(value){if(value)pendingModal=null;pointer.reset();modal=value;modalSince=now();page=0;if(value)clock.pause('modal');else clock.resume('modal');music();draw();}
 function presentTerminal(value){if(!prefs.reducedMotion&&now()<terminalUntil){pendingModal=value;draw();}else{pendingModal=null;showModal(value);}}
 function panel(title,desired=520,closable=true){regions=[];const fade=prefs.reducedMotion?1:Theme.easeOut((now()-modalSince)/160);ctx.fillStyle=`rgba(22,43,32,${.42*fade})`;ctx.fillRect(0,0,W,H);const h=Math.min(desired,H-62),y=(H-h)/2,x=21,w=W-42;Art.box(ctx,x,y+6,w,h,22,'rgba(37,67,50,.14)',null);Art.box(ctx,x,y,w,h,22,P.cream,'#d7dfc9',1);center(title,y+35,23,P.ink,w-106,true);if(closable)small('close','×',x+w-53,y+14,38,38);return {x,y,w,h};}
 function home(){
  small('settings','设置',W-65,44,40,40);text('羊了个羊',29,69,57,P.ink,'left',280,true);
  text('每天一关，加入你的羊队',32,116,15,P.ink);
  const titles=[['first','领头羊'],['king','最强王者'],['fast','羊神']];
  for(let i=0;i<3;i++){const x=24+i*117,id='honor-'+titles[i][0];if(pointer.pressed()===id)Art.box(ctx,x,141,108,86,14,'#e5ecd9',null);if(!options.artAssets?.draw(ctx,'honor.'+titles[i][0],x+7,147,94,58))Art.sheep(ctx,x+54,176,55,i===1?'cap':'plain');text(titles[i][1],x+54,218,16,P.ink,'center',108);regions.push({id,kind:'button',x,y:140,w:108,h:88,enabled:true});}
  const regionY=H-371,heroY=regionY-(H<780?62:91),heroSize=Math.min(220,Math.max(108,(regionY-240)*.95));
  Art.sheep(ctx,W/2,heroY,heroSize,info.profile.skin==='plain'?'home':info.profile.skin,prefs.reducedMotion?0:now()/900);
  center(info.profile.region+'羊队',regionY,37,P.ink,315,true);
  const own=info.regions.find(r=>r.name===info.profile.region);Art.box(ctx,91,regionY+23,208,29,15,'rgba(255,252,243,.94)','#d6dfc6',1);center('今日 '+(own?.wins||0)+' 羊  ·  挑战记录 '+(own?.attempts||0),regionY+38,13,P.ink);
  if(prefs.bullets&&info.bullets.length&&H>700){const b=info.bullets[Math.floor(now()/4000)%info.bullets.length];Art.box(ctx,69,heroY+heroSize*.50,W-138,27,13,'rgba(255,252,243,.94)',null);center(b.text,heroY+heroSize*.50+14,12,P.deep);}
  button('start',info.today.won||info.today.failures?'再次挑战':'加入羊群',62,H-297,W-124,61,true,P.yellow);
  for(const [id,label,x,name] of [['bullet','发弹幕',76,'bullet'],['locate','我在哪',246,'locate']]){if(pointer.pressed()===id)Art.box(ctx,x-17,H-225,105,32,13,'#e0e9d2',null);uiIcon(name,x,H-211,20);text(label,x+19,H-211,15,P.ink);regions.push({id,kind:'button',x:x-17,y:H-230,w:107,h:39,enabled:true});}
  const names=[['rank','羊群榜'],['friends','朋友圈'],['topic','话题 PK'],['wardrobe','换装'],['profile','个人'],['club','游戏圈']];
  names.forEach(([id,label],i)=>{const x=24+(i%3)*116,y=H-185+Math.floor(i/3)*80,down=pointer.pressed()===id;Art.box(ctx,x,y+2,110,75,14,'#dce5cd',null);Art.box(ctx,x,y+(down?2:0),110,75,14,P.cream,'#d8e1c9',1);uiIcon(id,x+55,y+28+(down?2:0),29);text(label,x+55,y+58+(down?2:0),16,P.ink,'center',102);regions.push({id,kind:'button',x,y,w:110,h:75,enabled:true});});
 }
 function boardView(){
  const b=state.board;small('settings','设置',W-65,29,42,42);small('exit','返回',23,29,42,42);
  center(ticket.mode==='tutorial'?'新手教学':ticket.mode==='topic'?'今日话题挑战':'每日一关',47,29,P.ink,230,true);
  center(ticket.day,75,14,P.ink);center(Math.floor(elapsed()/60000)+':'+String(Math.floor(elapsed()/1000)%60).padStart(2,'0'),94,15,P.ink);
  const progress=b.cleared/b.deal.cells.length;Art.box(ctx,44,113,W-88,11,6,'#dbe3cf','#b5c2a5',1);if(progress)Art.box(ctx,45,114,(W-90)*progress,9,5,'#95bd73',null);for(let i=0;i<3;i++){const reached=progress>=[.25,.55,.8][i];if(!reached||!options.artAssets?.draw(ctx,'decoration.progress',115+i*80,108,21,21))Theme.star(ctx,125+i*80,118,10,reached?'#f7d474':P.cream);}
  const g=Theme.boardGeometry(b.deal,H),cs=b.deal.cells,order=cs.filter(c=>c.zone==='board').sort((a,b)=>a.z-b.z);
  for(const c of order){const i=b.byId[c.id];if(b.taken[i])continue;const {x,y,w,h}=Theme.boardCardRect(c,g),enabled=b.blockers[i]===0,pressed=pointer.pressed()==='tile:'+c.id;
   ctx.save();if(assistPulse?.kind==='shuffle'&&now()<assistPulse.end&&!prefs.reducedMotion){ctx.globalAlpha=.65+.35*Theme.easeOut((now()-assistPulse.start)/260);}
   if(!flying.some(f=>f.id===c.id&&f.destination==='board'&&now()<f.end))Art.tile(ctx,c.type,x,y+(pressed?2:0),w,h,enabled);ctx.restore();regions.push({id:'tile:'+c.id,tileId:c.id,kind:'tile',zone:c.zone,x,y,w,h,enabled});
  }
  const stacks=new Map();for(const c of cs.filter(c=>c.zone==='side'))if(!b.taken[b.byId[c.id]]){const key=c.stackId||'side';if(!stacks.has(key))stacks.set(key,[]);stacks.get(key).push(c);}
  let si=0;for(const tiles of stacks.values()){
   const front=tiles.find(c=>b.blockers[b.byId[c.id]]===0);if(!front)continue;
   const x=si++%2?W-83:27,y=g.sideY,w=45,h=46,back=Math.min(6,tiles.length-1);
   for(let j=back;j>0;j--)Art.tile(ctx,null,x+j*2,y-j*3,w,h,false);
   Art.tile(ctx,front.type,x,y+(pointer.pressed()==='tile:'+front.id?2:0),w,h);text(tiles.length,x+w+13,y+26,11,P.deep,'center');
   regions.push({id:'tile:'+front.id,tileId:front.id,kind:'tile',zone:'side',x,y,w,h,enabled:true});
  }
  const by=H-302,rack=Theme.rackGeometry(H);
  center('暂存',by-16,13,P.ink);
  const bufferSlots=Math.max(3,b.buffer.length),bw=44,gap=8;
  const bufferX=(W-(bufferSlots*bw+(bufferSlots-1)*gap))/2;
  for(let i=0;i<bufferSlots;i++){const id=b.buffer[i],x=bufferX+i*(bw+gap);ctx.save();ctx.setLineDash([5,3]);Art.box(ctx,x,by,bw,49,7,'rgba(247,250,232,.48)','#9fb28a',1);ctx.restore();
   if(id){if(!flying.some(f=>f.id===id&&f.destination==='buffer'&&now()<f.end))Art.tile(ctx,b.deal.cells[b.byId[id]].type,x,by,bw,44,true);regions.push({id:'tile:'+id,tileId:id,kind:'tile',zone:'buffer',x,y:by,w:bw,h:44,enabled:true});}}
  const danger=b.rack.length>=6;
  Art.box(ctx,14,rack.y-10,W-28,66,14,danger?'#d5c5a2':'#becfab',null);Art.box(ctx,18,rack.y-6,W-36,57,11,danger?'#eadac0':'#d9e4c8',null);
  const shown=!prefs.reducedMotion&&clearRack&&clearTiles.some(t=>now()<t.end)?clearRack:b.rack;
  for(let i=0;i<7;i++){const id=shown[i],x=rack.x+i*rack.w;Art.box(ctx,x,rack.y,rack.cardW,rack.h,7,danger?'#fbefd9':'#f0f4e7',danger?'#c5a46b':'#b5c3a1',1);if(id&&!flying.some(f=>f.id===id&&now()<f.end)&&!clearTiles.some(t=>t.id===id&&now()<t.end))Art.tile(ctx,b.deal.cells[b.byId[id]].type,x,rack.y,rack.cardW,rack.h);}
  ['move','undo','shuffle'].forEach((id,i)=>{const enabled=!Round.checkOffer(state,id,rewardRoute),x=15+i*124,y=H-144,down=pointer.pressed()===id,dy=down?2:0;
   Art.box(ctx,x,y+3,112,84,16,'#c4ceb3',null);Art.box(ctx,x,y+dy,112,84,16,enabled?P.cream:'#e6ecde',enabled?P.border:'#d0dac2',1);Art.box(ctx,x+3,y+3+dy,106,77,13,null,'#e5e9d8',1);uiIcon(id,x+50,y+28+dy,32,enabled?P.ink:'#a0ab93');text(['移出','撤回','洗牌'][i],x+47,y+61+dy,18,enabled?P.ink:'#96a28b','center',62);Art.box(ctx,x+74,y+49+dy,30,25,12,null,'#d9dfcc',1);text((1-state.used[id])+'/1',x+89,y+62+dy,13,enabled?P.ink:'#96a28b','center');regions.push({id,kind:'button',x,y,w:112,h:84,enabled});
  });
  Art.line(ctx,[[35,H-35],[62,H-35]],'#bccaa4',1);Art.line(ctx,[[328,H-35],[355,H-35]],'#bccaa4',1);
  center(ticket.mode==='tutorial'?'点击三张相同图案，让它们消除':'三张相同消除 · 七格不可堆满',H-35,13,P.ink);
 }
 function drawModal(){const m=modal;
  if(['RANK','FRIENDS','HISTORY'].includes(m)){
   const title=m==='RANK'?'地区羊群榜':m==='HISTORY'?'历史排行榜':'今日朋友圈';const p=panel(title,600),rowY=p.y+83,rowH=43,rows=Math.max(3,Math.min(8,Math.floor((p.h-190)/rowH)));
   if(m==='RANK'){center('开发数据 · 按本地真实通关记录统计',p.y+59,11,P.muted);const list=info.regions.slice(page*rows,(page+1)*rows);list.forEach((r,i)=>{const y=rowY+i*rowH,own=r.name===info.profile.region;Art.box(ctx,p.x+16,y,p.w-32,35,6,own?'#e0edb1':'#f0f2e2',null);text(page*rows+i+1,p.x+29,y+18,14);text(r.name+(own?' · 你':''),p.x+66,y+18,14);text(r.wins+' 羊',p.x+p.w-30,y+18,15,P.deep,'right');});}
   else if(nativeFriend){try{ctx.drawImage(nativeFriend,p.x+16,rowY,p.w-32,p.h-186);}catch(e){center('好友数据正在加载',rowY+45,13);}}
   else{center('本机记录 · 不是微信好友数据',p.y+61,11,P.muted);Art.sheep(ctx,84,rowY+32,49,info.profile.skin);text(info.profile.name,126,rowY+21,18);text(m==='HISTORY'?'累计通关 '+info.history.wins+' 天':info.today.won?'今天已通关':'今天失败 '+info.today.failures+' 次',126,rowY+49,13,P.deep);
    if(m==='HISTORY')info.history.records.slice(page*Math.max(1,rows-2),(page+1)*Math.max(1,rows-2)).forEach((r,i)=>{if(i>=rows-2)return;const y=rowY+87+i*33;text(r.day,p.x+20,y,12);text(r.mode==='topic'?'话题':r.mode==='tutorial'?'教学':'每日',p.x+124,y,12);text(r.status==='WON'?'通关':'失败',p.x+p.w-25,y,12,P.deep,'right');});else paragraph(['微信端开启好友域后，','好友成绩在开放数据域内显示。'],rowY+121,13);}
   button('page-prev','上一页',p.x+16,p.y+p.h-84,90,33,page>0,P.cream);button('page-next','下一页',p.x+p.w-106,p.y+p.h-84,90,33,m==='RANK'?(page+1)*rows<info.regions.length:!!nativeFriend||m==='HISTORY'&&(page+1)*Math.max(1,rows-2)<info.history.records.length,P.cream);
   if(m!=='RANK')button(m==='HISTORY'?'friends-today':'history',m==='HISTORY'?'今日朋友圈':'历史排行榜',p.x+16,p.y+p.h-41,p.w-32,29,true,P.yellow);return;
  }
  if(m==='TOPIC'){const p=panel('今日话题 PK',525);center(info.topic.title,p.y+70,24,P.ink,p.w-42,true);center('示例话题文案 · 非原作历史题目',p.y+101,10,P.muted);const team=info.topic.team;
   for(let i=0;i<2;i++){const x=95+i*200;Art.sheep(ctx,x,p.y+189,72,i?'cap':'plain');text(info.topic.labels[i],x,p.y+241,19,P.ink,'center');text(info.topic.scores[i]+' 羊',x,p.y+275,25,P.deep,'center');}
   center('VS',p.y+190,27,P.deep);center('你的阵营：'+info.topic.labels[team],p.y+322,16);paragraph(['通关为本阵营增加一只羊','阵营、结算与奖励按已披露开发候选执行'],p.y+352,12);
   button('topic-start',info.topic.won?'今日已完成':'开始话题挑战',p.x+30,p.y+p.h-76,p.w-60,47,!info.topic.won,P.yellow);return;}
  if(m==='WARDROBE'){const p=panel('换装',560);center('不提供属性加成，不设商城',p.y+65,12,P.deep);center('本版形象为重新绘制的开发素材',p.y+89,10,P.muted);info.skins.forEach((s,i)=>{const y=p.y+119+i*110;Art.box(ctx,p.x+17,y,p.w-34,96,9,s.owned?'#ecf4d5':'#e6e9dc',P.deep,1);Art.sheep(ctx,p.x+62,y+49,57,s.id);text(s.name,p.x+111,y+25,18);text(s.requirement,p.x+111,y+49,11,P.muted,'left',p.w-139);button('equip:'+s.id,info.profile.skin===s.id?'使用中':s.owned?'换上':'未解锁',p.x+p.w-103,y+61,80,27,s.owned&&info.profile.skin!==s.id,P.yellow);});return;}
  if(m==='PROFILE'){const p=panel('个人记录',480);Art.sheep(ctx,W/2,p.y+131,94,info.profile.skin);center(info.profile.name,p.y+201,23,P.ink,250,true);paragraph([info.profile.region+'羊队','累计每日通关：'+info.history.wins+' 天','今日失败：'+info.today.failures+' 次','今日状态：'+(info.today.won?'已加入羊群':'尚未加入')],p.y+245,16,P.deep,36);return;}
  if(m==='HONOR'){const d=info.honors[honor],titles={first:'全国领头羊',king:'最强王者',fast:'秋名山羊神'},p=panel(titles[honor],480);Art.sheep(ctx,W/2,p.y+130,92,honor==='king'?'cap':'plain');center(info.honors.day+' · 昨日荣誉',p.y+205,13,P.deep);paragraph(honor==='first'?['昨日第一个通关的玩家']:honor==='king'?['昨日未使用道具或复活','且通关用时最短的玩家']:['昨日通关用时最短的玩家'],p.y+243,14);center(d?d.name+' · '+d.region:'暂无已验证的开发成绩',p.y+328,18);if(d)center((d.elapsedMs/1000).toFixed(1)+' 秒',p.y+367,24,P.deep);return;}
  if(m==='BULLET'){const p=panel('发一条弹幕',450);center('从预设内容中选择',p.y+70,14);info.presetBullets.forEach((b,i)=>button('send-bullet:'+b.id,b.text,p.x+22,p.y+105+i*45,p.w-44,35,true,'#edf3d7'));return;}
  if(m==='SETTINGS'){const p=panel('设置',486);[['sound','音效'],['music','音乐'],['vibration','震动'],['bullets','弹幕'],['reducedMotion','减少动效']].forEach(([key,name],i)=>{const y=p.y+83+i*60;text(name,p.x+33,y+20,19);button('setting-'+key,prefs[key]?'开':'关',p.x+p.w-102,y,68,37,true,prefs[key]?P.yellow:'#e0e6d4');});button('about','开发与数据说明',p.x+26,p.y+p.h-60,p.w-52,38,true,'#eaf2d8');return;}
  if(m==='ABOUT'){const p=panel('开发与数据说明',510);paragraph(['目标：2022 年微信版玩法重建','原算法保留；关卡为合成测试关卡','美术、音效为新绘制/合成的开发素材','复活、周期与社交细则含研究候选','广告默认模拟，不产生真实广告收入','分享返回不证明消息已发送','本机存储与开发服务不是生产认证','本版尚未通过微信真机与发布验收'],p.y+87,13,P.deep,38);return;}
  if(m==='CLUB'){const p=panel('游戏圈',360);paragraph(platform?['微信原生入口会显示在下方','仅提供平台跳转，不创建新聊天系统']:['游戏圈属于微信平台能力','浏览器中不伪装已进入游戏圈','导入微信工程并开启 nativeSocial 后使用'],p.y+89,14);if(!platform)center('当前环境不可调用',p.y+250,15,P.muted);return;}
  if(['OFFER','PROVIDER','RECOVERY','REVIVE'].includes(m)){
   const pending=state?.pending,assist=pending?.assist||'revive',p=panel(m==='REVIVE'?'复活吗？':m==='RECOVERY'?'领取待兑现':ASSISTS[assist],m==='PROVIDER'?470:440,false);
   Art.box(ctx,W/2-40,p.y+72,80,80,24,'#edf1df',null);uiIcon(assist,W/2,p.y+112,43);
   if(m==='REVIVE'){paragraph(['七格已满，还可以继续本局','复活会将主槽前三张加入暂存','保留原有暂存牌；这是研究候选'],p.y+173,13);button('revive','复活  1/1',p.x+32,p.y+282,p.w-64,46,true,P.yellow);button('give-up','不用了，结束本局',p.x+32,p.y+346,p.w-64,38,true,P.cream);return;}
   if(m==='OFFER'){const lines=assist==='move'?['将主槽前三张移到暂存区','移出的牌仍需取回并消除']:assist==='undo'?['撤回最近一次未形成消除的取牌','回到它原来的位置']:assist==='shuffle'?['重新排列棋盘上尚未取走的图案','不改变槽内牌，不保证通关']:['主槽前三张追加暂存，继续本局','已有暂存牌保留（研究候选）'];paragraph(lines,p.y+173,14);center('本局剩余 1/1',p.y+235,13,P.deep);
    button('grant',pending.channel==='share'?'分享领取':'看视频领取',p.x+32,p.y+279,p.w-64,47,true,P.yellow);button('cancel-grant','不用了',p.x+32,p.y+344,p.w-64,38,true,P.cream);return;}
   if(m==='RECOVERY'){paragraph(['本笔领取记录已经保留','重试只兑现原笔道具，不再请求广告','不要把这笔奖励发给新开的对局'],p.y+177,13);button('retry-grant','重试兑现',p.x+32,p.y+284,p.w-64,48,true,P.yellow);return;}
   paragraph(provider?['正在等待微信返回结果','提前关闭或结果不明不发奖']:['开发模拟 · 当前不是一条真实广告','以下按钮仅用于验证平台返回分支'],p.y+162,13,P.deep);
   if(provider){button('cancel-grant','停止等待',p.x+32,p.y+320,p.w-64,43,true,P.cream);}
   else{button('dev-complete',pending.channel==='share'?'模拟分享返回':'模拟完整观看',p.x+32,p.y+239,p.w-64,42,true,P.yellow);button('dev-cancel','模拟取消 / 提前关闭',p.x+32,p.y+296,p.w-64,38,true,P.cream);button('dev-fail','模拟请求失败',p.x+32,p.y+349,p.w-64,38,true,P.cream);}return;
  }
  if(m==='WIN'){
   const p=panel('',422,false);center('挑战成功',p.y+53,35,P.ink,p.w-103,true);
   if(options.artAssets){options.artAssets.draw(ctx,'decoration.laurel',p.x+45,p.y+42,23,51);ctx.save();ctx.translate(W,0);ctx.scale(-1,1);options.artAssets.draw(ctx,'decoration.laurel',p.x+45,p.y+42,23,51);ctx.restore();}
   Art.sheep(ctx,W/2,p.y+153,147,info.profile.skin==='plain'?'win':info.profile.skin);
   center('你为'+info.profile.region+'羊队增加了贡献',p.y+235,18,P.ink,p.w-35);
   Art.box(ctx,p.x+55,p.y+260,p.w-110,43,22,'#fbe5a1',null);
   center('用时 '+Math.floor(elapsed()/60000)+':'+String(Math.floor(elapsed()/1000)%60).padStart(2,'0'),p.y+283,27,P.ink,p.w-52,true,false);
   center('本日重复通关不重复计入贡献',p.y+328,12,P.muted,p.w-40);
   button('return-home','返回羊群',p.x+30,p.y+352,p.w-60,56);return;
  }
  if(['TUTORIAL_WIN','LOSE','SETTLEMENT_ERROR','EXPIRED','EXIT'].includes(m)){
   const title={TUTORIAL_WIN:'准备好了吗？',LOSE:'再试一次吧',SETTLEMENT_ERROR:'成绩尚未保存',EXPIRED:'每日关卡已更新',EXIT:'离开本局？'}[m],p=panel(title,440,false);
   if(m==='LOSE')Art.tomb(ctx,W/2,p.y+107,72);else Art.sheep(ctx,W/2,p.y+113,85,info.profile.skin);
   if(m==='TUTORIAL_WIN'){paragraph(['三张相同图案即可消除','接下来进入真正的每日挑战'],p.y+201,16);button('next-daily','开始挑战',p.x+30,p.y+314,p.w-60,49);}
   else if(m==='LOSE'){paragraph(['本局结束，今天还可以继续尝试','重新挑战不要求分享或看广告'],p.y+196,14);button('restart','免费重新挑战',p.x+30,p.y+280,p.w-60,46);button('return-home','返回羊群',p.x+30,p.y+346,p.w-60,37,true,P.cream);}
   else if(m==='EXIT'){paragraph(['本局仍未完成','离开不会替你提交通关成绩'],p.y+198,14);button('cancel-exit','继续本局',p.x+30,p.y+282,p.w-60,44);button('confirm-exit','返回羊群',p.x+30,p.y+344,p.w-60,38,true,P.cream);}
   else if(m==='EXPIRED'){paragraph(['不会将旧关卡成绩计入新一天','重新开始当日关卡'],p.y+198,14);button('expired-home','返回羊群',p.x+30,p.y+312,p.w-60,48);}
   else{paragraph(['局面与待提交结果已保留','修复网络或存储后重试，不重复加羊'],p.y+194,13);center(ERRORS[finalError]||finalError||'服务暂不可用',p.y+258,11,P.muted);button('retry-settlement','重新提交原笔成绩',p.x+30,p.y+314,p.w-60,47);}return;
  }
 }
 function draw(){if(disposed)return;
  if(pendingModal&&(prefs.reducedMotion||now()>=terminalUntil)){modal=pendingModal;pendingModal=null;modalSince=now();clock.pause('modal');music();}
  regions=[];ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=P.grass;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr*k,0,0,dpr*k,originX*dpr,insets.top*dpr);ctx.globalAlpha=1;Art.grass(ctx,W,H);
  if(!Art.background(ctx,scene==='HOME'?'home':'board',W,H))Theme.landscape(ctx,W,H,scene==='HOME'?'home':'board');
  if(!info){center(finalError?'加载失败':'正在整理羊群…',H/2-15,23);if(finalError){center(finalError,H/2+25,11);button('retry-load','重新加载',70,H/2+75,250,47);}return;}
  if(scene==='HOME')home();else if(state)boardView();
  if(!modal&&!prefs.reducedMotion){const t=now();for(const f of flying){if(t>=f.end)continue;const q=Math.max(0,Math.min(1,(t-f.start)/(f.end-f.start))),p=Theme.easeOut(q);Art.tile(ctx,f.type,f.x+(f.toX-f.x)*p,f.y+(f.toY-f.y)*p-Math.sin(p*Math.PI)*18,f.w+(f.toW-f.w)*p,f.h+(f.toH-f.h)*p);}
   for(const a of clearTiles){if(t<a.reveal||t>=a.end)continue;const q=Theme.easeOut((t-a.clearStart)/(a.end-a.clearStart)),scale=1-.42*q,w=a.w*scale,h=a.h*scale;ctx.save();ctx.globalAlpha=1-q;Art.tile(ctx,a.type,a.x+(a.w-w)/2,a.y+(a.h-h)/2-8*q,w,h);ctx.restore();}
   for(const s of sparks){if(t<s.start||t>=s.end)continue;const p=(t-s.start)/(s.end-s.start);ctx.save();ctx.globalAlpha=1-p;for(let i=0;i<6;i++){const a=i*Math.PI/3;Art.ellipse(ctx,s.x+Math.cos(a)*p*30,s.y+Math.sin(a)*p*25,2.5,2.5,i%2?P.yellow:P.white,null);}ctx.restore();}}
  if(modal)drawModal();if(notice&&noticeUntil>now()){Art.box(ctx,24,H-63,W-48,35,8,'rgba(38,61,39,.95)',null);center(notice,H-46,12,'#fffef2',W-64);}
  if(busy||initializing)text(initializing&&scene==='PLAY'?'恢复成绩中…':'处理中…',W-23,15,10,P.deep,'right');
 }
 function sync(){state=ctl?ctl.get():null;}
 function roundStore(){return storage?{write:log=>storage.set('active-round',JSON.stringify({scope:client.scope,log,ticket,elapsedMs:elapsed()}))}:undefined;}
 async function refresh(){info=await client.request('bootstrap');if(platform)platform.publish(info).catch(()=>{});draw();return info;}
 async function start(mode='daily'){
  if(settlementPending)return {ok:false,code:'SETTLEMENT_PENDING'};
  if(provider)provider.cancel();if(platform){platform.hideClub();platform.hideFriends();}nativeFriend=null;clock.stop();
  const r=await client.request('start',{mode});ticket=r.ticket;notice='';noticeUntil=0;submission=null;legacySettlement=false;baseElapsed=0;clock.reset();
  ctl=createController(r.deal,{roundId:ticket.id,store:roundStore(),nextU32:options.nextU32});scene='PLAY';modal=null;state=ctl.get();flying=[];sparks=[];clearTiles=[];clearRack=null;pendingModal=null;terminalUntil=0;assistPulse=null;inputUntil=0;pointer.reset();clock.start();music();draw();return {ok:true};
 }
 function clearTerminalRecords(roundId){if(!storage)return;
  const saved=JSON.parse(storage.get('active-round')||'null');
  if(saved?.scope===client.scope&&saved.ticket?.id===roundId)storage.set('active-round','');
  const queued=JSON.parse(storage.get('outbox')||'null');
  if(queued?.scope===client.scope&&queued.payload?.ticketId===roundId)storage.set('outbox','');
 }
 async function persistTerminal(){clock.stop();if(!submission)submission={ticketId:ticket.id,log:ctl.export(),elapsedMs:elapsed()};settlementPending=true;
  try{if(storage){
    // Record the final decision and exact duration before attempting the separate outbox write.
    const legacy=legacySettlement?{legacySettlement:true}:{};
    storage.set('active-round',JSON.stringify({scope:client.scope,log:submission.log,ticket,elapsedMs:submission.elapsedMs,settlementPending:true,...legacy}));
    storage.set('outbox',JSON.stringify({scope:client.scope,ticket,payload:submission,...legacy}));
   }
   try{await client.request('settle',submission);}catch(e){
    // Old builds left acknowledged active saves with a duration taken before the final transaction.
    // Only this legacy fallback treats an existing server result as acknowledged; queued payloads stay exact.
    if(e.message!=='SETTLEMENT_CONFLICT'||!legacySettlement)throw e;
    clearTerminalRecords(submission.ticketId);await returnHome();return {ok:true,code:'ALREADY_SETTLED'};
   }
   // Keep the outbox until the active save is cleared, so partial cleanup can retry the same payload.
   clearTerminalRecords(submission.ticketId);await refresh();settlementPending=false;finalError=null;presentTerminal(state.board.status==='WON'?(ticket.mode==='tutorial'?'TUTORIAL_WIN':'WIN'):'LOSE');return {ok:true};
  }catch(e){finalError=e.message;presentTerminal(e.message==='CYCLE_EXPIRED'?'EXPIRED':'SETTLEMENT_ERROR');return {ok:false,code:e.message};}
 }
 async function picked(id,animate=true){if(!ctl||scene!=='PLAY'||modal||!visible)return {ok:false,code:'UI_LOCKED'};
  const old=state,b=old.board,source=regions.find(r=>r.tileId===id),result=ctl.pick(id);if(!result.ok){toast(result.code);return result;}state=ctl.get();sound('click');
  if(prefs.vibration&&options.vibrate)options.vibrate();
  const clear=result.events.find(e=>e.type==='CLEAR');
  if(animate&&!prefs.reducedMotion&&source){
   const type=b.deal.cells[b.byId[id]].type,temp=b.rack.slice(),same=temp.map(v=>b.deal.cells[b.byId[v]].type).lastIndexOf(type);temp.splice(same<0?temp.length:same+1,0,id);
   const index=temp.indexOf(id),rack=Theme.rackGeometry(H),x=rack.x+index*rack.w,t=now();flying=[{id,type,x:source.x,y:source.y,w:source.w,h:source.h,toX:x,toY:rack.y,toW:rack.cardW,toH:rack.h,start:t,end:t+180}];inputUntil=t+185;
   if(clear){clearRack=temp;clearTiles=clear.ids.map(v=>({id:v,type:b.deal.cells[b.byId[v]].type,x:rack.x+temp.indexOf(v)*rack.w,y:rack.y,w:rack.cardW,h:rack.h,reveal:t+(v===id?180:0),clearStart:t+180,end:t+440}));sparks=clearTiles.map(v=>({x:v.x+v.w/2,y:v.y+v.h/2,start:t+210,end:t+500}));inputUntil=t+445;if(state.board.status==='WON')terminalUntil=t+510;}
  }
  if(clear)sound('clear');
  draw();if(state.board.status==='WON'){sound('win');await persistTerminal();}
  else if(state.board.status==='LOST'){clock.pause('lost');sound('fail');if(!state.used.revive)showModal('REVIVE');else await persistTerminal();}
  return result;
 }
 function offer(assist){const r=ctl.offer(assist,rewardRoute);if(!r.ok){toast(r.code);return r;}sync();showModal('OFFER');return r;}
 async function rewardResult(event,applyFault=false){if(!ctl||event.roundId!==ticket.id)return {ok:false,code:'WRONG_ROUND'};if(now()>=ticket.expiresAt){showModal('EXPIRED');return {ok:false,code:'CYCLE_EXPIRED'};}
  let r=ctl.result(event);sync();if(!r.ok){toast(r.code);return r;}
  if(state.pending?.phase==='EARNED'){if(applyFault){ctl.failApplication();sync();showModal('RECOVERY');return {ok:false,code:'RECOVERY_REQUIRED'};}return applyReward();}
  showModal(state.board.status==='LOST'?'REVIVE':null);return r;
 }
 async function applyReward(){const before=state,r=ctl.apply();sync();if(!r.ok){showModal('RECOVERY');toast(r.code);return r;}clock.resume('lost');clock.start();showModal(null);sound('clear');
  if(!prefs.reducedMotion){const kind=before.pending?.assist,t=now(),rack=Theme.rackGeometry(H);assistPulse={kind,start:t,end:t+280};
   if(kind==='move'||kind==='revive')flying=state.board.buffer.filter(id=>!before.board.buffer.includes(id)).map(id=>{const target=regions.find(v=>v.tileId===id&&v.zone==='buffer');return {id,type:state.board.deal.cells[state.board.byId[id]].type,x:rack.x+before.board.rack.indexOf(id)*rack.w,y:rack.y,w:rack.cardW,h:rack.h,toX:target.x,toY:target.y,toW:target.w,toH:target.h,start:t,end:t+230,destination:'buffer'};});
   else if(kind==='undo'){const id=before.board.undo?.id,target=regions.find(v=>v.tileId===id);if(target)flying=[{id,type:state.board.deal.cells[state.board.byId[id]].type,x:rack.x+before.board.rack.indexOf(id)*rack.w,y:rack.y,w:rack.cardW,h:rack.h,toX:target.x,toY:target.y,toW:target.w,toH:target.h,start:t,end:t+230,destination:'board'}];}
   inputUntil=t+240;draw();
  }return r;}
 async function launch(){const r=ctl.launch();if(!r.ok){toast(r.code);return r;}sync();showModal('PROVIDER');if(provider){const p=state.pending;
   const opened=provider.open(p.channel==='video'?'ad':'share',{id:p.token,roundId:ticket.id},e=>{
    if(e.kind==='share_returned'){if(ctl&&e.roundId===ticket.id)ctl.result({kind:'share_hide',roundId:e.roundId,token:e.flowId});rewardResult({kind:'share_return',roundId:e.roundId,token:e.flowId});}
    else rewardResult({kind:e.kind==='ad_closed'?'ad_close':e.kind,roundId:e.roundId,token:e.flowId,isEnded:e.isEnded});
   });if(!opened.ok)await rewardResult({roundId:ticket.id,token:p.token,kind:'failed'});
  }return r;}
 async function returnHome(){if(provider)provider.cancel();if(platform){platform.hideFriends();platform.hideClub();}nativeFriend=null;clock.stop();await refresh();ctl=null;state=null;ticket=null;submission=null;settlementPending=false;legacySettlement=false;scene='HOME';modal=null;pendingModal=null;clearMotion();pointer.reset();music();draw();}
 function loadFriends(){nativeFriend=null;if(platform){const p={x:37,y:(H-Math.min(600,H-62))/2+83,w:W-74,h:Math.min(600,H-62)-186};const r=platform.friends({day:info.day,history:friendHistory,width:Math.round(p.w*k*dpr),height:Math.round(p.h*k*dpr),page});if(r.ok)nativeFriend=r.canvas;}}
 async function handle(id){
  if(id==='retry-load')return initialize();
  if(id.startsWith('tile:'))return picked(id.slice(5));
  if(id==='start'){afterTutorial='daily';return start(info.profile.tutorialDone?'daily':'tutorial');}
  if(id==='next-daily')return start(afterTutorial);
  if(id==='topic-start'){afterTutorial='topic';return start(info.profile.tutorialDone?'topic':'tutorial');}
  if(['return-home','confirm-exit','expired-home'].includes(id))return returnHome();
  if(id==='restart')return start(ticket.mode);
  if(id==='exit'){showModal('EXIT');return;}
  if(id==='cancel-exit'){showModal(null);return;}
  if(['move','undo','shuffle','revive'].includes(id))return offer(id);
  if(id==='grant')return launch();
  if(id==='give-up')return persistTerminal();
  if(id==='retry-settlement')return persistTerminal();
  if(id==='retry-grant')return applyReward();
  if(id==='cancel-grant'){if(provider)provider.cancel();const r=ctl.cancel();sync();if(r.ok)showModal(state.board.status==='LOST'?'REVIVE':null);else toast(r.code);return r;}
  if(id.startsWith('dev-')){if(provider)return;const p=state.pending;if(!p)return;
   if(p.channel==='share'&&id==='dev-complete')ctl.result({kind:'share_hide',roundId:ticket.id,token:p.token});
   return rewardResult({kind:id==='dev-fail'?'failed':id==='dev-cancel'?'cancelled':p.channel==='share'?'share_return':'ad_close',roundId:ticket.id,token:p.token,...(p.channel==='video'&&id==='dev-complete'?{isEnded:true}:{})});}
  if(id==='close'){if(platform){platform.hideFriends();platform.hideClub();}nativeFriend=null;showModal(null);return;}
  if(id.startsWith('setting-')){const key=id.slice(8);if(key in prefs){const next=!prefs[key];if(storage)storage.set('preferences',JSON.stringify({...prefs,[key]:next}));prefs[key]=next;if(key==='reducedMotion'&&next)clearMotion();music();draw();}return;}
  if(id==='about'){showModal('ABOUT');return;}
  if(id.startsWith('equip:')){info=await client.request('equip',{skin:id.slice(6)});draw();return;}
  if(id.startsWith('send-bullet:')){info=await client.request('bullet',{id:id.slice(12)});showModal(null);toast('弹幕已发送到开发羊群');return;}
  if(id==='page-prev'||id==='page-next'){page=Math.max(0,page+(id==='page-next'?1:-1));if(['FRIENDS','HISTORY'].includes(modal)&&platform)loadFriends();draw();return;}
  if(id==='history'||id==='friends-today'){friendHistory=id==='history';showModal(friendHistory?'HISTORY':'FRIENDS');loadFriends();draw();return;}
  if(id.startsWith('honor-')){honor=id.slice(6);showModal('HONOR');return;}
  if(id==='locate'){showModal('RANK');return;}
  const modals={rank:'RANK',friends:'FRIENDS',topic:'TOPIC',wardrobe:'WARDROBE',profile:'PROFILE',bullet:'BULLET',club:'CLUB',settings:'SETTINGS'};
  if(modals[id]){showModal(modals[id]);if(id==='friends'){friendHistory=false;loadFriends();draw();}
   if(id==='club'&&platform){const p={x:originX+90*k,y:insets.top+((H-360)/2+240)*k,w:210*k,h:45*k};const r=platform.club(p);if(!r.ok)toast(r.code);}return;}
 }
 function canInput(){return visible&&!disposed&&!busy&&!initializing&&!pendingModal&&(prefs.reducedMotion||now()>=inputUntil);}
 function hitTarget(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return null;x=(x-originX)/k;y=(y-insets.top)/k;for(let i=regions.length-1;i>=0;i--){const r=regions[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return r;}return null;}
 async function activate(id){if(!canInput())return {ok:false,code:'UI_LOCKED'};busy=true;try{return await handle(id);}catch(e){toast(e.message);return {ok:false,code:e.message};}finally{busy=false;draw();}}
 async function tap(x,y){if(!canInput()||!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,code:'UI_LOCKED'};const r=hitTarget(x,y);return !r?.enabled?{ok:false,code:'NOT_ACTIONABLE'}:activate(r.id);}
 function clearMotion(){flying=[];sparks=[];clearTiles=[];clearRack=null;assistPulse=null;inputUntil=0;terminalUntil=0;}
 function restoreRound(log,originalTicket,duration){
  ticket=clone(originalTicket);baseElapsed=duration;clock.reset();
  ctl=createController(null,{saved:log,store:roundStore()});sync();scene='PLAY';flying=[];sparks=[];inputUntil=0;
 }
 const terminal=s=>!s.pending&&(s.board.status==='WON'||s.board.status==='LOST');
 const durationValid=ms=>Number.isSafeInteger(ms)&&ms>=0;
 const currentTicket=t=>t?.day===info.day&&now()<t.expiresAt;
 async function initialize(){initializing=true;try{await refresh();finalError=null;
   if(storage){const queued=JSON.parse(storage.get('outbox')||'null'),saved=JSON.parse(storage.get('active-round')||'null');
    if(queued?.scope===client.scope){
     const payload=queued.payload,originalTicket=queued.ticket||(saved?.scope===client.scope&&saved.ticket?.id===payload?.ticketId?saved.ticket:null),restored=Round.restore(payload?.log);
     if(!restored.ok||restored.state.roundId!==payload.ticketId||!terminal(restored.state)||!durationValid(payload.elapsedMs))throw Error('INVALID_PENDING_SETTLEMENT');
     if(originalTicket?.id===payload.ticketId&&currentTicket(originalTicket)){
      restoreRound(payload.log,originalTicket,payload.elapsedMs);submission=clone(payload);settlementPending=true;legacySettlement=queued.legacySettlement===true;await persistTerminal();
     }else{
      // A previously accepted result may replay after midnight; an unaccepted old result cannot.
      try{await client.request('settle',payload);clearTerminalRecords(payload.ticketId);await refresh();}
      catch(e){if(e.message==='CYCLE_EXPIRED')clearTerminalRecords(payload.ticketId);else if(!originalTicket||currentTicket(originalTicket))throw e;}
     }
    }else if(saved?.scope===client.scope&&currentTicket(saved.ticket)){
     const restored=Round.restore(saved.log),duration=saved.elapsedMs??0;
     if(restored.ok&&restored.state.roundId===saved.ticket.id&&durationValid(duration)){
      if(restored.state.pending?.phase==='EARNED'){restoreRound(saved.log,saved.ticket,duration);showModal('RECOVERY');}
      else if(terminal(restored.state)&&(saved.settlementPending===true||restored.state.board.status==='WON'||restored.state.used.revive>0)){
       restoreRound(saved.log,saved.ticket,duration);submission={ticketId:ticket.id,log:saved.log,elapsedMs:duration};settlementPending=true;legacySettlement=saved.legacySettlement===true||saved.settlementPending!==true;await persistTerminal();
      }
     }
    }
   }music();draw();return {ok:true};
  }catch(e){finalError=e.message;info=null;draw();return {ok:false,code:e.message};}finally{initializing=false;draw();}}
 function resize(w,h,ratio=dpr,padding=insets){if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('INVALID_VIEWPORT');pointer.reset();clearMotion();width=w;height=h;dpr=Math.min(4,Math.max(1,ratio));insets={top:Math.min(height*.25,Math.max(0,padding.top||0)),bottom:Math.min(height*.25,Math.max(0,padding.bottom||0))};const usable=Math.max(1,height-insets.top-insets.bottom);k=Math.min(width/W,usable/720);originX=(width-W*k)/2;H=usable/k;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
 async function setVisible(v){visible=!!v;pointer.reset();if(visible){clock.resume('hidden');if(info&&cycle(now())!==info.day){await refresh();if(ticket&&ticket.day!==info.day)showModal('EXPIRED');}draw();}else clock.pause('hidden');music();}
 function frame(){if(!visible||disposed)return;if(now()-lastCycleCheck>1000){lastCycleCheck=now();if(info&&now()>=info.nextReset){if(ticket&&now()>=ticket.expiresAt)showModal('EXPIRED');else refresh().catch(e=>toast(e.message));}}draw();}
 const pointer=createPointerInput({hitTest:hitTarget,activate,onChange:draw,enabled:canInput});
 resize(width,height,dpr);const ready=initialize();
 return {ready,tap,frame,resize,setVisible,pointerDown:pointer.down,pointerMove:pointer.move,pointerUp:pointer.up,pointerCancel:pointer.cancel,destroy(){disposed=true;pointer.dispose();clock.stop();provider?.destroy();platform?.destroy();options.audio?.destroy?.();options.artAssets?.dispose();},
 getScene:()=>scene,getModal:()=>modal,getState:()=>state?clone(state):null,getInfo:()=>info?clone(info):null,getPreferences:()=>({...prefs}),
 getHitRegions:()=>regions.map(r=>({...r,x:originX+r.x*k,y:insets.top+r.y*k,w:r.w*k,h:r.h*k})),getMetrics:()=>ctl?.metrics()||null,
 exportDiagnostic:()=>ctl?.export()||null,
 qa:{start,pick:id=>picked(id,false),setChannel(v){if(!['video','share'].includes(v))throw Error('INVALID_CHANNEL');rewardRoute=v;},
  failEarned:()=>{const p=state.pending;return rewardResult({roundId:ticket.id,token:p.token,kind:'ad_close',isEnded:true},true);},
  result:rewardResult,settings:p=>{Object.assign(prefs,p);if(prefs.reducedMotion)clearMotion();draw();},elapsed,client}};
}
module.exports={createFullApp};
