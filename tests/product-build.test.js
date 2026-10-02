'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
test('build: every old v0.11 source file remains byte identical',()=>{const h=require('../docs/product/frozen-v011.json');for(const [f,digest] of Object.entries(h))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),digest,f);});
test('build: self-contained player and a unique WeChat import directory exist',()=>{assert.ok(fs.existsSync(path.join(root,'全模块游戏_双击打开.html')),'full HTML missing');assert.ok(fs.existsSync(path.join(root,'wechat_full/game.js')),'WeChat entry missing');const p=require('../wechat_full/project.config.json');assert.equal(p.compileType,'game');assert.equal(p.miniprogramRoot,'./');});
test('build: full player contains no solver or witness; template SDK defaults remain off',()=>{const p=path.join(root,'全模块游戏_双击打开.html');assert.ok(fs.existsSync(p),'full HTML missing');const html=fs.readFileSync(p,'utf8');assert.equal(html.includes('"witness":'),false);assert.equal(html.includes('src/solver'),false);const cfg=require('../templates/wechat-full/preview-config');assert.equal(cfg.mode,'simulation');assert.equal(cfg.nativeSocial,false);assert.equal(cfg.allowAdPreview,false);assert.equal(cfg.allowSharePreview,false);assert.equal(cfg.adUnitId,'');});
test('build: generated WeChat tree has no browser DOM dependency in entry',()=>{const f=path.join(root,'wechat_full/game.js');assert.ok(fs.existsSync(f));const text=fs.readFileSync(f,'utf8');assert.equal(/document\.|window\.document|localStorage/.test(text),false);assert.ok(fs.existsSync(path.join(root,'wechat_full/open-data/index.js')));});

test('build: repeated isolated builds retain developer identity and SDK configuration',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-full-build-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 for(const dir of ['src','ui','examples','templates/wechat-full'])fs.cpSync(path.join(root,dir),path.join(tmp,dir),{recursive:true});
 fs.mkdirSync(path.join(tmp,'tools'),{recursive:true});
 fs.mkdirSync(path.join(tmp,'docs/product'),{recursive:true});
 fs.copyFileSync(path.join(root,'tools/build-full.js'),path.join(tmp,'tools/build-full.js'));
 const build=()=>{
  const result=spawnSync(process.execPath,['tools/build-full.js'],{cwd:tmp,encoding:'utf8'});
  assert.equal(result.status,0,(result.stderr||'')+(result.error?.message||''));
 };
 build();
 const projectPath=path.join(tmp,'wechat_full/project.config.json');
 const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));
 project.appid='wx-test-developer-identity';
 project.projectname='my-development-project';
 project.compileType='miniprogram';
 project.miniprogramRoot='../incorrect-root';
 project.setting={urlCheck:false,minified:true,customBuildSetting:'retained'};
 project.condition={game:{list:[{name:'custom-launch',pathName:'game.js'}]}};
 project.customMetadata={label:'developer-owned'};
 fs.writeFileSync(projectPath,JSON.stringify(project));
 const previewPath=path.join(tmp,'wechat_full/preview-config.js');
 const preview="'use strict';\nmodule.exports={mode:'sdk_preview',nativeSocial:true,allowSharePreview:true,allowAdPreview:true,adUnitId:'synthetic-test-ad-unit',shareTitle:'My preview',rewardRoute:'share'};\n";
 fs.writeFileSync(previewPath,preview);
 let firstProject;
 for(let i=0;i<2;i++){
  build();
  assert.equal(fs.readFileSync(previewPath,'utf8'),preview,'preview configuration changed');
  const actual=JSON.parse(fs.readFileSync(projectPath,'utf8'));
  assert.equal(actual.appid,project.appid);
  assert.equal(actual.projectname,project.projectname);
  assert.deepEqual(actual.customMetadata,project.customMetadata);
  assert.deepEqual(actual.condition,project.condition);
  for(const [key,value] of Object.entries(project.setting))assert.equal(actual.setting[key],value,key);
  assert.equal(actual.setting.es6,true,'missing default setting was not restored');
  assert.equal(actual.compileType,'game');
  assert.equal(actual.miniprogramRoot,'./');
  if(firstProject)assert.deepEqual(actual,firstProject,'second build changed project configuration');
  firstProject=actual;
  const html=fs.readFileSync(path.join(tmp,'全模块游戏_双击打开.html'),'utf8');
  assert.equal(html.includes('"witness":'),false);
  assert.equal(html.includes('src/solver'),false);
  const deals=require(path.join(tmp,'wechat_full/data/deals.js'));
  assert.deepEqual(deals.map(d=>d.cells.length),[270,540,720]);
  assert.ok(deals.every(d=>!Object.hasOwn(d,'witness')));
  assert.equal(fs.existsSync(path.join(tmp,'wechat_full/src/solver.js')),false);
 }
});
