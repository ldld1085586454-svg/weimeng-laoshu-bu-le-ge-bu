'use strict';
// Loopback-only development backend. No original game APIs, real account impersonation or public deployment.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createSocial}=require('../src/product/social');
function createServer(options={}){
 if(options.mode&&options.mode!=='development')throw Error('PRODUCTION_SERVER_NOT_CONFIGURED');
 const root=path.resolve(__dirname,'..'),file=options.dbFile||path.join(root,'local-data','social.json');
 const data=options.persist===false?null:(fs.existsSync(file)?fs.readFileSync(file,'utf8'):null);
 const social=createSocial({deals:options.deals||[270,540,720].map(n=>require('../examples/deal-'+n+'.json')),initial:data,
 save:options.persist===false?undefined:text=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,text,'utf8');fs.renameSync(tmp,file);}});
 const tokens=new Map(),maxBody=8*1024*1024;
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 function parse(req){return new Promise((resolve,reject)=>{let chunks=[],bytes=0;req.on('data',c=>{bytes+=c.length;if(bytes>maxBody){reject(Error('BODY_TOO_LARGE'));chunks=[];}else chunks.push(c);});req.on('end',()=>{if(bytes>maxBody)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(Error('INVALID_JSON'));}});req.on('error',reject);});}
 return http.createServer(async(req,res)=>{
  try{
   // Defense against browser cross-origin writes / DNS rebinding to a developer machine.
   const host=req.headers.host||'',origin=req.headers.origin;
   if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))return json(res,403,{error:'LOOPBACK_HOST_REQUIRED'});
   if(origin&&origin!=='http://'+host)return json(res,403,{error:'ORIGIN_REJECTED'});
   if(req.method==='GET'&&req.url==='/health')return json(res,200,{mode:'development',production:false});
   if(req.method==='GET'&&['/','/index.html'].includes(req.url)){
    const p=path.join(root,'全模块游戏_双击打开.html');if(!fs.existsSync(p))return json(res,503,{error:'RUN_FULL_BUILD_FIRST'});
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(p));
   }
   if(req.method!=='POST'||!['/api/login','/api/call'].includes(req.url))return json(res,404,{error:'NOT_FOUND'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON_REQUIRED'});
   const body=await parse(req);
   if(req.url==='/api/login'){
    if(typeof body?.deviceId!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(body.deviceId))return json(res,400,{error:'INVALID_DEVICE_ID'});
    const user='dev-'+crypto.createHash('sha256').update(body.deviceId).digest('hex').slice(0,20),token=crypto.randomBytes(32).toString('hex');
    if(tokens.size>1000)tokens.delete(tokens.keys().next().value);
    tokens.set(token,{user,expiresAt:Date.now()+8*3600000});return json(res,200,{token,userId:user,mode:'development_only'});
   }
   const key=String(req.headers.authorization||'').replace(/^Bearer /,''),entry=tokens.get(key);
   if(!entry||entry.expiresAt<Date.now())return json(res,401,{error:'DEVELOPMENT_SESSION_REQUIRED'});
   // User identity is resolved from the session, never from a submitted userId.
   const result=social.call(entry.user,body.action,body.data||{});return json(res,200,{ok:true,data:result});
  }catch(e){if(!res.headersSent)json(res,e.message==='BODY_TOO_LARGE'?413:400,{ok:false,error:String(e.message||e)});}
 });
}
if(require.main===module){const port=Number(process.env.PORT||8770);if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');const server=createServer();server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log('Development only: http://127.0.0.1:'+port));}
module.exports={createServer};
