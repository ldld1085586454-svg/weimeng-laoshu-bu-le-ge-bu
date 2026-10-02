'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const modulePath=path.join(__dirname,'../src/product/art-assets.js');
const API=fs.existsSync(modulePath)?require(modulePath):{};
const manifest=assets=>({schema:1,assets});
const source='assets/theme/farm.png';
function loader(assets,options={}){
 assert.equal(typeof API.createArtAssets,'function','replaceable art loader missing');
 return API.createArtAssets(manifest(assets),options);
}
function images(){const created=[];return {created,createImage(){
 const image={width:200,height:100,onload:null,onerror:null};created.push(image);return image;
}};}
function context(fail=false){const calls=[],stack=[];return {calls,globalAlpha:.5,
 save(){stack.push(this.globalAlpha);calls.push(['save']);},
 restore(){this.globalAlpha=stack.pop();calls.push(['restore']);},
 drawImage(...args){calls.push(['drawImage',this.globalAlpha,...args]);if(fail)throw Error('DRAW_FAILED');}
};}

test('art assets: the shared manifest is valid and an empty theme keeps vector fallback',async()=>{
 const manifestPath=path.join(__dirname,'../assets/theme/manifest.json');
 assert.ok(fs.existsSync(manifestPath),'default theme manifest missing');
 const theme=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(theme.schema,1);
 assert.ok(theme.assets&&typeof theme.assets==='object'&&!Array.isArray(theme.assets));
 assert.equal(typeof API.createArtAssets,'function','replaceable art loader missing');
 const assets=API.createArtAssets(manifest({}),{createImage(){assert.fail('empty theme does not load an image');}});
 assert.deepEqual(await assets.ready,{loaded:[],failed:[]});assert.equal(assets.get('tile.T00'),null);
 assert.equal(assets.draw(context(),'tile.T00',0,0,20,20),false);assets.dispose();
});

test('art assets: one source preloads once and exposes each logical asset after load',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source},'icon.move':{src:source,rect:{x:20,y:10,w:40,h:30}}},fake);
 assert.equal(fake.created.length,1);assert.equal(assets.get('tile.T00'),null);
 fake.created[0].onload();assert.deepEqual(await assets.ready,{loaded:['tile.T00','icon.move'],failed:[]});
 assert.equal(assets.get('tile.T00').image,fake.created[0]);assert.equal(assets.get('icon.move').image,fake.created[0]);
 assert.equal(assets.get('tile.T00').width,200);assert.equal(assets.get('icon.move').width,40);
 assert.deepEqual(assets.get('icon.move').rect,{x:20,y:10,w:40,h:30});assets.dispose();
});

test('art assets: synchronous source load uses natural image dimensions',async()=>{
 const image={width:10,height:10,naturalWidth:320,naturalHeight:160,
  set src(value){assert.equal(value,source);this.onload();}};
 const assets=loader({'background.home':{src:source}},{createImage:()=>image});
 assert.deepEqual(await assets.ready,{loaded:['background.home'],failed:[]});
 assert.equal(assets.get('background.home').width,320);assert.equal(assets.get('background.home').height,160);assets.dispose();
});

test('art assets: a failed image does not reject other images or reorder results',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source},'tile.T01':{src:'assets/theme/other.webp'},'icon.undo':{src:source}},fake);
 fake.created[1].onload();fake.created[0].onerror(Error('decode failed'));
 assert.deepEqual(await assets.ready,{loaded:['tile.T01'],failed:[{key:'tile.T00',reason:'IMAGE_ERROR'},{key:'icon.undo',reason:'IMAGE_ERROR'}]});
 assert.equal(assets.get('tile.T00'),null);assert.equal(assets.draw(context(),'tile.T00',0,0,10,10),false);assets.dispose();
});

test('art assets: invalid manifests and unknown keys fail without invoking an image factory',async()=>{
 assert.equal(typeof API.createArtAssets,'function','replaceable art loader missing');
 for(const value of [null,{schema:2,assets:{}},{schema:1,assets:[]}]){
  const assets=API.createArtAssets(value,{createImage(){assert.fail('invalid manifest must not load');}});
  assert.deepEqual(await assets.ready,{loaded:[],failed:[{key:'$manifest',reason:'INVALID_MANIFEST'}]});assets.dispose();
 }
 const assets=loader({'tile.block1':{src:source},'tile.T00':{src:' '},'tile.T01':null},{createImage(){assert.fail('invalid entries must not load');}});
 assert.deepEqual(await assets.ready,{loaded:[],failed:[{key:'tile.block1',reason:'UNKNOWN_KEY'},{key:'tile.T00',reason:'INVALID_SOURCE'},{key:'tile.T01',reason:'INVALID_ASSET'}]});assets.dispose();
});

test('art assets: malformed atlas rectangles are rejected before image loading',async()=>{
 const rectangles=[{x:-1,y:0,w:10,h:10},{x:0,y:0,w:0,h:10},{x:0,y:NaN,w:10,h:10},{x:0,y:0,w:10,h:Infinity},{x:0,y:0,w:'10',h:10},null];
 for(const rect of rectangles){
  const assets=loader({'tile.T00':{src:source,rect}},{createImage(){assert.fail('invalid rectangle must not load');}});
  assert.deepEqual(await assets.ready,{loaded:[],failed:[{key:'tile.T00',reason:'INVALID_RECT'}]});assets.dispose();
 }
});

