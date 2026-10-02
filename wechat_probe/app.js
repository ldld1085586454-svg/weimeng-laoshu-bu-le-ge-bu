'use strict';
// Developer-only probe. Labels, colors and replay controls are not original game UI.
const Runtime=require('./engine/runtime');
function createProbe(canvas,deal,witness,initialWidth,initialHeight,dpr=1) {
  const ctx=canvas.getContext('2d');let width=initialWidth,height=initialHeight,state=Runtime.createRound(deal),timer=null,cursor=0;
  let boardTransform={x:0,y:0,scale:1},buttons=[],drawOrder=[];
  const all=deal.cells, minX=Math.min(...all.map(c=>c.rect.x)),maxX=Math.max(...all.map(c=>c.rect.x+c.rect.w));
  const minY=Math.min(...all.map(c=>c.rect.y)),maxY=Math.max(...all.map(c=>c.rect.y+c.rect.h));
  function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
  function text(s,x,y,size=14,color='#263d2f',align='left') {ctx.font=`${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);}
  function draw() {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#eff4ed';ctx.fillRect(0,0,width,height);
    text('算法联调 / 不是原作界面',width/2,66,20,'#1d3b28','center');
    text(`${deal.cells.length} 张 · 已消除 ${state.cleared} · 槽 ${state.rack.length}/7`,width/2,96,14,'#4c6453','center');
    const top=122,availableH=Math.max(80,height-350),scale=Math.min((width-30)/(maxX-minX),availableH/(maxY-minY));
    boardTransform={x:(width-(maxX-minX)*scale)/2-minX*scale,y:top-minY*scale,scale};
    drawOrder=all.slice().sort((a,b)=>{
      if(a.zone!==b.zone)return a.zone==='board'?-1:1;
      return a.zone==='board'?a.z-b.z:b.position-a.position;
    });
    const legal=new Set(Runtime.legalMoves(state));
    for(const c of drawOrder) {
      if(state.taken[state.byId[c.id]])continue;
      const r=c.rect,x=boardTransform.x+r.x*scale,y=boardTransform.y+r.y*scale,w=r.w*scale,h=r.h*scale;
      ctx.fillStyle=legal.has(c.id)?'#fffef5':'#b5c1b4';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#739076';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);
      text(legal.has(c.id)?String(Number(c.type.slice(1))+1):'·',x+w/2,y+h*.65,Math.max(10,w*.43),legal.has(c.id)?'#2d573d':'#6b7d6d','center');
    }
    const rackY=Math.max(top+(maxY-minY)*scale+22,height-205),bw=(width-38)/7;
    for(let i=0;i<7;i++) {
      const x=15+i*(bw+1);ctx.fillStyle='#d2dfce';ctx.fillRect(x,rackY,bw-2,48);
      if(state.rack[i])text(String(Number(state.deal.cells[state.byId[state.rack[i]]].type.slice(1))+1),x+(bw-2)/2,rackY+31,22,'#224b32','center');
    }
    text(state.status==='WON'?'证据已完整走通':state.status==='LOST'?'本次操作失败，可重开':timer!==null?'正在回放通关证据':'点击露出的牌进行测试',width/2,rackY+77,15,'#3a5b44','center');
    buttons=[{x:18,y:rackY+100,w:(width-48)/2,h:44,kind:'restart'}, {x:30+(width-48)/2,y:rackY+100,w:(width-48)/2,h:44,kind:'replay'}];
    for(const b of buttons){ctx.fillStyle='#28553a';ctx.fillRect(b.x,b.y,b.w,b.h);text(b.kind==='restart'?'重开样例':'证据回放（测试）',b.x+b.w/2,b.y+28,14,'#ffffff','center');}
  }
  function restart(){stop();state=Runtime.createRound(deal);cursor=0;draw();}
  function stepEvidence(){
    if(cursor>=witness.length){stop();return false;}
    const r=Runtime.pick(state,witness[cursor]);if(!r.ok){stop();throw new Error(`REPLAY_ERROR:${r.code}`);}
    state=r.state;cursor++;draw();if(cursor===witness.length)stop();return true;
  }
  function tap(x,y){
    const b=buttons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    if(b){if(b.kind==='restart')restart();else{restart();timer=setInterval(stepEvidence,55);}return;}
    if(timer!==null||state.status!=='PLAYING')return;
    const lx=(x-boardTransform.x)/boardTransform.scale,ly=(y-boardTransform.y)/boardTransform.scale;
    for(let i=drawOrder.length-1;i>=0;i--){const c=drawOrder[i],r=c.rect;if(state.taken[state.byId[c.id]])continue;
      if(lx>=r.x&&lx<r.x+r.w&&ly>=r.y&&ly<r.y+r.h){const result=Runtime.pick(state,c.id);if(result.ok)state=result.state;draw();return;}}
  }
  function resize(w,h,ratio=dpr){width=w;height=h;dpr=ratio;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);draw();}
  resize(width,height,dpr);
  return {tap,resize,restart,stepEvidence,destroy:stop,getState:()=>state};
}
module.exports={createProbe};
