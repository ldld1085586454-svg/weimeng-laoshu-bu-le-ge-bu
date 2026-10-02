'use strict';
const A=require('./art'),{P}=A;
const FONT='"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
// Expand only the display footprint; the deal's rectangles still determine blockers.
const BOARD_CARD_PAD=1.5;
const easeOut=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
function icon(c,name,x,y,size=24,color=P.ink){
 c.save();c.translate(x,y);c.scale(size/24,size/24);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.lineCap='round';c.lineJoin='round';
 const path=p=>A.line(c,p,color,2),circle=(a,b,r)=>{c.beginPath();c.arc(a,b,r,0,Math.PI*2);c.stroke();};
 switch(name){
 case 'back':path([[3,-7],[-4,0],[3,7]]);break;
 case 'close':path([[-5,-5],[5,5]]);path([[5,-5],[-5,5]]);break;
 case 'settings':{const teeth=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,r=[7.5,10,10,7.5][i%4];teeth.push([Math.cos(a)*r,Math.sin(a)*r]);}A.shape(c,teeth,color,null);A.ellipse(c,0,0,3.1,3.1,P.cream,null);break;}
 case 'move':path([[-8,1],[-8,9],[8,9],[8,1]]);path([[0,5],[0,-9]]);path([[-5,-4],[0,-9],[5,-4]]);break;
 case 'undo':path([[-3,-8],[-9,-2],[-2,-2]]);c.beginPath();c.arc(0,1,8,-Math.PI*.6,Math.PI*.85);c.stroke();break;
 case 'shuffle':path([[-9,-7],[-5,-7],[6,7],[10,7]]);path([[-9,7],[-5,7],[6,-7],[10,-7]]);path([[6,-10],[10,-7],[7,-4]]);path([[7,4],[10,7],[6,10]]);break;
 case 'rank':A.box(c,-5,-8,10,13,3,null,color,2);path([[-5,-6],[-9,-6],[-9,-2],[-5,1]]);path([[5,-6],[9,-6],[9,-2],[5,1]]);path([[0,5],[0,10]]);path([[-5,10],[5,10]]);break;
 case 'friends':circle(0,-5,4);circle(-8,-1,3);circle(8,-1,3);c.beginPath();c.arc(0,7,7,Math.PI,0);c.stroke();path([[-10,10],[10,10]]);break;
 case 'topic':path([[-8,-9],[10,7],[7,10],[-10,-7],[-8,-9]]);path([[8,-9],[-10,7],[-7,10],[10,-7],[8,-9]]);break;
 case 'wardrobe':path([[-4,-9],[-10,-5],[-7,0],[-4,-2],[-4,10],[4,10],[4,-2],[7,0],[10,-5],[4,-9]]);c.beginPath();c.arc(0,-9,4,0,Math.PI);c.stroke();break;
 case 'profile':circle(0,-5,4);c.beginPath();c.arc(0,9,8,Math.PI,0);c.stroke();path([[-8,9],[8,9]]);break;
 case 'club':circle(0,0,8);c.beginPath();c.ellipse(0,0,13,4,-.45,0,Math.PI*2);c.stroke();break;
 case 'bullet':A.box(c,-9,-8,18,14,5,null,color,2);path([[-3,6],[-6,10],[-6,5]]);for(const a of [-4,0,4])A.ellipse(c,a,-1,1,1,color,null);break;
 case 'locate':c.beginPath();c.arc(0,-3,7,Math.PI,0);c.lineTo(0,10);c.lineTo(-7,-3);c.stroke();circle(0,-3,2);break;
 case 'revive':circle(0,0,9);path([[-4,0],[4,0]]);path([[0,-4],[0,4]]);break;
 case 'video':A.box(c,-10,-7,20,14,4,null,color,2);A.shape(c,[[-2,-4],[4,0],[-2,4]],color,null);break;
 case 'sound':path([[-9,-3],[-5,-3],[1,-8],[1,8],[-5,3],[-9,3],[-9,-3]]);c.beginPath();c.arc(2,0,7,-.9,.9);c.stroke();break;
 default:circle(0,0,7);
 }
 c.restore();
}
function landscape(c,w,h,variant='home'){
 const base=variant==='home'?h*.60:h*.61,span=variant==='home'?h*.22:h*.31;
 c.fillStyle='#e5edd9';c.beginPath();c.moveTo(0,base);c.bezierCurveTo(w*.16,base-span,w*.35,base-span,w*.54,base-22);c.bezierCurveTo(w*.79,base-span*.8,w*.85,base-span*.6,w,base-16);c.lineTo(w,base+70);c.lineTo(0,base+70);c.fill();
 c.fillStyle='#d9e6c6';c.beginPath();c.moveTo(0,base+8);c.quadraticCurveTo(w*.32,base-span*.32,w*.61,base+15);c.quadraticCurveTo(w*.82,base-30,w,base+24);c.lineTo(w,base+70);c.lineTo(0,base+70);c.fill();
 c.fillStyle='#edf3e2';c.beginPath();c.moveTo(0,base+28);c.quadraticCurveTo(w*.43,base-20,w,base+42);c.lineTo(w,h);c.lineTo(0,h);c.fill();
 if(variant==='home'){for(const [x,y,s] of [[43,base-span-10,1],[310,base-span*.72-16,.7]]){A.ellipse(c,x,y,24*s,8*s,P.cream,null);A.ellipse(c,x-8*s,y-6*s,12*s,11*s,P.cream,null);A.ellipse(c,x+7*s,y-10*s,13*s,15*s,P.cream,null);}}
 for(let i=0;i<12;i++){const x=24+(i*79)%(w-48),y=base+18+(i*29)%68;A.line(c,[[x-3,y],[x,y+3],[x+3,y-3]],'#becf9f',1.4);}
}
function rackGeometry(h){const w=(390-44)/7;return {x:22,y:h-217,w,cardW:w-2,h:51};}
function boardCardRect(cell,g){const r=cell.rect;return {x:g.tx+(r.x-BOARD_CARD_PAD)*g.scale,y:g.ty+(r.y-BOARD_CARD_PAD)*g.scaleY,w:(r.w+2*BOARD_CARD_PAD)*g.scale,h:(r.h+2*BOARD_CARD_PAD)*g.scaleY};}
function boardGeometry(deal,h){
 const cells=deal.cells.filter(c=>c.zone==='board'),use=cells.length?cells:deal.cells;
 const minX=Math.min(...use.map(c=>c.rect.x))-BOARD_CARD_PAD,maxX=Math.max(...use.map(c=>c.rect.x+c.rect.w))+BOARD_CARD_PAD,minY=Math.min(...use.map(c=>c.rect.y))-BOARD_CARD_PAD,maxY=Math.max(...use.map(c=>c.rect.y+c.rect.h))+BOARD_CARD_PAD;
 const top=144,sideY=h-354,bottom=deal.cells.some(c=>c.zone==='side')?sideY-26:h-346;
 const scale=Math.min(354/(maxX-minX),Math.max(64,bottom-top)/(maxY-minY));
 const scaleY=scale,contentH=(maxY-minY)*scaleY,offset=Math.max(0,bottom-top-contentH)*.10;
 return {scale,scaleY,tx:(390-(maxX-minX)*scale)/2-minX*scale,ty:top+offset-minY*scaleY,sideY};
}
function star(c,x,y,r,fill=P.cream){const points=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,s=i%2?r*.48:r;points.push([x+Math.cos(a)*s,y+Math.sin(a)*s]);}A.shape(c,points,fill,'#a4ad91',1);}
module.exports={star,FONT,easeOut,icon,landscape,rackGeometry,boardGeometry,boardCardRect};
