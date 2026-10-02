'use strict';
// Offline deterministic regression workload, not a human difficulty / pass-rate estimate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../src/product/round'),B=require('../src/product/board'),{createRandom,seedFromText}=require('../src/random');
const rng=createRandom(seedFromText('full-product-v012-stress-20260918'),'commands'),sizes=[270,540,720];
const report={version:'0.12',seed:'full-product-v012-stress-20260918',rounds:100,commands:0,saveReplays:0,lateCallbacksRejected:0,cancellations:0,earnedRetries:0,revivals:0,randomTerminals:{WON:0,LOST:0,PLAYING:0},approvedClears:[],realAds:false,note:'混合流程主动制造失败；不是100局全部通关，也不是玩家通关率。'};
for(let n=0;n<report.rounds;n++){
 let s=R.createIntegrated(require('../examples/deal-'+sizes[n%3]+'.json'),'stress-'+n),seq=0;
 function replay(){const p=R.restore(R.serialize(s));assert.ok(p.ok,p.code);assert.equal(R.fingerprint(p.state),R.fingerprint(s));report.saveReplays++;}
 function send(type,extra={}){const r=R.dispatch(s,{type,id:'op-'+(++seq),roundId:s.roundId,expectedRevision:s.revision,...extra});assert.ok(r.ok,type+':'+r.code);s=r.state;report.commands++;B.checkRound(s.board);if(seq%9===0)replay();}
 for(let turn=0;turn<300;turn++){
  if(s.board.status==='WON')break;
  let assist=null;
  if(s.board.status==='LOST'){if(s.used.revive)break;assist='revive';}
  else if(rng.int(8)===0){const candidates=['move','undo','shuffle'].filter(a=>!R.checkOffer(s,a,'video'));if(candidates.length)assist=candidates[rng.int(candidates.length)];}
  if(assist){const channel=rng.int(2)?'video':'share',extra=assist==='shuffle'?{permutation:rng.shuffle(s.board.deal.cells.filter((_,i)=>!s.board.taken[i]).map(c=>c.type))}:{};
   send('OFFER',{assist,channel,...extra});const token=s.pending.token;send('LAUNCH',{token});
   const wrong=R.dispatch(s,{type:'AD_CLOSE',id:'wrong-'+seq,roundId:'old-round',expectedRevision:s.revision,token,isEnded:true});assert.equal(wrong.ok,false);report.lateCallbacksRejected++;
   if(rng.int(7)===0){send('CANCEL',{token});report.cancellations++;continue;}
   if(channel==='share'){send('SHARE_HIDE',{token});send('SHARE_RETURN',{token});}else send('AD_CLOSE',{token,isEnded:true});
   if(rng.int(3)===0){send('APPLY_FAILED',{token});replay();report.earnedRetries++;}
   send('COMMIT',{token});if(assist==='revive')report.revivals++;
   const repeat=R.dispatch(s,{type:'COMMIT',id:'duplicate-'+seq,roundId:s.roundId,expectedRevision:s.revision,token});assert.equal(repeat.ok,false);
  }else{let legal=B.legalTiles(s.board);assert.ok(legal.length);const types=s.board.rack.map(id=>s.board.deal.cells[s.board.byId[id]].type),matches=legal.filter(id=>types.includes(s.board.deal.cells[s.board.byId[id]].type));if(matches.length&&rng.int(4)!==0)legal=matches;send('PICK',{tileId:legal[rng.int(legal.length)]});}
 }
 replay();report.randomTerminals[s.board.status]++;
}
for(const size of sizes){const deal=require('../examples/deal-'+size+'.json'),receipt=require('../examples/deal-'+size+'.receipt.json');let s=R.createIntegrated(deal,'approved-'+size),seq=0;for(const id of receipt.witness){const r=R.dispatch(s,{type:'PICK',id:'w'+(++seq),roundId:s.roundId,expectedRevision:s.revision,tileId:id});assert.ok(r.ok,r.code);s=r.state;}assert.equal(s.board.status,'WON');assert.equal(s.board.cleared,size);const replay=R.restore(R.serialize(s));assert.ok(replay.ok,replay.code);assert.equal(R.fingerprint(replay.state),R.fingerprint(s));report.approvedClears.push({tiles:size,picks:seq,status:'WON',replay:true});}
report.ok=true;const out=path.resolve(process.argv[2]||path.join(__dirname,'../local_reports/full-stress.json'));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
