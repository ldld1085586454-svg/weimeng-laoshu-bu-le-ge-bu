'use strict';
const Art=require('./art'),{P}=Art;
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
 const ctx=canvas.getContext('2d'),now=options.now||Date.now,W=390;
 let width=initialWidth,height=initialHeight,dpr=initialDpr,k=width/W,H=height/k,insets={top:Math.max(0,options.insets?.top||0),bottom:Math.max(0,options.insets?.bottom||0)},originX=0,regions=[],scene='HOME',modal=null,info=null,
  ctl=null,state=null,ticket=null,busy=false,visible=true,disposed=false,notice='',noticeUntil=0,page=0,honor='first',friendHistory=false,
  nativeFriend=null,flying=[],sparks=[],inputUntil=0,submission=null,finalError=null,baseElapsed=0,
  rewardRoute=options.rewardRoute||POLICY.rewardRoute,afterTutorial='daily',lastCycleCheck=0;
 const storage=options.storage||null,provider=options.provider||null,platform=options.platform||null,clock=createClock(now);
 const prefs={sound:true,music:true,vibration:true,bullets:true,reducedMotion:options.motion===false};
 if(storage)try{const p=JSON.parse(storage.get('preferences')||'null');if(p)for(const key of Object.keys(prefs))if(typeof p[key]==='boolean')prefs[key]=p[key];}catch(e){notice='设置记录损坏，使用默认设置';}
 const client=options.client||localClient(deals,storage,options.userId||'local-player',now);
 function elapsed(){return baseElapsed+clock.elapsed();}
 function toast(t){notice=ERRORS[t]||t;noticeUntil=now()+3500;draw();}
 function sound(name){if(prefs.sound&&options.audio?.play)options.audio.play(name);}
 function music(){if(options.audio?.music)options.audio.music(prefs.music&&visible&&!['PROVIDER','OFFER','RECOVERY'].includes(modal));}
 function text(t,x,y,size=15,color=P.ink,align='left',maxWidth=1000,bold=false){ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;let n=size;ctx.font=`${bold?'bold ':''}${n}px sans-serif`;while(n>9&&ctx.measureText(String(t)).width>maxWidth){n--;ctx.font=`${bold?'bold ':''}${n}px sans-serif`;}ctx.fillText(String(t),x,y);}
 const center=(t,y,size=15,color=P.ink,max=W-48,bold=false)=>text(t,W/2,y,size,color,'center',max,bold);
 function paragraph(lines,y,size=13,color=P.muted,step=23){lines.forEach((s,i)=>center(s,y+i*step,size,color));}
 function button(id,label,x,y,w,h=44,enabled=true,fill=P.yellow,icon=null){Art.box(ctx,x,y+3,w,h,9,enabled?'#8ba65c':'#a7b392',P.ink,1.6);Art.box(ctx,x,y,w,h,9,enabled?fill:'#d4ddc6',P.ink,1.6);
  if(icon)Art.symbol(ctx,icon,x+25,y+h/2,27);text(label,x+w/2+(icon?10:0),y+h/2,15,enabled?P.ink:'#819272','center',w-12,true);regions.push({id,kind:'button',x,y,w,h,enabled});}
 function small(id,label,x,y,w=46,h=37){button(id,label,x,y,w,h,true,P.cream);}
 function showModal(value){modal=value;page=0;if(value)clock.pause('modal');else clock.resume('modal');music();draw();}
 function panel(title,desired=520,closable=true){regions=[];ctx.fillStyle='rgba(26,51,25,.5)';ctx.fillRect(0,0,W,H);const h=Math.min(desired,H-62),y=(H-h)/2,x=21,w=W-42;Art.box(ctx,x,y+5,w,h,18,'#7f9c5b',P.ink,2.5);Art.box(ctx,x,y,w,h,18,P.cream,P.ink,2.5);Art.box(ctx,x+36,y-13,w-72,53,10,P.yellow,P.ink,2);center(title,y+14,22,P.ink,w-104,true);if(closable)small('close','×',x+w-38,y+43,29,29);return {x,y,w,h};}
 function topBar(){text('2022 玩法重建 · 开发版',16,25,10,P.deep);text(client.kind==='http'?'本地服务联调':'本机测试数据',W-16,25,10,P.deep,'right');}
 function home(){
  small('settings','设置',W-66,49,50,34);text('羊了个羊',23,88,41,P.ink,'left',270,true);Art.sheep(ctx,290,95,57,info.profile.skin);
  text('每天一关，为你的羊队加一只羊',25,126,13,P.deep);
  const titles=[['first','领头羊'],['king','最强王者'],['fast','羊神']];
  for(let i=0;i<3;i++){const x=23+i*117;Art.box(ctx,x,155,110,80,10,i===1?'#f6e28c':'#e8f4ce',P.ink,1.4);Art.sheep(ctx,x+30,192,36,i===1?'cap':'plain');text(titles[i][1],x+72,181,13,P.ink,'center',65,true);text('昨日荣誉',x+72,206,10,P.muted,'center');regions.push({id:'honor-'+titles[i][0],kind:'button',x,y:155,w:110,h:80,enabled:true});}
  const bottom=H-219,fieldY=256,fieldH=Math.max(124,bottom-fieldY-15);
  Art.box(ctx,23,fieldY,W-46,fieldH,17,'#d4efa4',P.deep,2);
  Art.box(ctx,85,fieldY-15,220,37,7,P.cream,P.ink,1.6);center(info.profile.region+'羊队',fieldY+3,20,P.ink,210,true);
  const own=info.regions.find(r=>r.name===info.profile.region);center('今日 '+(own?.wins||0)+' 羊  ·  挑战记录 '+(own?.attempts||0),fieldY+41,12,P.deep);
  const sy=fieldY+fieldH*.6;
  if(info.today.won){Art.sheep(ctx,W/2,sy,84,info.profile.skin,options.motion===false?0:now()/700);center('你已加入羊群',sy+57,14,P.deep);}
  else{Art.tomb(ctx,W/2,sy,58);center(info.today.failures?'今天已尝试 '+info.today.failures+' 次':'羊群还在等你',sy+51,13,P.muted);}
  if(prefs.bullets&&info.bullets.length){const b=info.bullets[Math.floor(now()/4000)%info.bullets.length];Art.box(ctx,50,fieldY+fieldH-80,W-100,26,12,'rgba(255,255,243,.9)',null);center(b.text,fieldY+fieldH-67,12,P.deep);}
  button('start',info.today.won?'已加入羊群':info.today.failures?'再次挑战':'加入羊群',57,H-216,W-114,53,true,P.yellow);
  const names=[['rank','羊群榜'],['friends','朋友圈'],['topic','话题 PK'],['wardrobe','换装'],['profile','个人'],['club','游戏圈']];
  names.forEach(([id,label],i)=>{const col=i%3,row=Math.floor(i/3);button(id,label,23+col*117,H-140+row*43,110,34,true,'#eaf4d3');});
  small('bullet','发弹幕',34,fieldY+fieldH-41,72,30);small('locate','我在哪',W-106,fieldY+fieldH-41,72,30);
  center('开发复现素材与候选规则 · 非线上正式版本',H-20,10,P.deep);
 }
 function boardView(){const b=state.board;small('settings','设置',W-66,48,50,34);small('exit','返回',16,48,50,34);
  center(ticket.mode==='tutorial'?'新手教学':ticket.mode==='topic'?'今日话题挑战':'每日一关',66,25,P.ink,235,true);
  center(ticket.day+'  ·  '+Math.floor(elapsed()/60000)+':'+String(Math.floor(elapsed()/1000)%60).padStart(2,'0'),100,12,P.deep);
  const progress=b.cleared/b.deal.cells.length;Art.box(ctx,36,120,W-72,10,5,'#a4cc71',null);if(progress)Art.box(ctx,36,120,(W-72)*progress,10,5,'#fff8cf',null);
  const cs=b.deal.cells,minX=Math.min(...cs.map(c=>c.rect.x)),maxX=Math.max(...cs.map(c=>c.rect.x+c.rect.w)),minY=Math.min(...cs.map(c=>c.rect.y)),maxY=Math.max(...cs.map(c=>c.rect.y+c.rect.h));
  const maxH=H-431,scale=Math.min((W-26)/(maxX-minX),Math.max(140,maxH)/(maxY-minY)),tx=(W-(maxX-minX)*scale)/2-minX*scale,ty=151-minY*scale;
  const order=cs.slice().sort((a,b)=>a.zone!==b.zone?(a.zone==='board'?-1:1):a.zone==='board'?a.z-b.z:b.position-a.position);
  for(const c of order){const i=b.byId[c.id];if(b.taken[i])continue;const x=tx+c.rect.x*scale,y=ty+c.rect.y*scale,w=c.rect.w*scale,h=c.rect.h*scale,enabled=b.blockers[i]===0;
   Art.tile(ctx,c.type,x,y,w,h,enabled);regions.push({id:'tile:'+c.id,tileId:c.id,kind:'tile',zone:c.zone,x,y,w,h,enabled});}
  const by=H-237,ry=H-158,rw=(W-42)/7;
  text(b.buffer.length?'移出暂存 · 点回主槽':'移出暂存',23,by-15,11,P.deep);
  for(let i=0;i<b.buffer.length;i++){const id=b.buffer[i],x=23+i*49;Art.tile(ctx,b.deal.cells[b.byId[id]].type,x,by,43,44,true);regions.push({id:'tile:'+id,tileId:id,kind:'tile',zone:'buffer',x,y:by,w:43,h:44,enabled:true});}
  if(!b.buffer.length){for(let i=0;i<3;i++)Art.box(ctx,23+i*49,by,43,44,5,'rgba(155,195,105,.38)','#91b65e',1);text('移出不等于消除',190,by+22,12,P.deep);}
  Art.box(ctx,13,ry-10,W-26,65,9,'#839f55',P.ink,2);
  for(let i=0;i<7;i++){const id=b.rack[i],x=22+i*rw;Art.box(ctx,x,ry,rw-4,46,5,'#6c8746',null);if(id&&!flying.some(f=>f.id===id&&now()<f.end))Art.tile(ctx,b.deal.cells[b.byId[id]].type,x,ry,rw-4,46);}
  ['move','undo','shuffle'].forEach((id,i)=>{const eligible=!Round.checkOffer(state,id,rewardRoute);button(id,["移出","撤回","洗牌"][i]+' '+(1-state.used[id])+'/1',23+i*117,H-84,110,43,eligible,P.cream);});
  center(ticket.mode==='tutorial'?'点击三张相同图案，让它们消除':'上层先取 · 三张相同消除 · 七格不可堆满',H-17,10,P.deep);
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
   Art.symbol(ctx,assist==='move'||assist==='revive'?'T05':assist==='undo'?'T08':'T12',W/2,p.y+109,67);
   if(m==='REVIVE'){paragraph(['七格已满，还可以继续本局','复活会将主槽前三张加入暂存','保留原有暂存牌；这是研究候选'],p.y+173,13);button('revive','复活  1/1',p.x+32,p.y+282,p.w-64,46,true,P.yellow);button('give-up','不用了，结束本局',p.x+32,p.y+346,p.w-64,38,true,P.cream);return;}
   if(m==='OFFER'){const lines=assist==='move'?['将主槽前三张移到暂存区','移出的牌仍需取回并消除']:assist==='undo'?['撤回最近一次未形成消除的取牌','回到它原来的位置']:assist==='shuffle'?['重新排列棋盘上尚未取走的图案','不改变槽内牌，不保证通关']:['主槽前三张追加暂存，继续本局','已有暂存牌保留（研究候选）'];paragraph(lines,p.y+173,14);center('本局剩余 1/1',p.y+235,13,P.deep);
    button('grant',pending.channel==='share'?'分享领取':'看视频领取',p.x+32,p.y+279,p.w-64,47,true,P.yellow);button('cancel-grant','不用了',p.x+32,p.y+344,p.w-64,38,true,P.cream);return;}
   if(m==='RECOVERY'){paragraph(['本笔领取记录已经保留','重试只兑现原笔道具，不再请求广告','不要把这笔奖励发给新开的对局'],p.y+177,13);button('retry-grant','重试兑现',p.x+32,p.y+284,p.w-64,48,true,P.yellow);return;}
   paragraph(provider?['正在等待微信返回结果','提前关闭或结果不明不发奖']:['开发模拟 · 当前不是一条真实广告','以下按钮仅用于验证平台返回分支'],p.y+162,13,P.deep);
   if(provider){button('cancel-grant','停止等待',p.x+32,p.y+320,p.w-64,43,true,P.cream);}
   else{button('dev-complete',pending.channel==='share'?'模拟分享返回':'模拟完整观看',p.x+32,p.y+239,p.w-64,42,true,P.yellow);button('dev-cancel','模拟取消 / 提前关闭',p.x+32,p.y+296,p.w-64,38,true,P.cream);button('dev-fail','模拟请求失败',p.x+32,p.y+349,p.w-64,38,true,P.cream);}return;
  }
  if(['WIN','TUTORIAL_WIN','LOSE','SETTLEMENT_ERROR','EXPIRED','EXIT'].includes(m)){
   const title={WIN:'加入羊群！',TUTORIAL_WIN:'准备好了吗？',LOSE:'再试一次吧',SETTLEMENT_ERROR:'成绩尚未保存',EXPIRED:'每日关卡已更新',EXIT:'离开本局？'}[m],p=panel(title,m==='WIN'?495:440,false);
   if(m==='LOSE')Art.tomb(ctx,W/2,p.y+107,72);else Art.sheep(ctx,W/2,p.y+113,85,info.profile.skin);
   if(m==='WIN'){paragraph(['你为'+info.profile.region+'羊队增加了贡献','本日同模式重复通关不重复加羊','用时 '+(elapsed()/1000).toFixed(1)+' 秒'],p.y+199,15,P.deep,28);center('可在换装中查看已解锁形象',p.y+303,12);button('return-home','返回羊群',p.x+30,p.y+p.h-81,p.w-60,49);}
   else if(m==='TUTORIAL_WIN'){paragraph(['三张相同图案即可消除','接下来进入真正的每日挑战'],p.y+201,16);button('next-daily','开始挑战',p.x+30,p.y+314,p.w-60,49);}
   else if(m==='LOSE'){paragraph(['本局结束，今天还可以继续尝试','重新挑战不要求分享或看广告'],p.y+196,14);button('restart','免费重新挑战',p.x+30,p.y+280,p.w-60,46);button('return-home','返回羊群',p.x+30,p.y+346,p.w-60,37,true,P.cream);}
   else if(m==='EXIT'){paragraph(['本局仍未完成','离开不会替你提交通关成绩'],p.y+198,14);button('cancel-exit','继续本局',p.x+30,p.y+282,p.w-60,44);button('confirm-exit','返回羊群',p.x+30,p.y+344,p.w-60,38,true,P.cream);}
   else if(m==='EXPIRED'){paragraph(['不会将旧关卡成绩计入新一天','重新开始当日关卡'],p.y+198,14);button('expired-home','返回羊群',p.x+30,p.y+312,p.w-60,48);}
   else{paragraph(['局面与待提交结果已保留','修复网络或存储后重试，不重复加羊'],p.y+194,13);center(ERRORS[finalError]||finalError||'服务暂不可用',p.y+258,11,P.muted);button('retry-settlement','重新提交原笔成绩',p.x+30,p.y+314,p.w-60,47);}return;
  }
 }
 function draw(){if(disposed)return;regions=[];ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=P.grass;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr*k,0,0,dpr*k,originX*dpr,insets.top*dpr);Art.grass(ctx,W,H);topBar();if(!info){center(finalError?'加载失败':'正在整理羊群…',H/2-15,23);if(finalError){center(finalError,H/2+25,11);button('retry-load','重新加载',70,H/2+75,250,47);}return;}
  if(scene==='HOME')home();else if(state)boardView();
  if(!modal){const t=now();for(const f of flying){if(t>=f.end)continue;const q=Math.max(0,Math.min(1,(t-f.start)/(f.end-f.start))),p=1-Math.pow(1-q,3);Art.tile(ctx,f.type,f.x+(f.toX-f.x)*p,f.y+(f.toY-f.y)*p-Math.sin(p*Math.PI)*24,36,36);}
   for(const s of sparks){if(t>=s.end)continue;const p=(t-s.start)/(s.end-s.start);ctx.globalAlpha=1-p;for(let i=0;i<6;i++){const a=i*Math.PI/3;Art.ellipse(ctx,s.x+Math.cos(a)*p*45,s.y+Math.sin(a)*p*35,3,3,P.cream,null);}ctx.globalAlpha=1;}}
  if(modal)drawModal();if(notice&&noticeUntil>now()){Art.box(ctx,24,H-63,W-48,35,8,'rgba(38,61,39,.95)',null);center(notice,H-46,12,'#fffef2',W-64);}
  if(busy)text('处理中…',W-17,25,10,P.deep,'right');
 }
 function sync(){state=ctl?ctl.get():null;}
 function roundStore(){return storage?{write:log=>storage.set('active-round',JSON.stringify({scope:client.scope,log,ticket,elapsedMs:elapsed()}))}:undefined;}
 async function refresh(){info=await client.request('bootstrap');if(platform)platform.publish(info).catch(()=>{});draw();return info;}
 async function start(mode='daily'){
  if(provider)provider.cancel();if(platform){platform.hideClub();platform.hideFriends();}nativeFriend=null;clock.stop();
  const r=await client.request('start',{mode});ticket=r.ticket;notice='';noticeUntil=0;submission=null;baseElapsed=0;clock.reset();
  ctl=createController(r.deal,{roundId:ticket.id,store:roundStore(),nextU32:options.nextU32});scene='PLAY';modal=null;state=ctl.get();flying=[];sparks=[];inputUntil=0;clock.start();music();draw();return {ok:true};
 }
 async function persistTerminal(){clock.stop();if(!submission)submission={ticketId:ticket.id,log:ctl.export(),elapsedMs:elapsed()};
  try{if(storage)storage.set('outbox',JSON.stringify({scope:client.scope,payload:submission}));await client.request('settle',submission);
   if(storage)storage.set('outbox','');await refresh();finalError=null;showModal(state.board.status==='WON'?(ticket.mode==='tutorial'?'TUTORIAL_WIN':'WIN'):'LOSE');return {ok:true};
  }catch(e){finalError=e.message;if(e.message==='CYCLE_EXPIRED')showModal('EXPIRED');else showModal('SETTLEMENT_ERROR');return {ok:false,code:e.message};}
 }
 async function picked(id,animate=true){if(!ctl||scene!=='PLAY'||modal||!visible)return {ok:false,code:'UI_LOCKED'};
  const old=state,b=old.board,source=regions.find(r=>r.tileId===id),result=ctl.pick(id);if(!result.ok){toast(result.code);return result;}state=ctl.get();sound('click');
  if(prefs.vibration&&options.vibrate)options.vibrate();
  if(animate&&!prefs.reducedMotion&&source){const index=state.board.rack.indexOf(id),x=index<0?W/2:22+index*(W-42)/7,t=now();flying=[{id,type:b.deal.cells[b.byId[id]].type,x:source.x,y:source.y,toX:x,toY:H-158,start:t,end:t+170}];inputUntil=t+180;}
  if(result.events.some(e=>e.type==='CLEAR')){sound('clear');sparks=[{x:W/2,y:H-138,start:now(),end:now()+400}];}
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
 async function applyReward(){const r=ctl.apply();sync();if(!r.ok){showModal('RECOVERY');toast(r.code);return r;}clock.resume('lost');clock.start();showModal(null);sound('clear');return r;}
 async function launch(){const r=ctl.launch();if(!r.ok){toast(r.code);return r;}sync();showModal('PROVIDER');if(provider){const p=state.pending;
   const opened=provider.open(p.channel==='video'?'ad':'share',{id:p.token,roundId:ticket.id},e=>{
    if(e.kind==='share_returned'){if(ctl&&e.roundId===ticket.id)ctl.result({kind:'share_hide',roundId:e.roundId,token:e.flowId});rewardResult({kind:'share_return',roundId:e.roundId,token:e.flowId});}
    else rewardResult({kind:e.kind==='ad_closed'?'ad_close':e.kind,roundId:e.roundId,token:e.flowId,isEnded:e.isEnded});
   });if(!opened.ok)await rewardResult({roundId:ticket.id,token:p.token,kind:'failed'});
  }return r;}
 async function returnHome(){if(provider)provider.cancel();if(platform){platform.hideFriends();platform.hideClub();}nativeFriend=null;clock.stop();ctl=null;state=null;ticket=null;submission=null;scene='HOME';modal=null;await refresh();music();draw();}
 function loadFriends(){nativeFriend=null;if(platform){const p={x:37,y:(H-Math.min(600,H-62))/2+83,w:W-74,h:Math.min(600,H-62)-186};const r=platform.friends({day:info.day,history:friendHistory,width:Math.round(p.w*k*dpr),height:Math.round(p.h*k*dpr),page});if(r.ok)nativeFriend=r.canvas;}}
 async function handle(id){
  if(id==='retry-load')return initialize();
  if(id.startsWith('tile:'))return picked(id.slice(5));
  if(id==='start'){if(info.today.won){toast('今天已加入羊群，下一关将在零点更新');return;}afterTutorial='daily';return start(info.profile.tutorialDone?'daily':'tutorial');}
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
  if(id.startsWith('setting-')){const key=id.slice(8);if(key in prefs){const next=!prefs[key];if(storage)storage.set('preferences',JSON.stringify({...prefs,[key]:next}));prefs[key]=next;music();draw();}return;}
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
 async function tap(x,y){if(!visible||disposed||busy||!Number.isFinite(x)||!Number.isFinite(y)||(!prefs.reducedMotion&&now()<inputUntil))return {ok:false,code:'UI_LOCKED'};
  x=(x-originX)/k;y=(y-insets.top)/k;let target;for(let i=regions.length-1;i>=0;i--){const r=regions[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h){target=r;break;}}
  if(!target||!target.enabled)return {ok:false,code:'NOT_ACTIONABLE'};busy=true;try{return await handle(target.id);}catch(e){toast(e.message);return {ok:false,code:e.message};}finally{busy=false;draw();}}
 async function initialize(){try{await refresh();finalError=null;
   if(storage){const queued=JSON.parse(storage.get('outbox')||'null');if(queued?.scope===client.scope){try{await client.request('settle',queued.payload);storage.set('outbox','');await refresh();}catch(e){if(e.message==='CYCLE_EXPIRED')storage.set('outbox','');}}
    const saved=JSON.parse(storage.get('active-round')||'null');if(saved?.scope===client.scope&&saved.ticket?.day===info.day){const restored=Round.restore(saved.log);
     if(restored.ok&&restored.state.pending?.phase==='EARNED'){ticket=saved.ticket;baseElapsed=Math.max(0,saved.elapsedMs||0);ctl=createController(restored.state.initialDeal,{saved:saved.log,store:roundStore()});state=ctl.get();scene='PLAY';showModal('RECOVERY');}}
   }music();draw();return {ok:true};
  }catch(e){finalError=e.message;info=null;draw();return {ok:false,code:e.message};}}
 function resize(w,h,ratio=dpr,padding=insets){if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('INVALID_VIEWPORT');width=w;height=h;dpr=Math.min(4,Math.max(1,ratio));insets={top:Math.min(height*.25,Math.max(0,padding.top||0)),bottom:Math.min(height*.25,Math.max(0,padding.bottom||0))};const usable=Math.max(1,height-insets.top-insets.bottom);k=Math.min(width/W,usable/620);originX=(width-W*k)/2;H=usable/k;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
 async function setVisible(v){visible=!!v;if(visible){clock.resume('hidden');if(info&&cycle(now())!==info.day){await refresh();if(ticket&&ticket.day!==info.day)showModal('EXPIRED');}draw();}else clock.pause('hidden');music();}
 function frame(){if(!visible||disposed)return;if(now()-lastCycleCheck>1000){lastCycleCheck=now();if(info&&now()>=info.nextReset){if(ticket&&now()>=ticket.expiresAt)showModal('EXPIRED');else refresh().catch(e=>toast(e.message));}}draw();}
 resize(width,height,dpr);const ready=initialize();
 return {ready,tap,frame,resize,setVisible,destroy(){disposed=true;clock.stop();provider?.destroy();platform?.destroy();options.audio?.destroy?.();},
 getScene:()=>scene,getModal:()=>modal,getState:()=>state?clone(state):null,getInfo:()=>info?clone(info):null,getPreferences:()=>({...prefs}),
 getHitRegions:()=>regions.map(r=>({...r,x:originX+r.x*k,y:insets.top+r.y*k,w:r.w*k,h:r.h*k})),getMetrics:()=>ctl?.metrics()||null,
 exportDiagnostic:()=>ctl?.export()||null,
 qa:{start,pick:id=>picked(id,false),setChannel(v){if(!['video','share'].includes(v))throw Error('INVALID_CHANNEL');rewardRoute=v;},
  failEarned:()=>{const p=state.pending;return rewardResult({roundId:ticket.id,token:p.token,kind:'ad_close',isEnded:true},true);},
  result:rewardResult,settings:p=>{Object.assign(prefs,p);draw();},elapsed,client}};
}
module.exports={createFullApp};
