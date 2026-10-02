'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {deflateSync}=require('node:zlib');
const {createPointerInput}=require('../ui/product/input');
const {createArtAssets}=require('../src/product/art-assets');
const root=path.resolve(__dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfooAAAAASUVORK5CYII=','base64');
// Synthetic one-pixel white image fixtures, generated with Pillow for header coverage.
const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==','base64');
const webp=Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=','base64');

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-theme-build-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const entry of ['src','ui','examples','templates/wechat-full'])fs.cpSync(path.join(root,entry),path.join(dir,entry),{recursive:true});
 for(const entry of ['tools','docs/product'])fs.mkdirSync(path.join(dir,entry),{recursive:true});
 fs.copyFileSync(path.join(root,'tools/build-full.js'),path.join(dir,'tools/build-full.js'));
 return dir;
}
function write(dir,file,bytes){const dest=path.join(dir,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
function manifest(dir,value){write(dir,'assets/theme/manifest.json',JSON.stringify(value));}
function run(dir){return spawnSync(process.execPath,['tools/build-full.js'],{cwd:dir,encoding:'utf8'});}
function build(dir){const result=run(dir);assert.equal(result.status,0,result.stderr||result.error?.message);return result;}
function html(dir){return fs.readFileSync(path.join(dir,'全模块游戏_双击打开.html'),'utf8');}
function browserManifest(dir){
 const source=html(dir),start=source.search(/const art(?:SourceData|Manifest)=/),end=source.indexOf('const artAssets=',start);
 assert.ok(start>=0&&end>start,'browser artwork manifest is missing');
 // Execute the emitted hydration, so source interning is exercised by every consumer test.
 return JSON.parse(vm.runInNewContext(source.slice(start,end)+'JSON.stringify(artManifest);'));
}
function nativeManifest(dir){
 const file=path.join(dir,'wechat_full/data/art-manifest.js');
 assert.ok(fs.existsSync(file),'native artwork manifest is missing');
 delete require.cache[require.resolve(file)];
 return require(file);
}

test('theme build: missing manifest keeps an empty optional theme and bundles shared modules',t=>{
 const dir=fixture(t);
 build(dir);
 assert.deepEqual(browserManifest(dir),{schema:1,assets:{}});
 assert.deepEqual(nativeManifest(dir),{schema:1,assets:{}});
 for(const file of ['src/product/art-assets.js','ui/product/input.js','ui/product/theme.js']){
  assert.deepEqual(fs.readFileSync(path.join(dir,'wechat_full',file)),fs.readFileSync(path.join(dir,file)),file);
 }
 assert.equal(html(dir).includes('src/solver'),false);
 assert.equal(html(dir).includes('"witness":'),false);
});

test('theme build: referenced PNG is inlined for browser and copied for native without changing developer configuration',t=>{
 const dir=fixture(t),src='assets/theme/images/approved.png';
 write(dir,src,png);
 write(dir,'assets/theme/unreferenced.png',png);
 const theme={schema:1,label:'supplied </script> artwork',assets:{'background.home':{src},'tile.T00':{src,rect:{x:0,y:0,w:1,h:1}}}};
 manifest(dir,theme);
 write(dir,'wechat_full/project.config.json',JSON.stringify({appid:'wx-synthetic-theme-project',setting:{urlCheck:false,custom:true}}));
 const preview="module.exports={mode:'sdk_preview',allowSharePreview:true,allowAdPreview:true,adUnitId:'synthetic-test-only'};\n";
 write(dir,'wechat_full/preview-config.js',preview);
 build(dir);
 build(dir);
 const browser=browserManifest(dir);
 assert.equal(browser.assets['background.home'].src,'data:image/png;base64,'+png.toString('base64'));
 assert.equal(browser.assets['tile.T00'].src,browser.assets['background.home'].src);
 assert.deepEqual(browser.assets['tile.T00'].rect,theme.assets['tile.T00'].rect);
 assert.equal(browser.label,theme.label);
 assert.equal(html(dir).includes(theme.label),false,'manifest metadata must not close the inline script');
 assert.deepEqual(nativeManifest(dir),theme);
 assert.deepEqual(fs.readFileSync(path.join(dir,'wechat_full',src)),png);
 assert.equal(fs.existsSync(path.join(dir,'wechat_full/assets/theme/unreferenced.png')),false);
 const project=JSON.parse(fs.readFileSync(path.join(dir,'wechat_full/project.config.json'),'utf8'));
 assert.equal(project.appid,'wx-synthetic-theme-project');
 assert.deepEqual(project.setting,{es6:true,minified:false,urlCheck:false,custom:true});
 assert.equal(project.compileType,'game');assert.equal(project.miniprogramRoot,'./');
 assert.equal(fs.readFileSync(path.join(dir,'wechat_full/preview-config.js'),'utf8'),preview);
});

function atlasPNG(){
 // A complete deterministic RGB PNG, large enough to expose repeated-source packing.
 const width=128,height=128,rows=Buffer.alloc(height*(1+width*3));let seed=123456789;
 for(let y=0;y<height;y++)for(let x=0;x<width*3;x++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;rows[y*(1+width*3)+1+x]=seed&255;
 }
 function chunk(name,data){
  const tag=Buffer.from(name),body=Buffer.concat([tag,data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length,0);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([png.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}

test('theme build: many atlas keys pack one image source and remain available through the real runtime',async t=>{
 const dir=fixture(t),src='assets/theme/tiles.png',bytes=atlasPNG(),keys=Array.from({length:15},(_,i)=>'tile.T'+String(i).padStart(2,'0'));
 write(dir,src,bytes);
 const assets=Object.fromEntries(keys.map((key,i)=>[key,{src,rect:{x:i*8,y:0,w:8,h:8}}]));
 manifest(dir,{schema:1,assets:{[keys[0]]:assets[keys[0]]}});build(dir);
 const singleSize=Buffer.byteLength(html(dir));
 manifest(dir,{schema:1,assets});build(dir);
 const page=html(dir),encoded=bytes.toString('base64');
 assert.equal(page.split(encoded).length-1,1,'the complete PNG payload must occur once regardless of atlas key count');
 assert.ok(Buffer.byteLength(page)<singleSize+4096,'additional atlas keys must add only manifest metadata, not another image payload');
 const browser=browserManifest(dir),native=nativeManifest(dir),images=[];
 const artwork=createArtAssets(browser,{createImage:()=>{
  const image={width:128,height:128,set src(value){this.assignedSrc=value;this.onload();}};images.push(image);return image;
 }});
 t.after(()=>artwork.dispose());
 const ready=await artwork.ready;
 assert.deepEqual(ready,{loaded:keys,failed:[]});
 assert.equal(images.length,1,'the hydrated browser manifest must still allow runtime image deduplication');
 assert.equal(images[0].assignedSrc,'data:image/png;base64,'+encoded);
 for(const key of keys){
  assert.equal(artwork.get(key).image,images[0]);
  assert.deepEqual(artwork.get(key).rect,assets[key].rect);
  assert.equal(native.assets[key].src,src,'native source paths must stay local');
 }
 assert.deepEqual(fs.readFileSync(path.join(dir,'wechat_full',src)),bytes);
});

test('theme build: empty manifest removes stale derived theme images and keeps vector fallback',t=>{
 const dir=fixture(t),src='assets/theme/old.png';
 write(dir,src,png);
 manifest(dir,{schema:1,assets:{'background.home':{src}}});
 build(dir);
 assert.equal(fs.existsSync(path.join(dir,'wechat_full',src)),true);
 manifest(dir,{schema:1,assets:{}});
 build(dir);
 assert.deepEqual(browserManifest(dir),{schema:1,assets:{}});
 assert.deepEqual(nativeManifest(dir),{schema:1,assets:{}});
 assert.equal(fs.existsSync(path.join(dir,'wechat_full',src)),false);
});

test('theme build: JPEG and WebP formats retain their MIME type and native bytes',async t=>{
 for(const [extension,bytes,mime] of [['jpg',jpeg,'image/jpeg'],['jpeg',jpeg,'image/jpeg'],['webp',webp,'image/webp']]){
  await t.test(extension,st=>{
   const dir=fixture(st),src='assets/theme/white.'+extension;
   write(dir,src,bytes);manifest(dir,{schema:1,assets:{'tile.T00':{src}}});build(dir);
   assert.equal(browserManifest(dir).assets['tile.T00'].src,'data:'+mime+';base64,'+bytes.toString('base64'));
   assert.equal(nativeManifest(dir).assets['tile.T00'].src,src);
   assert.deepEqual(fs.readFileSync(path.join(dir,'wechat_full',src)),bytes);
  });
 }
});

test('theme build: malformed manifest schemas and asset maps are rejected',async t=>{
 for(const value of [null,{schema:2,assets:{}},{schema:1,assets:[]},{schema:1,assets:null},{schema:1},{schema:1,assets:{'tile.T00':null}}]){
  await t.test(JSON.stringify(value),st=>{
   const dir=fixture(st);manifest(dir,value);
   const result=run(dir);
   assert.notEqual(result.status,0,'invalid theme was accepted');
   assert.match(result.stderr,/INVALID_THEME_/);
  });
 }
});

test('theme build: escaped, absolute and non-image source paths are rejected before publishing outputs',async t=>{
 for(const src of ['assets/theme/../outside.png','assets/theme/folder/../../outside.png','/tmp/outside.png','C:/outside.png','assets\\theme\\outside.png','assets/art/cards/block_1.png','Assets/theme/source.png','assets/theme/source.svg','assets/theme/source.png?query','assets/theme/./source.png']){
  await t.test(src,st=>{
   const dir=fixture(st);manifest(dir,{schema:1,assets:{'tile.T00':{src}}});
   const result=run(dir);
   assert.notEqual(result.status,0,'unsafe theme path was accepted');
   assert.match(result.stderr,/INVALID_THEME_SOURCE/);
   assert.equal(fs.existsSync(path.join(dir,'全模块游戏_双击打开.html')),false);
  });
 }
});

test('theme build: symlinks cannot escape the theme directory or project',async t=>{
 for(const kind of ['file','directory','theme-root']){
  await t.test(kind,st=>{
   const dir=fixture(st),outside=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-theme-outside-'));
   st.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
   write(outside,'valid.png',png);
   let src='assets/theme/linked.png';
   if(kind==='theme-root'){
    manifest(outside,{schema:1,assets:{'tile.T00':{src:'assets/theme/valid.png'}}});
    fs.renameSync(path.join(outside,'assets/theme/manifest.json'),path.join(outside,'manifest.json'));
    fs.mkdirSync(path.join(dir,'assets'),{recursive:true});
    fs.symlinkSync(outside,path.join(dir,'assets/theme'),'dir');
   }else{
    fs.mkdirSync(path.join(dir,'assets/theme'),{recursive:true});
    if(kind==='file')fs.symlinkSync(path.join(outside,'valid.png'),path.join(dir,src));
    else{src='assets/theme/linked/valid.png';fs.symlinkSync(outside,path.join(dir,'assets/theme/linked'),'dir');}
    manifest(dir,{schema:1,assets:{'tile.T00':{src}}});
   }
   const result=run(dir);
   assert.notEqual(result.status,0,'escaping theme symlink was accepted');
   assert.match(result.stderr,/THEME_PATH_ESCAPE/);
  });
 }
});

test('theme build: textual placeholder PNG and mismatched image header fail the build',async t=>{
 for(const [src,bytes] of [['assets/theme/placeholder.png',Buffer.from('development placeholder, not an image')],['assets/theme/wrong.jpg',png]]){
  await t.test(src,st=>{
   const dir=fixture(st);write(dir,src,bytes);manifest(dir,{schema:1,assets:{'tile.T00':{src}}});
   const result=run(dir);
   assert.notEqual(result.status,0,'invalid image content was accepted');
   assert.match(result.stderr,/INVALID_THEME_IMAGE/);
   assert.equal(fs.existsSync(path.join(dir,'全模块游戏_双击打开.html')),false);
  });
 }
});

function browserInput(dir,{fontApi,timers=[]}={}){
 const listeners={},windowListeners={},captures=new Set(),activated=[];
 let input;
 const region={id:'move',enabled:true,x:0,y:0,w:40,h:40};
 input=createPointerInput({hitTest:(x,y)=>x>=0&&x<40&&y>=0&&y<40?region:null,activate:id=>activated.push(id)});
 const app={pointerDown:input.down,pointerMove:input.move,pointerUp:input.up,pointerCancel:input.cancel,
  tap:(x,y)=>{input.down(x,y);return input.up(x,y);},resize:input.reset,setVisible:()=>{},frame:()=>{},getHitRegions:()=>[],exportDiagnostic:()=>null};
 const cv={getBoundingClientRect:()=>({left:100,top:200,width:390,height:844}),addEventListener:(name,fn)=>{listeners[name]=fn;},
  setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
 const script=html(dir).match(/<script>([\s\S]*)<\/script>/)[1];
 const start=script.indexOf('try{\n window.game=');
 assert.ok(start>=0,'browser entry is missing');
 const fatal={style:{},textContent:''};
 let appOptions;
 const sandbox={cv,bounds:cv.getBoundingClientRect(),deals:[],storage:null,client:null,audio:{},artAssets:{},artManifest:browserManifest(dir),device:'theme-test-device',devicePixelRatio:1,
  load:id=>{assert.equal(id,'ui/product/app');return {createFullApp:(_c,_d,_w,_h,_r,options)=>{appOptions=options;return app;}};},
  matchMedia:()=>({matches:false}),requestAnimationFrame:()=>{},
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},
  document:{fonts:fontApi,hidden:false,addEventListener:()=>{},getElementById:()=>fatal},
  window:{addEventListener:(name,fn)=>{windowListeners[name]=fn;}}};
 Object.defineProperty(sandbox.window,'game',{get:()=>sandbox.game,set:value=>{sandbox.game=value;}});
 const fontStart=script.indexOf('function startGame(');
 vm.runInNewContext(script.slice(fontStart>=0?fontStart:start),sandbox);
 assert.equal(fatal.textContent,'','browser bootstrap: '+fatal.textContent);
 sandbox.game=sandbox.window.game;
 return {input,listeners,windowListeners,captures,activated,options:()=>appOptions,game:()=>sandbox.game};
}
const pointer=(pointerId=7,x=110,y=210,isPrimary=true)=>({pointerId,clientX:x,clientY:y,isPrimary,button:0});

test('theme build: browser pointer capture defers action to a matching release and rejects multi-touch',t=>{
 const dir=fixture(t);build(dir);
 const {input,listeners,captures,activated}=browserInput(dir);
 listeners.pointerdown(pointer());
 assert.equal(input.pressed(),'move');
 assert.deepEqual(activated,[]);
 assert.equal(captures.has(7),true);
 listeners.pointermove(pointer(7,170));
 assert.equal(input.pressed(),null);
 listeners.pointermove(pointer());
 listeners.pointerup(pointer());
 assert.deepEqual(activated,['move']);
 listeners.pointerdown(pointer());
 listeners.pointerdown(pointer(8,110,210,false));
 assert.equal(input.pressed(),null);
 listeners.pointerup(pointer());
 listeners.pointerup(pointer(8,110,210,false));
 assert.deepEqual(activated,['move']);
});

test('theme build: browser blur, cancellation and lost capture discard a held gesture',t=>{
 const dir=fixture(t);build(dir);
 const {input,listeners,windowListeners,activated}=browserInput(dir);
 for(const event of ['pointercancel','lostpointercapture','blur']){
  listeners.pointerdown(pointer());
  assert.equal(input.pressed(),'move');
  if(event==='blur')windowListeners.blur();else listeners[event](pointer());
  listeners.pointerup(pointer());
  assert.equal(input.pressed(),null);
 }
 assert.deepEqual(activated,[]);
});

test('theme build: native artwork uses wx Image, then Canvas Image, and safely falls back when unavailable',async t=>{
 for(const capability of ['wx','canvas','unavailable']){
  await t.test(capability,async st=>{
   let artAssets;
   st.after(()=>artAssets?.dispose());
   const made=[],src='assets/theme/white.png';
   const factory=kind=>()=>{made.push(kind);return {width:1,height:1,set src(value){assert.equal(value,src);this.onload();}};};
   const canvas={createImage:capability!=='unavailable'?factory('canvas'):undefined};
   const wx={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:1}),
    createImage:capability==='wx'?factory('wx'):undefined,getStorageSync:()=>'',setStorageSync:()=>{},onTouchStart:()=>{},onHide:()=>{},onShow:()=>{}};
   const modules={
    './ui/product/app':{createFullApp:(_canvas,_deals,_w,_h,_ratio,options)=>{artAssets=options.artAssets;return {frame:()=>{}};}},
    './src/product/wechat':{createPlatform:()=>null},'./src/integration/wechat-provider':{},
    './src/product/art-assets':require('../src/product/art-assets'),
    './data/deals':[], './preview-config':{mode:'simulation'},
    './data/art-manifest':{schema:1,assets:{'background.home':{src}}}
   };
   vm.runInNewContext(fs.readFileSync(path.join(root,'templates/wechat-full/game.js'),'utf8'),
    {wx,require:id=>{assert.ok(Object.hasOwn(modules,id),id);return modules[id];},requestAnimationFrame:()=>{}});
   assert.ok(artAssets,'artwork was not passed to the app');
   const result=await artAssets.ready;
   if(capability==='unavailable'){
    assert.deepEqual(result,{loaded:[],failed:[{key:'background.home',reason:'CREATE_IMAGE_FAILED'}]});
    assert.equal(artAssets.get('background.home'),null);
   }else{
    assert.deepEqual(made,[capability]);
    assert.deepEqual(result,{loaded:['background.home'],failed:[]});
   }
  });
 }
});

// Header-only packing fixtures; browser/native font decoding is tested through
// their capability contract, rather than claiming these bytes are a usable font.
const ttf=Buffer.alloc(32);ttf.writeUInt32BE(0x00010000);ttf.writeUInt16BE(1,4);
const woff2=Buffer.alloc(56);woff2.write('wOF2');woff2.writeUInt32BE(0x00010000,4);woff2.writeUInt32BE(56,8);woff2.writeUInt16BE(1,12);woff2.writeUInt32BE(32,16);woff2.writeUInt32BE(3,20);
function fontFixture(t,extension='ttf'){
 const dir=fixture(t),src='assets/theme/fonts/heading.'+extension;
 write(dir,src,extension==='ttf'?ttf:woff2);
 write(dir,'assets/theme/fonts/OFL.txt','Synthetic test license text; production font uses its complete OFL.');
 manifest(dir,{schema:1,assets:{},fonts:{heading:{src,family:'ZCOOL KuaiLe'}}});
 return {dir,src};
}
test('theme fonts: TTF and WOFF2 inline with matching MIME and retain native font and license files',async t=>{
 for(const extension of ['ttf','woff2'])await t.test(extension,st=>{
  const {dir,src}=fontFixture(st,extension);build(dir);
  const bytes=extension==='ttf'?ttf:woff2;
  assert.equal(browserManifest(dir).fonts.heading.src,'data:font/'+extension+';base64,'+bytes.toString('base64'));
  assert.equal(nativeManifest(dir).fonts.heading.src,src);
  assert.deepEqual(fs.readFileSync(path.join(dir,'wechat_full',src)),bytes);
  assert.equal(fs.existsSync(path.join(dir,'wechat_full/assets/theme/fonts/OFL.txt')),true);
  assert.ok(html(dir).includes('@font-face'));
 });
});
test('theme fonts: invalid paths, headers, formats and font maps fail before output',async t=>{
 for(const [src,bytes,fonts] of [
  ['assets/theme/../font.ttf',ttf],['/tmp/font.ttf',ttf],['assets\\theme\\font.ttf',ttf],
  ['assets/theme/font.otf',ttf],['assets/theme/font.ttf',Buffer.from('text placeholder')],
  ['assets/theme/font.woff2',ttf],['assets/theme/font.ttf',ttf,[]]])await t.test(src+String(fonts),st=>{
   const dir=fixture(st);if(src.startsWith('assets/theme/')&&!src.includes('..'))write(dir,src,bytes);
   manifest(dir,{schema:1,assets:{},fonts:fonts||{heading:{src,family:'ZCOOL KuaiLe'}}});
   const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/INVALID_THEME_FONT/);
   assert.equal(fs.existsSync(path.join(dir,'全模块游戏_双击打开.html')),false);
  });
});
test('theme fonts: browser waits for successful preload before creating its first app',async t=>{
 const {dir}=fontFixture(t);build(dir);
 let resolve;const pending=new Promise(done=>{resolve=done;});const queries=[];
 const state=browserInput(dir,{fontApi:{load:query=>{queries.push(query);return pending;}}});
 assert.equal(state.game(),undefined);assert.deepEqual(queries,['20px "ZCOOL KuaiLe"']);
 resolve([{}]);await new Promise(done=>setImmediate(done));
 assert.equal(state.options().headingFont,'ZCOOL KuaiLe');
});
test('theme fonts: unsupported API, rejection and timeout start with the existing font',async t=>{
 const {dir}=fontFixture(t);build(dir);
 for(const mode of ['unsupported','rejected','timeout']){
  const timers=[];
  const fontApi=mode==='unsupported'?undefined:{load:()=>mode==='rejected'?Promise.reject(Error('failed')):new Promise(()=>{})};
  const state=browserInput(dir,{fontApi,timers});
  if(mode==='timeout'){assert.ok(timers[0].ms>0&&timers[0].ms<=5000);timers[0].fn();}
  await new Promise(done=>setImmediate(done));
  assert.equal(state.options().headingFont,null);
 }
});
test('theme fonts: font symlinks cannot escape the theme directory',t=>{
 const dir=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-font-outside-'));
 t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 write(outside,'font.ttf',ttf);fs.mkdirSync(path.join(dir,'assets/theme/fonts'),{recursive:true});
 fs.symlinkSync(path.join(outside,'font.ttf'),path.join(dir,'assets/theme/fonts/font.ttf'));
 manifest(dir,{schema:1,assets:{},fonts:{heading:{src:'assets/theme/fonts/font.ttf',family:'ZCOOL KuaiLe'}}});
 const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/THEME_PATH_ESCAPE/);
});
test('theme fonts: native font capability forwards the returned family and safely falls back',()=>{
 for(const outcome of ['loaded','empty','throw','unsupported']){
  let options;
  const src='assets/theme/fonts/heading.ttf';
  const wx={createCanvas:()=>({}),getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:1}),
   getStorageSync:()=>'',setStorageSync:()=>{},onTouchStart:()=>{},onHide:()=>{},onShow:()=>{}};
  if(outcome!=='unsupported')wx.loadFont=file=>{assert.equal(file,src);if(outcome==='throw')throw Error('font unavailable');return outcome==='loaded'?'native-font-family':'';};
  const modules={
   './ui/product/app':{createFullApp:(_c,_d,_w,_h,_r,value)=>{options=value;return {frame:()=>{}};}},
   './src/product/wechat':{createPlatform:()=>null},'./src/integration/wechat-provider':{},
   './src/product/art-assets':require('../src/product/art-assets'),'./data/deals':[], './preview-config':{mode:'simulation'},
   './data/art-manifest':{schema:1,assets:{},fonts:{heading:{src,family:'ZCOOL KuaiLe'}}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'templates/wechat-full/game.js'),'utf8'),
   {wx,require:id=>modules[id],requestAnimationFrame:()=>{}});
  assert.equal(options.headingFont,outcome==='loaded'?'native-font-family':null);
  options.artAssets.dispose();
 }
});
