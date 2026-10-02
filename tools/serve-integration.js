'use strict';
// Optional loopback-only HTTP preview for browsers that block file:// scripts.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const port=Number(process.argv[2]||8791);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
const html=fs.readFileSync(path.join(__dirname,'../对局与领取整合_双击打开.html'));
const server=http.createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Open http://127.0.0.1:${port}/ ; Ctrl+C to stop. Developer build only.`));
