'use strict';
// Optional native Canvas QA. This is NOT a browser, WeChat tool, or phone test.
// Runtime/build/server do not depend on this renderer. Set BU_CANVAS_MODULE to
// an installed @napi-rs/canvas module when reproducing these visual captures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {createCanvas,Image,GlobalFonts}=require(process.env.BU_CANVAS_MODULE||'@napi-rs/canvas');
const {createArtAssets}=require('../src/product/art-assets'),{createFullApp}=require('../ui/product/app');
const deal=require('../examples/deal-270.json'),receipt=require('../examples/deal-270.receipt.json');
async function main(){
 const output=path.resolve(process.argv[2]||path.join(root,'local_reports/js-complete/native-canvas'));fs.mkdirSync(output,{recursive:true});
 GlobalFonts.registerFromPath(path.join(root,'assets/theme/fonts/ZCOOLKuaiLe-Regular.ttf'),'BuHeading');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/theme/manifest.json'),'utf8'));
 for(const asset of Object.values(manifest.assets))asset.src=path.join(root,asset.src);
 const assets=createArtAssets(manifest,{createImage:()=>new Image()});const loaded=await assets.ready;assert.equal(loaded.failed.length,0);
 let time=Date.UTC(2026,9,3,4);const canvas=createCanvas(390,844),values=new Map();
 const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
 const app=createFullApp(canvas,[deal],390,844,1,{artAssets:assets,createCanvas,headingFont:'BuHeading',motion:false,now:()=>time,storage});
 assert.deepEqual(await app.ready,{ok:true});const screenshots=[];
 const capture=name=>{app.frame();fs.writeFileSync(path.join(output,name+'.png'),canvas.toBuffer('image/png'));screenshots.push(name+'.png');};
 let presses=0,peakRss=0;
 async function press(id){const region=app.getHitRegions().find(item=>item.id===id);assert.ok(region?.enabled,'action '+id);const x=region.x+region.w/2,y=region.y+region.h/2;assert.equal(app.pointerDown(x,y,7),true);const result=await app.pointerUp(x,y,7);
  // Flush Skia and bound this optional native test host's retained draw surface.
  // Resetting pixels does not reset app state, timing, inputs or hit geometry.
  canvas.getContext('2d').getImageData(0,0,1,1);if(++presses%12===0){canvas.width=canvas.width;app.frame();if(global.gc)global.gc();}peakRss=Math.max(peakRss,process.memoryUsage().rss);if(process.env.BU_QA_DIAGNOSTIC&&presses%12===0)console.error('NATIVE_QA_PRESS',presses,JSON.stringify(process.memoryUsage()));return result;}
 capture('home-390');app.resize(320,568,1);capture('home-320');app.resize(430,932,1);capture('home-430');app.resize(1280,900,1);capture('home-desktop');app.resize(390,844,1);
 await press('start');assert.equal(app.getState().initialDeal.cells.length,12);
 for(let i=0;i<12;i++){time+=70;assert.equal((await press('tile:teach-'+i)).ok,true);}assert.equal(app.getModal(),'TUTORIAL_WIN');capture('tutorial-complete');
 await press('next-daily');capture('board-390');
 const before=app.getState();const tile=app.getHitRegions().find(item=>item.id==='tile:'+receipt.witness[0]);app.pointerDown(tile.x+tile.w/2,tile.y+tile.h/2,8);app.pointerCancel(8);assert.deepEqual(app.getState(),before);
 for(const id of receipt.witness){time+=80;assert.equal((await press('tile:'+id)).ok,true);}assert.equal(app.getModal(),'WIN');assert.equal(app.getInfo().totals.wins,1);capture('win-390');
 await press('return-home');await press('start');await press('tile:'+receipt.witness[0]);await press('exit');await press('confirm-exit');capture('home-resume');
 await press('resume');assert.equal(app.getState().board.rack.length,1);await press('undo');await press('grant');await press('dev-complete');assert.equal(app.getState().used.undo,1);capture('undo-applied');
 await press('exit');await press('confirm-exit');await press('settings');await press('setting-reducedMotion');await press('close');await press('mascot');
 for(let i=0;i<3;i++){time+=90;app.frame();}capture('mascot-tap');
 for(let i=0;i<28;i++){time+=100;app.frame();}time+=40;app.frame();capture('mascot-blink');
 app.destroy();
 const result={ok:true,renderer:'@napi-rs/canvas',pointerDriven:true,nativeSurfaceResetEveryPresses:12,performanceAcceptance:false,peakRssBytes:peakRss,tutorialPicks:12,dailyPicks:270,viewportSizes:[[320,568],[390,844],[430,932],[1280,900]],checks:['asset decoding','pointer cancellation','tutorial','daily clear','contribution','home resume','undo simulation','mascot motion'],screenshots,browserTested:false,wechatToolsTested:false,phoneTested:false};
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