test('art assets: an out-of-bounds atlas entry does not spoil another entry sharing its source',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source,rect:{x:190,y:0,w:20,h:20}},'tile.T01':{src:source,rect:{x:.5,y:1,w:20,h:20}}},fake);
 fake.created[0].onload();assert.deepEqual(await assets.ready,{loaded:['tile.T01'],failed:[{key:'tile.T00',reason:'RECT_OUT_OF_BOUNDS'}]});
 assert.equal(fake.created.length,1);assert.equal(assets.get('tile.T00'),null);assets.dispose();
});

test('art assets: image creation, source assignment, and empty dimensions resolve as failures',async()=>{
 const cases=[{createImage(){throw Error('unavailable');},reason:'CREATE_IMAGE_FAILED'},
  {createImage:()=>null,reason:'CREATE_IMAGE_FAILED'},
  {createImage:()=>({set src(value){throw Error('bad source');}}),reason:'SOURCE_ASSIGN_FAILED'},
  {createImage:()=>({width:0,height:100,set src(value){this.onload();}}),reason:'INVALID_IMAGE_SIZE'}];
 for(const item of cases){const assets=loader({'tile.T00':{src:source}},item);
  assert.deepEqual(await assets.ready,{loaded:[],failed:[{key:'tile.T00',reason:item.reason}]});assets.dispose();}
});

test('art assets: a timeout rejects late callbacks and leaves a stable ready result',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source}},{...fake,timeoutMs:5}),late=fake.created[0].onload;
 const result=await assets.ready;assert.deepEqual(result,{loaded:[],failed:[{key:'tile.T00',reason:'TIMEOUT'}]});
 late();assert.equal(assets.get('tile.T00'),null);assert.deepEqual(await assets.ready,result);
 assert.equal(fake.created[0].onload,null);assert.equal(fake.created[0].onerror,null);assets.dispose();
});

test('art assets: dispose resolves pending work and prevents late cache pollution',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source},'icon.move':{src:source}},fake),late=fake.created[0].onload;
 assets.dispose();assets.dispose();
 assert.deepEqual(await assets.ready,{loaded:[],failed:[{key:'tile.T00',reason:'DISPOSED'},{key:'icon.move',reason:'DISPOSED'}]});
 late();assert.equal(assets.get('tile.T00'),null);assert.equal(assets.draw(context(),'tile.T00',0,0,10,10),false);
 assert.equal(fake.created[0].onload,null);assert.equal(fake.created[0].onerror,null);
});

test('art assets: contain centers undistorted artwork and restores inherited canvas alpha',async()=>{
 const fake=images(),assets=loader({'tile.T00':{src:source}},fake);fake.created[0].onload();await assets.ready;
 const ctx=context();assert.equal(assets.draw(ctx,'tile.T00',10,20,100,100,{alpha:.4}),true);
 assert.deepEqual(ctx.calls,[['save'],['drawImage',.2,fake.created[0],0,0,200,100,10,45,100,50],['restore']]);
 assert.equal(ctx.globalAlpha,.5);assets.dispose();assert.equal(assets.get('tile.T00'),null);
 const calls=ctx.calls.length;assert.equal(assets.draw(ctx,'tile.T00',0,0,10,10),false);assert.equal(ctx.calls.length,calls);
});

test('art assets: cover crops within the selected atlas rectangle',async()=>{
 const fake=images(),assets=loader({'background.board':{src:source,rect:{x:100,y:20,w:80,h:40}}},fake);
 fake.created[0].onload();await assets.ready;const ctx=context();
 assert.equal(assets.draw(ctx,'background.board',10,20,40,80,{fit:'cover'}),true);
 assert.deepEqual(ctx.calls[1],['drawImage',.5,fake.created[0],130,20,20,40,10,20,40,80]);assets.dispose();
});

test('art assets: stretch fills the target and atlas descriptors cannot be mutated',async()=>{
 const fake=images(),assets=loader({'tile.frame':{src:source,rect:{x:4,y:5,w:20,h:10}}},fake);
 fake.created[0].onload();await assets.ready;const entry=assets.get('tile.frame');
 assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.rect));
 assert.throws(()=>{entry.rect.w=999;},TypeError);const ctx=context();
 assert.equal(assets.draw(ctx,'tile.frame',1,2,30,40,{fit:'stretch'}),true);
 assert.deepEqual(ctx.calls[1],['drawImage',.5,fake.created[0],4,5,20,10,1,2,30,40]);assets.dispose();
});

test('art assets: canvas drawing failure still restores state and returns vector fallback',async()=>{
 const fake=images(),assets=loader({'character.plain':{src:source}},fake);fake.created[0].onload();await assets.ready;
 const ctx=context(true);assert.equal(assets.draw(ctx,'character.plain',0,0,30,30,{alpha:.6}),false);
 assert.equal(ctx.globalAlpha,.5);assert.deepEqual(ctx.calls.at(-1),['restore']);assets.dispose();
});

