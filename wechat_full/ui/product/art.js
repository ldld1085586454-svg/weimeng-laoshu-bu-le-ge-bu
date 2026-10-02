'use strict';
// Original development vector illustrations. Not extracted Sheep-game assets.
const P={ink:'#254332',grass:'#f2f6e9',deep:'#577457',cream:'#fffcf3',shadow:'#b5c39f',yellow:'#f6c95e',muted:'#78836e',white:'#ffffff',border:'#bec9ac'};
function box(c,x,y,w,h,r=10,fill=P.cream,stroke=P.ink,lw=2){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function ellipse(c,x,y,rx,ry,fill,stroke=P.ink,lw=2){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function line(c,points,color=P.ink,width=3){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function shape(c,points,fill,stroke=P.ink,lw=2){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.lineJoin='round';c.stroke();}}
function sheep(c,x,y,size=70,skin='plain',phase=0){c.save();c.translate(x,y+Math.sin(phase)*2);c.scale(size/80,size/80);
 ellipse(c,0,26,28,6,'rgba(44,82,28,.13)',null);
 line(c,[[-15,15],[-17,27]],P.ink,6);line(c,[[15,15],[17,27]],P.ink,6);
 for(const [a,b,r] of [[-22,0,13],[-12,-15,14],[9,-18,14],[25,-5,13],[17,11,14],[-2,15,14],[-19,12,13]])ellipse(c,a,b,r,r,'#fffef5');
 ellipse(c,0,0,27,23,'#fffef5',null);ellipse(c,-19,-13,8,5,'#dbb995');ellipse(c,19,-13,8,5,'#dbb995');
 ellipse(c,0,-5,19,21,'#f6dfb9');ellipse(c,-7,-8,2.4,3.3,P.ink,null);ellipse(c,7,-8,2.4,3.3,P.ink,null);
 line(c,[[-4,2],[0,5],[4,2]],P.ink,2);ellipse(c,-12,-1,3.5,2,'#e5a98f',null);ellipse(c,12,-1,3.5,2,'#e5a98f',null);
 if(skin==='cap'){box(c,-21,-36,42,17,7,'#eac775');box(c,-29,-24,58,8,3,'#edcb83');}
 if(skin==='scarf'){box(c,-19,10,38,9,4,'#ce7b70');shape(c,[[12,17],[23,18],[19,33],[11,27]],'#ce7b70');}
 c.restore();}
function tomb(c,x,y,size=60){c.save();c.translate(x,y);c.scale(size/60,size/60);ellipse(c,0,25,30,5,'rgba(44,82,28,.12)',null);box(c,-21,-24,42,50,16,'#d5dac9');line(c,[[-10,-5],[10,-5]],'#667360',2);line(c,[[-7,2],[7,2]],'#667360',2);line(c,[[-14,27],[-18,17],[-22,26]],'#4d8239',3);c.restore();}
function symbol(c,type,x,y,size=32){let n=Number(String(type).replace(/\D/g,''));if(!Number.isFinite(n))n=0;c.save();c.translate(x,y);c.scale(size/48,size/48);c.lineCap='round';c.lineJoin='round';
 switch(n%15){
 case 0:shape(c,[[-14,-9],[13,-6],[-6,22]],'#f19946');line(c,[[0,-9],[0,-24]],'#4b9346',4);line(c,[[0,-13],[-12,-22]],'#4b9346',4);line(c,[[0,-13],[13,-23]],'#4b9346',4);line(c,[[-8,0],[0,2]],'#bd6936',2);line(c,[[-6,9],[-2,10]],'#bd6936',2);break;
 case 1:line(c,[[-8,22],[9,-22]],'#9d713a',3);for(let i=0;i<4;i++){ellipse(c,-3+i*4,10-i*9,6,3,'#ebc758');ellipse(c,5+i*4,8-i*9,5,3,'#ebc758');}break;
 case 2:ellipse(c,0,-3,12,21,'#efd460');for(let j=-13;j<13;j+=7)line(c,[[-7,j],[7,j]],'#ba903e',1);shape(c,[[-19,2],[-3,22],[-2,9]],'#66a651');shape(c,[[21,-5],[9,24],[-2,20],[6,8]],'#80b85a');break;
 case 3:ellipse(c,0,2,20,19,'#8ac977');ellipse(c,6,-2,11,15,'#b0dd85');line(c,[[0,20],[2,1],[8,-12]],'#55994d',2);line(c,[[1,12],[-11,0]],'#55994d',2);break;
 case 4:box(c,-13,-17,26,38,5,'#fffefa');box(c,-9,-23,18,7,2,'#cc7560');box(c,-13,-2,26,13,1,'#add9df');line(c,[[-5,3],[0,6],[6,3]],'#5d9daa',2);break;
 case 5:box(c,-17,-8,34,28,5,'#a3d4e3');c.beginPath();c.arc(0,-7,15,Math.PI,0);c.strokeStyle=P.ink;c.lineWidth=3;c.stroke();box(c,-19,-10,38,5,2,'#cedecf');line(c,[[3,-3],[3,13]],'#e4f4f1',3);break;
 case 6:shape(c,[[-11,20],[-19,-1],[-16,-5],[-11,0],[-12,-17],[-8,-20],[-4,-5],[-3,-22],[2,-21],[4,-6],[7,-18],[12,-16],[10,-2],[15,-8],[20,-5],[14,18]],'#e39986');line(c,[[-11,17],[13,15]],'#a8514d',3);break;
 case 7:for(const [a,b] of [[-13,0],[0,-10],[12,0],[5,12],[-9,12]])ellipse(c,a,b,11,11,'#fffefa');ellipse(c,0,1,12,12,'#fffefa',null);line(c,[[-7,2],[-1,-4],[5,3]],'#d9dbca',2);break;
 case 8:line(c,[[-16,22],[7,-5]],'#936643',6);box(c,0,-22,24,20,3,'#c4a6ca');line(c,[[4,-20],[4,-9]],'#705274',2);line(c,[[11,-20],[11,-9]],'#705274',2);line(c,[[18,-20],[18,-9]],'#705274',2);break;
 case 9:box(c,-21,-14,42,29,3,'#ddb277');line(c,[[-17,-7],[14,-7]],'#a17b4a',2);line(c,[[-12,2],[19,2]],'#a17b4a',2);line(c,[[-17,10],[5,10]],'#a17b4a',2);ellipse(c,9,8,4,2,'#c08d56');break;
 case 10:shape(c,[[0,-24],[8,-6],[15,-15],[22,9],[13,22],[-9,24],[-22,9],[-17,-6],[-12,1]],'#e78c49');shape(c,[[1,-5],[9,11],[1,21],[-8,11]],'#f8d968',null);break;
 case 11:line(c,[[0,4],[0,24]],'#588c43',4);for(let i=0;i<8;i++){const a=i*Math.PI/4;ellipse(c,Math.cos(a)*13,Math.sin(a)*13-8,6,6,'#f2d261');}ellipse(c,0,-8,9,9,'#a38349');break;
 case 12:shape(c,[[-23,21],[-24,-9],[-12,2],[-9,-23],[1,0],[13,-17],[12,5],[23,-8],[18,21]],'#83b854');line(c,[[-11,17],[-10,-2]],'#4d8a41',2);line(c,[[5,16],[7,0]],'#4d8a41',2);break;
 case 13:ellipse(c,-7,4,15,17,'#df8064');ellipse(c,7,4,15,17,'#df8064');ellipse(c,0,4,15,15,'#df8064',null);line(c,[[0,-9],[3,-22]],'#80673e',3);ellipse(c,11,-18,9,4,'#7cb461');ellipse(c,-11,0,3,7,'#efb398',null);break;
 case 14:ellipse(c,0,-17,6,6,'#e2c565');shape(c,[[-12,-12],[11,-12],[15,8],[20,12],[-20,12],[-14,8]],'#f3d87c');ellipse(c,0,17,5,5,'#bc944c');line(c,[[-16,13],[18,13]],P.ink,3);break;
 }
 c.restore();}
function tile(c,type,x,y,w,h,active=true){box(c,x,y+3,w,h,6,active?'#a9b98d':'#aeb9a3',null);box(c,x,y,w,h-1,6,active?P.cream:'#d4dec5',active?'#869873':'#a0af91',1);if(active)line(c,[[x+8,y+2],[x+w-8,y+2]],'#ffffff',1);if(type){c.save();c.globalAlpha*=active?1:.60;symbol(c,type,x+w/2,y+(h-1)/2,Math.min(w,h)*.66);c.restore();}}
function grass(c,w,h){c.fillStyle=P.grass;c.fillRect(0,0,w,h);}
function withAssets(pack){
 if(!pack)return module.exports;
 const render={...module.exports};
 render.symbol=(c,type,x,y,size=32)=>{if(!pack.draw(c,'tile.'+type,x-size/2,y-size/2,size,size))symbol(c,type,x,y,size);};
 render.tile=(c,type,x,y,w,h,active=true)=>{c.save();c.globalAlpha*=active?1:.60;const frame=pack.draw(c,'tile.frame',x,y,w,h,{fit:'stretch'});c.restore();if(!frame)tile(c,null,x,y,w,h,active);c.save();c.globalAlpha*=active?1:.60;if(type)render.symbol(c,type,x+w/2,y+(h-1)/2,Math.min(w,h)*.66);c.restore();};
 render.sheep=(c,x,y,size=70,skin='plain',phase=0)=>{if(!pack.draw(c,'character.'+skin,x-size/2,y-size*.53+Math.sin(phase)*2,size,size))sheep(c,x,y,size,skin,phase);};
 render.tomb=(c,x,y,size=60)=>{if(!pack.draw(c,'character.grave',x-size/2,y-size/2,size,size))tomb(c,x,y,size);};
 render.background=(c,key,w,h)=>pack.draw(c,'background.'+key,0,0,w,h,{fit:'cover'});
 return render;
}
module.exports={P,box,ellipse,line,shape,sheep,tomb,symbol,tile,grass,withAssets,background:()=>false};
