'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Art=require('../ui/product/art');
function canvas(){const paths=[];const ctx=new Proxy({globalAlpha:1,beginPath:()=>paths.push('path')},{get:(o,k)=>k in o?o[k]:()=>{}});return {ctx,paths};}
test('art renderer: an available frame and symbol replace the complete old tile drawing',()=>{const {ctx,paths}=canvas(),keys=[],render=Art.withAssets({draw:(c,key)=>{keys.push(key);return true;}});render.tile(ctx,'T00',0,0,48,48);assert.deepEqual(keys,['tile.frame','tile.T00']);assert.equal(paths.length,0,'old plate or shadow must not survive a complete replacement');});
test('art renderer: independently unavailable plate and symbol keep the current drawing',()=>{const {ctx,paths}=canvas(),render=Art.withAssets({draw:()=>false});render.tile(ctx,'T00',0,0,48,48);assert.ok(paths.length>=3,'missing images must not make a blank tile');});
test('art renderer: character and grave images replace their respective drawings',()=>{const {ctx,paths}=canvas(),keys=[],render=Art.withAssets({draw:(c,key)=>{keys.push(key);return true;}});render.sheep(ctx,80,80,70,'cap');render.tomb(ctx,80,80,60);assert.deepEqual(keys,['character.cap','character.grave']);assert.equal(paths.length,0);});