test('art assets: unknown keys and invalid draw options leave the canvas untouched',async()=>{
 const fake=images(),assets=loader({'icon.settings':{src:source}},fake);fake.created[0].onload();await assets.ready;
 const ctx=context();assert.equal(assets.get('unknown'),null);assert.equal(assets.draw(ctx,'unknown',0,0,10,10),false);
 for(const options of [{fit:'other'},{alpha:-1},{alpha:2},{alpha:NaN}])assert.equal(assets.draw(ctx,'icon.settings',0,0,10,10,options),false);
 assert.equal(assets.draw(ctx,'icon.settings',NaN,0,10,10),false);assert.equal(assets.draw(ctx,'icon.settings',0,0,0,10),false);
 assert.deepEqual(ctx.calls,[]);assets.dispose();
});

test('art assets: all declared game keys and inlined PNG or WebP sources share the loader',async()=>{
 const keys=['background.home','background.board','character.plain','character.cap','character.scarf','character.grave','character.home','character.win',
  'honor.first','honor.king','honor.fast','decoration.laurel','decoration.progress','button.primary','tile.frame',
  ...Array.from({length:15},(_,i)=>'tile.T'+String(i).padStart(2,'0')),
  ...['move','undo','shuffle','revive','rank','friends','topic','wardrobe','profile','club','settings','bullet','locate','back','close'].map(id=>'icon.'+id)];
 const fake=images(),assets=loader(Object.fromEntries(keys.map((key,i)=>[key,{src:i%2?'data:image/png;base64,fake':'data:image/webp;base64,fake'}])),fake);
 assert.equal(fake.created.length,2);fake.created.forEach(image=>image.onload());
 assert.deepEqual(await assets.ready,{loaded:keys,failed:[]});assets.dispose();
});

test('art assets: approved screen artwork and existing character keys retain distinct shared atlas slices',async()=>{
 const keys=['character.home','character.win','honor.first','honor.king','honor.fast','decoration.laurel',
  'icon.bullet','icon.locate','icon.back','icon.close','character.plain','character.cap','character.scarf','character.grave'];
 const definitions=Object.fromEntries(keys.map((key,i)=>[key,{src:source,rect:{x:i%7*24,y:Math.floor(i/7)*48,w:20,h:40}}]));
 const fake=images(),assets=loader(definitions,fake);assert.equal(fake.created.length,1);fake.created[0].onload();
 assert.deepEqual(await assets.ready,{loaded:keys,failed:[]});
 for(const key of keys){
  const entry=assets.get(key);assert.equal(entry.image,fake.created[0]);assert.deepEqual(entry.rect,definitions[key].rect);
  assert.equal(entry.width,20);assert.equal(entry.height,40);
  const ctx=context();assert.equal(assets.draw(ctx,key,10,20,40,80),true);
  const rect=definitions[key].rect;assert.deepEqual(ctx.calls[1],['drawImage',.5,fake.created[0],rect.x,rect.y,rect.w,rect.h,10,20,40,80]);
 }
 assets.dispose();
});

test('art assets: optional font metadata does not become image loading work',async()=>{
 const fake=images(),theme={schema:1,assets:{'character.plain':{src:source}},fonts:{heading:{family:'ApprovedTheme',src:'assets/theme/fonts/heading.woff2'}}};
 const assets=API.createArtAssets(theme,fake);assert.equal(fake.created.length,1);fake.created[0].onload();
 assert.deepEqual(await assets.ready,{loaded:['character.plain'],failed:[]});assert.equal(assets.get('fonts'),null);assets.dispose();
});

test('art assets: progress decoration and primary button use separate slices from a shared component atlas',async()=>{
 const definitions={
  'tile.frame':{src:source,rect:{x:0,y:0,w:20,h:20}},
  'decoration.progress':{src:source,rect:{x:20,y:10,w:160,h:20}},
  'button.primary':{src:source,rect:{x:30,y:50,w:140,h:40}},
 };
 const fake=images(),assets=loader(definitions,fake);assert.equal(fake.created.length,1);fake.created[0].onload();
 assert.deepEqual(await assets.ready,{loaded:Object.keys(definitions),failed:[]});
 const progress=assets.get('decoration.progress'),button=assets.get('button.primary');
 assert.equal(progress.image,button.image);assert.deepEqual(progress.rect,definitions['decoration.progress'].rect);
 assert.deepEqual(button.rect,definitions['button.primary'].rect);
 const ctx=context();assert.equal(assets.draw(ctx,'decoration.progress',5,6,160,40),true);
 assert.deepEqual(ctx.calls[1],['drawImage',.5,fake.created[0],20,10,160,20,5,16,160,20]);
 assert.equal(assets.draw(ctx,'button.primary',10,30,280,60,{fit:'stretch',alpha:.6}),true);
 assert.deepEqual(ctx.calls[4],['drawImage',.3,fake.created[0],30,50,140,40,10,30,280,60]);
 assert.equal(ctx.globalAlpha,.5);assets.dispose();
});
