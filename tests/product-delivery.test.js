'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('delivery: launch and check entrypoints exist for Windows',()=>{for(const f of ['启动全模块预览.cmd','验收全模块.cmd','tools/start-full.js','tools/check-full.js'])assert.ok(fs.existsSync(path.join(root,f)),f);});
test('delivery: production gate has no silent true defaults',()=>{const f=path.join(root,'config/full-release-gates.json');assert.ok(fs.existsSync(f));const cfg=JSON.parse(fs.readFileSync(f));assert.equal(cfg.mode,'development');assert.equal(cfg.publicReleaseAllowed,false);assert.ok(cfg.required.every(x=>x.status==='UNVERIFIED'));});

const os=require('node:os'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
function sourceFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-start-'));
 for(const name of ['src','ui','examples','templates'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
 for(const name of ['tools/build-full.js','tools/start-full.js','services/server.js']){
  const to=path.join(dir,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,name),to);
 }
 fs.mkdirSync(path.join(dir,'docs/product'),{recursive:true});
 return dir;
}
async function unusedPort(){
 const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
function listening(child){return new Promise((resolve,reject)=>{
 let output='',errors='';
 const timer=setTimeout(()=>reject(Error('START_TIMEOUT:'+errors)),15000);
 child.stderr.on('data',chunk=>errors+=chunk);
 child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('全模块开发预览：')){clearTimeout(timer);resolve();}});
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',code=>{clearTimeout(timer);reject(Error('START_EXIT:'+code+':'+errors));});
});}
test('delivery: starting source-only checkout builds the current playable HTML',async t=>{
 const dir=sourceFixture(),port=await unusedPort();
 fs.appendFileSync(path.join(dir,'ui/product/art.js'),'\n// startup-build-probe\n');
 const child=spawn(process.execPath,['tools/start-full.js'],{cwd:dir,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}fs.rmSync(dir,{recursive:true,force:true});});
 await listening(child);
 const response=await fetch('http://127.0.0.1:'+port+'/');
 assert.equal(response.status,200,'start should build before serving');
 const html=await response.text();assert.ok(html.includes('createFullApp'));assert.ok(html.includes('startup-build-probe'));
 assert.ok(fs.existsSync(path.join(dir,'wechat_full/game.js')));
});
test('delivery: invalid deal aborts startup instead of serving an obsolete build',async t=>{
 const dir=sourceFixture(),port=await unusedPort();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'全模块游戏_双击打开.html'),'obsolete build');
 const file=path.join(dir,'examples/deal-270.receipt.json'),receipt=JSON.parse(fs.readFileSync(file));
 receipt.witness[1]=receipt.witness[0];fs.writeFileSync(file,JSON.stringify(receipt));
 const result=spawnSync(process.execPath,['-e',"try {const server=require('./tools/start-full').start();server.on('listening',()=>server.close());} catch(e) {console.error(e.message);process.exitCode=1;}"],{cwd:dir,env:{...process.env,PORT:String(port)},encoding:'utf8',timeout:15000});
 assert.equal(result.status,1,'failed build must prevent a listening server');
 assert.match(result.stderr,/BUILD_FAILED/);assert.equal(result.stdout.includes('全模块开发预览：'),false);
 assert.equal(fs.readFileSync(path.join(dir,'全模块游戏_双击打开.html'),'utf8'),'obsolete build');
});
