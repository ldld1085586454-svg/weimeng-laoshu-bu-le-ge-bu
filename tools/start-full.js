'use strict';
const path=require('node:path');
const {createServer}=require('../services/server'),{spawn,spawnSync}=require('node:child_process');
function start(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer is required.');
 const port=Number(process.env.PORT||8770);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
 const root=path.resolve(__dirname,'..');
 const build=spawnSync(process.execPath,[path.join(root,'tools/build-full.js')],{cwd:root,stdio:'inherit'});
 if(build.error)throw build.error;
 if(build.status!==0)throw Error('BUILD_FAILED');
 const server=createServer();
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已被占用。关闭之前的预览窗口，或设置 PORT 后再启动。':e.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+port;
  console.log('全模块开发预览：'+url+'\n仅本机服务；不是线上账号认证。关闭本窗口会停止服务。');
  if(process.platform==='win32'){
   const child=spawn('cmd.exe',['/c','start','""',url],{stdio:'ignore',windowsHide:true});
   child.on('error',()=>console.log('请手动在浏览器打开上述地址。'));
  }
 });
 return server;
}
if(require.main===module)try{start();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={start};
