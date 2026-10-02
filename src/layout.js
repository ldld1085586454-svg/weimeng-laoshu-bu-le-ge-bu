'use strict';
const {validateLayoutFields}=require('./schema');

/** Positive-area overlap: shadows and edge contact do not block. */
function overlaps(a, b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

function validateLayout(layout) {
  validateLayoutFields(layout);
  for(let i=0;i<layout.cells.length;i++) for(let j=i+1;j<layout.cells.length;j++) {
    const a=layout.cells[i],b=layout.cells[j]; if(!overlaps(a.rect,b.rect)) continue;
    if(a.zone!==b.zone) throw new TypeError('MIXED_ZONE_INTERSECTION');
    if(a.zone==='board'&&a.z===b.z) throw new TypeError('AMBIGUOUS_SAME_LAYER_OVERLAP');
    if(a.zone==='side'&&a.stackId!==b.stackId) throw new TypeError('STACK_INTERSECTION');
  }
  return true;
}

function buildGraph(layout) {
  validateLayout(layout);
  const n=layout.cells.length,parents=Array.from({length:n},()=>[]),children=Array.from({length:n},()=>[]);
  function edge(a,b) {parents[b].push(a); children[a].push(b);}
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) {
    const a=layout.cells[i],b=layout.cells[j];
    if(a.zone==='board'&&b.zone==='board'&&overlaps(a.rect,b.rect)) {
      if(a.z>b.z) edge(i,j); else edge(j,i);
    } else if(a.zone==='side'&&b.zone==='side'&&a.stackId===b.stackId) {
      if(a.position===b.position-1) edge(i,j);
      if(b.position===a.position-1) edge(j,i);
    }
  }
  return {parents,children};
}

/** Nonhistorical stress layout. Never label these fixtures original 2022 maps. */
function makeFixtureLayout(n=270) {
  if(!Number.isSafeInteger(n)||n<3||n%3||n>3000) throw new RangeError('N must be 3..3000 and divisible by 3');
  const depth=Math.floor(n/18), main=n-2*depth, cells=[];
  for(let i=0;i<main;i++) {
    const z=Math.floor(i/40),p=i%40,off=(z%2)*50;
    cells.push({id:`m${String(i).padStart(4,'0')}`,zone:'board',z,
      rect:{x:(p%8)*100+off,y:Math.floor(p/8)*100+off,w:96,h:96}});
  }
  for(const [k,stackId] of ['left','right'].entries()) for(let p=0;p<depth;p++)
    cells.push({id:`${stackId}-${String(p).padStart(3,'0')}`,zone:'side',stackId,position:p,
      rect:{x:k*Math.max(500,depth*4+196)+p*4,y:680,w:96,h:96}});
  return {id:`synthetic-layer-stack-${n}`,origin:'SYNTHETIC_NOT_HISTORICAL',cells};
}
module.exports={overlaps,validateLayout,buildGraph,makeFixtureLayout};
