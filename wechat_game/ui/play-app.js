'use strict';
// Shared developer canvas UI, not the original game's art or complete homepage.
const Session=require('../src/play/session');
const Board=require('../src/play/board');
const {PROFILE}=require('../src/play/profile');
const {permute}=require('../src/play/shuffle');
const LABELS={move:'移出',undo:'撤回',shuffle:'洗牌',revive:'复活'};
const REASONS={NOT_ENOUGH_RACK_TILES:'槽内至少有三张才能移出',BUFFER_OCCUPIED:'暂存区仍有牌',NO_UNDO:'没有可撤回的取牌',
  UNDO_SOURCE_UNBOUND:'侧堆／暂存撤回规则尚未核定',REVIVE_RULE_UNBOUND:'复活效果尚未绑定，不模拟救局',
  ASSIST_EXHAUSTED:'本局该道具已用完',ROUND_NOT_PLAYING:'本局已结束',REWARD_PENDING:'请先处理领取弹窗',
  NO_REMAINING_TILES:'没有可洗的棋盘牌',BLOCKED:'该牌仍被遮挡'};
function createPlayApp(canvas,deal,initialWidth,initialHeight,dpr=1,options={}) {
  const ctx=canvas.getContext('2d');let width=initialWidth,height=initialHeight,scene='HOME',session=null,regions=[],visible=true,
    notice='',serial=0,commandSerial=0;
  const instance=Date.now().toString(36)+'-'+Math.floor(Math.random()*1e9).toString(36);
  const idFactory=options.idFactory||(()=>instance+'-'+(++serial));
  const typeList=[...new Set(deal.cells.map(c=>c.type))].sort();
  const label=type=>String(typeList.indexOf(type)+1);
  function rect(x,y,w,h,color,stroke){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);}}
  function text(t,x,y,size=14,color='#263e36',align='left'){
    ctx.font=`${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);
  }
  function center(t,y,size=14,color='#263e36'){text(t,width/2,y,size,color,'center');}
  function button(id,t,x,y,w,h=44,enabled=true,tint='#255b44') {
    rect(x,y,w,h,enabled?tint:'#dfe5e0');text(t,x+w/2,y+h/2+5,14,enabled?'#fff':'#738379','center');
    regions.push({id,kind:'button',x,y,w,h,enabled});
  }
  function modal(title,lines) {
    rect(0,0,width,height,'rgba(13,31,22,.48)');const x=18,y=Math.max(70,height/2-170),w=width-36,h=330;
    rect(x,y,w,h,'#fafbf5','#bdcabc');center(title,y+39,20);lines.forEach((line,i)=>center(line,y+70+i*22,12,'#617265'));return {x,y,w,h};
  }
  function draw() {
    regions=[];ctx.setTransform(dpr,0,0,dpr,0,0);rect(0,0,width,height,'#f2f5ec');
    text('DEV / v0.9',18,31,11,'#486956');text('候选规则 · 模拟领取',width-18,31,11,'#6a786c','right');
    if(scene==='HOME') {
      center('道具与对局联调',height*.27,27);center('算法基线 v0.8 · 本轮新增交互流程',height*.27+35,13,'#637567');
      center(`${deal.cells.length} 张合成测试牌`,height*.27+78,17);
      button('start','开始测试',32,height*.5,width-64,52);
      center('移出前三张 · 撤回 · 洗牌',height*.5+89,14);
      center('非原作美术；没有接入真实广告。',height-104,12,'#637567');
      center('完整首页、社交与复活仍在后续范围内。',height-80,11,'#637567');return;
    }
    const s=session.board;
    center('单人对局',70,23);center(`已消除 ${s.cleared}/${s.deal.cells.length}  ·  槽位 ${s.rack.length}/7`,98,13,'#627569');
    const cs=s.deal.cells,minX=Math.min(...cs.map(c=>c.rect.x)),maxX=Math.max(...cs.map(c=>c.rect.x+c.rect.w)),
      minY=Math.min(...cs.map(c=>c.rect.y)),maxY=Math.max(...cs.map(c=>c.rect.y+c.rect.h));
    const areaH=Math.max(100,height-442),scale=Math.min((width-32)/(maxX-minX),areaH/(maxY-minY)),
      tx=(width-(maxX-minX)*scale)/2-minX*scale,ty=130-minY*scale;
    const drawOrder=cs.slice().sort((a,b)=>a.zone!==b.zone?(a.zone==='board'?-1:1):a.zone==='board'?a.z-b.z:b.position-a.position);
    for(const c of drawOrder){if(s.taken[s.byId[c.id]])continue;
      const x=tx+c.rect.x*scale,y=ty+c.rect.y*scale,w=c.rect.w*scale,h=c.rect.h*scale,
        active=s.blockers[s.byId[c.id]]===0;
      rect(x,y+2,w,h,'#9bab97');rect(x,y,w,h,active?'#fffef4':'#c6cfc2','#7e977d');
      text(active?label(c.type):'·',x+w/2,y+h*.66,Math.max(9,w*.45),active?'#294b35':'#8a9786','center');
      regions.push({id:'tile:'+c.id,tileId:c.id,zone:c.zone,kind:'tile',x,y,w,h,enabled:active});
    }
    const bufferY=height-272,rackY=height-204,cardW=Math.min(44,(width-48)/7),gap=5;
    text('暂存区',18,bufferY-9,12,'#667b68');
    if(!s.buffer.length)text('移出后仍需取回消除',93,bufferY-9,11,'#849181');
    for(let i=0;i<3;i++){
      const x=18+i*(cardW+gap),id=s.buffer[i];rect(x,bufferY,cardW,40,id?'#fffef4':'#e3e9dc','#bdcbb5');
      if(id){text(label(s.deal.cells[s.byId[id]].type),x+cardW/2,bufferY+27,19,'#294b35','center');
        regions.push({id:'tile:'+id,tileId:id,kind:'tile',zone:'buffer',x,y:bufferY,w:cardW,h:40,enabled:true});}
    }
    text('主槽',18,rackY-9,12,'#667b68');const rw=(width-36-6*5)/7;
    for(let i=0;i<7;i++){const x=18+i*(rw+5),id=s.rack[i];rect(x,rackY,rw,43,id?'#fffef4':'#dce5d3','#9db196');
      if(id)text(label(s.deal.cells[s.byId[id]].type),x+rw/2,rackY+28,19,'#294b35','center');}
    const bw=(width-52)/3;
    for(const [i,kind] of ['move','undo','shuffle'].entries())button(kind,`${LABELS[kind]}  ${1-session.used[kind]}/1`,18+i*(bw+8),height-143,bw,44,
      session.used[kind]===0&&!Board.canAssist(s,kind,PROFILE));
    center(notice||'点击未被遮挡的牌，三张相同即可消除',height-77,11,'#526b56');
    center('暂存取回等边界为候选规则；本页仅供开发验收',height-55,10,'#758272');
    button('restart','重新测试',18,height-40,(width-44)/2,28,true,'#728873');
    button('home','返回测试首页',26+(width-44)/2,height-40,(width-44)/2,28,true,'#728873');
    if(s.status!=='PLAYING'){
      scene='RESULT';regions=[];
      const box=modal(s.status==='WON'?'本局已全部消除':'本局已失败',s.status==='WON'?['主区、侧堆、主槽与暂存均已处理完。','这是合成关卡的实际运行结果。']:['七格已满，且没有形成三消。','复活效果未核定，本版不伪造救局。']);
      if(s.status==='LOST')button('revive','复活 · 规则待核',box.x+18,box.y+130,box.w-36,38,false);
      button('restart','重新测试',box.x+18,box.y+188,box.w-36,44);
      button('home','返回测试首页',box.x+18,box.y+246,box.w-36,40,true,'#758973');
    }
    if(session.pending){regions=[];const p=session.pending,box=modal(`领取${LABELS[p.assist]} · 模拟器`,[
      '这里不会播放或请求真实广告。','只有“模拟完成”才会提交道具变化。']);
      const half=(box.w-48)/2;
      button('mock-completed','模拟完成',box.x+18,box.y+120,half,44);
      button('mock-cancelled','模拟取消',box.x+30+half,box.y+120,half,44,true,'#738872');
      button('mock-failed','模拟失败',box.x+18,box.y+180,half,44,true,'#738872');
      button('mock-share_returned','分享返回',box.x+30+half,box.y+180,half,44,true,'#738872');
      center('取消、失败、分享返回均不发奖。',box.y+264,11,'#657566');
    }
  }
  function send(type,extra={}) {
    const result=Session.dispatch(session,{id:'ui-'+(++commandSerial),roundId:session.roundId,expectedRevision:session.revision,type,...extra});
    session=result.session;notice=result.ok?'':(REASONS[result.code]||result.code);draw();return result;
  }
  function restart(){session=Session.createSession(deal,{roundId:idFactory(),rewardMode:'development_mock'});scene='PLAY';notice='';draw();}
  function finishMock(result){const p=session.pending;if(!p)return;
    const extra={token:p.token,result};
    if(result==='completed'&&p.assist==='shuffle')extra.permutation=permute(session.board.deal.cells.filter((c,i)=>!session.board.taken[i]).map(c=>c.type),options.nextU32);
    return send('REWARD_RESULT',extra);
  }
  function tap(x,y) {
    if(!visible||!Number.isFinite(x)||!Number.isFinite(y))return;
    let region=null;for(let i=regions.length-1;i>=0;i--){const r=regions[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h){region=r;break;}}
    if(!region)return;
    if(region.kind==='tile'){if(session&&!session.pending&&scene==='PLAY')send('PICK',{tileId:region.tileId});return;}
    const id=region.id;
    if(id==='start'||id==='restart'){restart();return;}
    if(id==='home'){scene='HOME';session=null;notice='';draw();return;}
    if(id.startsWith('mock-')){finishMock(id.slice(5));return;}
    send('REQUEST_ASSIST',{assist:id});
  }
  function resize(w,h,ratio=dpr){width=Math.max(240,w);height=Math.max(480,h);dpr=Math.min(4,Math.max(1,ratio));canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
  function setVisible(value){visible=!!value;if(visible)draw();}
  resize(width,height,dpr);
  return {tap,resize,restart,setVisible,destroy:()=>setVisible(false),getScene:()=>scene,getSession:()=>session,
    getHitRegions:()=>regions.map(r=>({...r})),pickForQA:id=>send('PICK',{tileId:id}),
    exportDiagnostic:()=>session?Session.exportSession(session):null};
}
module.exports={createPlayApp};
