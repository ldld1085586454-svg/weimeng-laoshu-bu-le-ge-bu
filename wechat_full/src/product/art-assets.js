'use strict';
// Drop-in path contract. Current v0.12 still draws development vector art in ui/product/art.js.
// Use this module when replacing those drawings with bitmap assets.
const M=require('../../assets/art/asset-manifest.json');
function cardPath(id){return `assets/art/cards/block_${Number(id)}.png`;}
function path(key){
 const parts=String(key).split('.'); let v=M;
 for(const p of parts)v=v?.[p];
 return typeof v==='string'?`assets/art/${v}`:null;
}
module.exports={manifest:M,cardPath,path};
