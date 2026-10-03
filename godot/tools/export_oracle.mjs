import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {SOURCE_COMMIT,guardOutput,realTarget} from './import_source.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
const clone=v=>JSON.parse(JSON.stringify(v));
function main(){
  if(!args.includes('--source')||!args.includes('--output'))throw Error('USAGE: --source <sourceRoot> --output <oracle.json>');
  const source=fs.realpathSync(arg('--source')),output=realTarget(arg('--output'));
  guardOutput(source,output);
  const require=createRequire(path.join(source,'package.json'));
  const R=require('./src/product/round.js'),B=require('./src/product/board.js'),G=require('./src/layout.js'),H=require('./src/content-hash.js'),C=require('./src/product/catalog.js');
  const fixture=(types='ABCDEFGHIJABCDEFGHIJABCDEFGHIJ')=>({schema:'astra-deal-1',dealId:'oracle-flat-'+types.length,layoutId:'oracle-flat',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,cells:[...types].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%10*100,y:Math.floor(i/10)*100,w:96,h:96}}))});
  const cases=[];
  function scenario(name,deal,play){
    const roundId='oracle-'+name;
    let state=R.createIntegrated(deal,roundId),serial=0;
    const initialState=clone(state),steps=[];
    const send=(type,extra={})=>{
      const command={id:roundId+':c'+(++serial),roundId,expectedRevision:state.revision,type,...extra};
      const r=R.dispatch(state,command);state=r.state;
      steps.push({command:clone(command),result:clone(r),fingerprint:R.fingerprint(state)});
      return r;
    };
    const token=()=>state.pending?.token;
    const pick=id=>send('PICK',{tileId:id});
    const earn=(assist,channel='video',extra={})=>{
      send('OFFER',{assist,channel,...extra});send('LAUNCH',{token:token()});
      if(channel==='share'){send('SHARE_HIDE',{token:token()});send('SHARE_RETURN',{token:token()});}
      else send('AD_CLOSE',{token:token(),isEnded:true});
      send('COMMIT',{token:token()});
    };
    play({send,pick,earn,token,state:()=>state,steps});
    cases.push({name,deal:clone(deal),roundId,initialState,steps,finalFingerprint:R.fingerprint(state),serialized:R.serialize(state),metrics:R.metrics(state)});
  }
  scenario('tutorial-win',C.tutorial(),({pick})=>{for(let i=0;i<12;i++)pick('teach-'+i);pick('teach-0');});
  const blocked=fixture('AAA');blocked.cells[1].rect={x:0,y:0,w:96,h:96};blocked.cells[1].z=1;
  scenario('board-blocking',blocked,({pick})=>{pick('t0');pick('t1');pick('t0');pick('t2');});
  const side=fixture('AAA');for(let i=0;i<3;i++)side.cells[i]={...side.cells[i],zone:'side',stackId:'left',position:i};
  scenario('side-stack',side,({pick,send})=>{pick('t2');pick('t0');send('OFFER',{assist:'undo',channel:'video'});pick('t1');pick('t2');});
  scenario('seventh-slot-triple',fixture(),({pick})=>{for(const i of [0,1,2,3,4,10,20])pick('t'+i);});
  scenario('move-buffer-return',fixture(),({pick,earn})=>{for(let i=0;i<3;i++)pick('t'+i);earn('move','share');pick('t2');pick('t0');});
  scenario('undo-video',fixture(),({pick,earn,send,token})=>{pick('t0');earn('undo');send('COMMIT',{token:token()||'old-token'});pick('t1');send('OFFER',{assist:'undo',channel:'share'});});
  scenario('shuffle-video',fixture(),({send,token,state,pick})=>{pick('t0');const permutation=state().board.deal.cells.map(c=>c.type).filter((_,i)=>!state().board.taken[i]).reverse();send('OFFER',{assist:'shuffle',channel:'video',permutation});send('LAUNCH',{token:token()});send('AD_CLOSE',{token:token(),isEnded:true});send('APPLY_FAILED',{token:token()});send('CANCEL',{token:token()});send('COMMIT',{token:token()});});
  scenario('revive-append-existing-buffer',fixture(),({pick,earn})=>{for(let i=0;i<3;i++)pick('t'+i);earn('move');for(let i=3;i<10;i++)pick('t'+i);earn('revive');pick('t0');pick('t3');});
  scenario('share-qualification',fixture(),({pick,send,token})=>{pick('t0');send('OFFER',{assist:'undo',channel:'share'});send('LAUNCH',{token:token()});send('SHARE_RETURN',{token:token()});send('SHARE_HIDE',{token:token()});send('SHARE_RETURN',{token:token()});send('COMMIT',{token:token()});});
  scenario('video-incomplete',fixture(),({pick,send,token})=>{pick('t0');for(const ended of [false,undefined]){send('OFFER',{assist:'undo',channel:'video'});send('LAUNCH',{token:token()});send('AD_CLOSE',{token:token(),...(ended===undefined?{}:{isEnded:ended})});}});
  scenario('command-validation',fixture(),({pick,send,steps,state})=>{pick('t0');const first=steps[0].command;send('PICK',{...first});send('PICK',{...first,tileId:'t1'});send('PICK',{tileId:'t1',expectedRevision:0});send('PICK',{tileId:'t1',roundId:'wrong'});send('PICK',{tileId:'t1',extra:true});send('OFFER',{assist:'nope',channel:'video'});send('OFFER',{assist:'undo',channel:'nope'});send('PICK',{tileId:'unknown'});send('PICK',{tileId:'t0'});if(state().revision!==1)throw Error('ORACLE_REJECTED_COMMAND_MUTATED_STATE');});
  const deals=[270,540,720].map(size=>{const deal=require('./examples/deal-'+size+'.json'),g=G.buildGraph({id:deal.layoutId,cells:deal.cells});return {size,snapshotHash:H.hashSnapshot(deal),canonicalSnapshot:H.canonicalSnapshot(deal),...g,by_id:Object.fromEntries(deal.cells.map((c,i)=>[c.id,i]))};});
  const vectors=[null,true,{z:[true,null,'中文'],a:7},['full-round-v012','oracle-round','command',0]];
  const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  const data={schema:'godot-js-oracle-v1',sourceCommit:SOURCE_COMMIT,hashProfile:H.SNAPSHOT_HASH_PROFILE,roundVersion:R.VERSION,deals,canonicalVectors:vectors.map(value=>({value,encoded:stable(value),sha256:H.sha256Hex(stable(value))})),cases};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({ok:true,cases:cases.length,steps:cases.reduce((n,c)=>n+c.steps.length,0),output}));
}
try{main();}catch(e){console.error(e.stack);process.exitCode=1;}
