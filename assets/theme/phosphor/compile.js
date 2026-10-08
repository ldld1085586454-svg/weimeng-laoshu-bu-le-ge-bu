'use strict';
// Offline, dependency-free compiler for the checked-in Phosphor SVG paths.
// Reproduce: node assets/theme/phosphor/compile.js; verify: append --check.
const fs=require('node:fs'),path=require('node:path');
const dir=__dirname,target=path.resolve(dir,'../../../ui/product/icons.js');
const sourceMap=JSON.parse(fs.readFileSync(path.join(dir,'icon-map.json'),'utf8'));
const count={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
const round=n=>Math.abs(n)<.0000005?0:Number(n.toFixed(6));
function arc(x1,y1,rx,ry,phi,large,sweep,x2,y2){
 rx=Math.abs(rx);ry=Math.abs(ry);
 if(x1===x2&&y1===y2)return [];
 if(!rx||!ry)return [['L',x2,y2]];
 const rotation=phi*Math.PI/180,cs=Math.cos(rotation),sn=Math.sin(rotation),dx=(x1-x2)/2,dy=(y1-y2)/2;
 const xp=cs*dx+sn*dy,yp=-sn*dx+cs*dy,scale=xp*xp/(rx*rx)+yp*yp/(ry*ry);
 if(scale>1){rx*=Math.sqrt(scale);ry*=Math.sqrt(scale);}
 const den=rx*rx*yp*yp+ry*ry*xp*xp;
 const f=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-den)/den));
 const cxp=f*rx*yp/ry,cyp=-f*ry*xp/rx,cx=cs*cxp-sn*cyp+(x1+x2)/2,cy=sn*cxp+cs*cyp+(y1+y2)/2;
 const ux=(xp-cxp)/rx,uy=(yp-cyp)/ry,vx=(-xp-cxp)/rx,vy=(-yp-cyp)/ry;
 let theta=Math.atan2(uy,ux),delta=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
 if(!sweep&&delta>0)delta-=Math.PI*2;else if(sweep&&delta<0)delta+=Math.PI*2;
 const steps=Math.ceil(Math.abs(delta)/(Math.PI/2)),step=delta/steps,commands=[];
 const at=(x,y)=>[cx+rx*cs*x-ry*sn*y,cy+rx*sn*x+ry*cs*y];
 for(let i=0;i<steps;i++){
  const end=theta+step,alpha=4/3*Math.tan(step/4),a=at(Math.cos(theta)-alpha*Math.sin(theta),Math.sin(theta)+alpha*Math.cos(theta)),b=at(Math.cos(end)+alpha*Math.sin(end),Math.sin(end)-alpha*Math.cos(end)),p=i===steps-1?[x2,y2]:at(Math.cos(end),Math.sin(end));
  commands.push(['C',...a,...b,...p]);theta=end;
 }
 return commands;
}
function compile(d){
 const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
 const out=[];let i=0,cmd=null,x=0,y=0,sx=0,sy=0,previous='',cubic=null,quad=null;
 while(i<tokens.length){
  if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];
  if(!cmd||!(cmd.toUpperCase() in count))throw Error('Unsupported SVG command '+cmd);
  const kind=cmd.toUpperCase(),relative=cmd!==kind,n=count[kind];
  if(n===0){out.push(['Z']);x=sx;y=sy;previous='Z';cmd=null;cubic=null;quad=null;continue;}
  if(i+n>tokens.length)throw Error('Truncated SVG command '+cmd);
  const p=tokens.slice(i,i+n).map(Number);i+=n;if(!p.every(Number.isFinite))throw Error('Invalid SVG number');
  const ax=v=>v+(relative?x:0),ay=v=>v+(relative?y:0);
  let endX=x,endY=y;
  if(kind==='M'||kind==='L'||kind==='T'){
   endX=ax(p[0]);endY=ay(p[1]);
   if(kind==='T'){const q=previous==='Q'||previous==='T'?[2*x-quad[0],2*y-quad[1]]:[x,y];out.push(['Q',...q,endX,endY]);quad=q;}
   else{out.push([kind,endX,endY]);if(kind==='M'){sx=endX;sy=endY;cmd=relative?'l':'L';}}
  }else if(kind==='H'){endX=ax(p[0]);out.push(['L',endX,y]);}
  else if(kind==='V'){endY=ay(p[0]);out.push(['L',x,endY]);}
  else if(kind==='C'){endX=ax(p[4]);endY=ay(p[5]);cubic=[ax(p[2]),ay(p[3])];out.push(['C',ax(p[0]),ay(p[1]),...cubic,endX,endY]);}
  else if(kind==='S'){const first=previous==='C'||previous==='S'?[2*x-cubic[0],2*y-cubic[1]]:[x,y];cubic=[ax(p[0]),ay(p[1])];endX=ax(p[2]);endY=ay(p[3]);out.push(['C',...first,...cubic,endX,endY]);}
  else if(kind==='Q'){quad=[ax(p[0]),ay(p[1])];endX=ax(p[2]);endY=ay(p[3]);out.push(['Q',...quad,endX,endY]);}
  else if(kind==='A'){endX=ax(p[5]);endY=ay(p[6]);out.push(...arc(x,y,p[0],p[1],p[2],p[3],p[4],endX,endY));}
  x=endX;y=endY;previous=kind;
 }
 return out.map(command=>[command[0],...command.slice(1).map(round)]);
}
const data={};
for(const [name,src] of Object.entries(sourceMap)){
 const svg=fs.readFileSync(path.join(dir,path.basename(src)),'utf8');
 if(!svg.includes('viewBox="0 0 256 256"'))throw Error('Unexpected icon viewbox');
 const paths=[...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?\s*>/g)].map(match=>compile(match[1]));
 if(!paths.length)throw Error('No paths in '+src);data[name]=paths;
}
const region='// BEGIN GENERATED PHOSPHOR PATHS\nconst PATHS='+JSON.stringify(data)+';\n// END GENERATED PHOSPHOR PATHS';
const existing=fs.readFileSync(target,'utf8'),output=existing.replace(/\/\/ BEGIN GENERATED PHOSPHOR PATHS[\s\S]*?\/\/ END GENERATED PHOSPHOR PATHS/,region);
if(output===existing&&process.argv.includes('--check')){console.log('Phosphor Canvas commands match all 20 local SVG sources.');}
else if(process.argv.includes('--check')){console.error('Phosphor Canvas commands are stale. Run '+path.relative(process.cwd(),__filename));process.exitCode=1;}
else fs.writeFileSync(target,output);
