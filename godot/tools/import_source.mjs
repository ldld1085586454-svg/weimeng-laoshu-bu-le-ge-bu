import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SOURCE_COMMIT='362c61027b7a7f7e573f4b28608e3b3098e2092a';
const args=process.argv.slice(2);
const arg=k=>args[args.indexOf(k)+1];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function fontCodepoints(bytes) {
  // SFNT cmap formats 4 and 12 cover the static TTF/OTF fonts used here.
  const covered=new Set();
  const tables=bytes.readUInt16BE(4);
  let cmap;
  for(let i=0;i<tables;i++){const at=12+i*16;if(bytes.toString('ascii',at,at+4)==='cmap')cmap=bytes.readUInt32BE(at+8);}
  if(cmap===undefined)throw Error('FONT_CMAP_MISSING');
  for(let i=0;i<bytes.readUInt16BE(cmap+2);i++){
    const rec=cmap+4+i*8,platform=bytes.readUInt16BE(rec),encoding=bytes.readUInt16BE(rec+2);
    if(platform!==0&&!(platform===3&&[1,10].includes(encoding)))continue;
    const sub=cmap+bytes.readUInt32BE(rec+4),format=bytes.readUInt16BE(sub);
    if(format===12){for(let j=0;j<bytes.readUInt32BE(sub+12);j++){const at=sub+16+j*12,start=bytes.readUInt32BE(at),end=bytes.readUInt32BE(at+4),glyph=bytes.readUInt32BE(at+8);for(let c=start;c<=end;c++)if(glyph+c-start!==0)covered.add(c);}}
    if(format===4){
      const n=bytes.readUInt16BE(sub+6)/2,endAt=sub+14,startAt=endAt+n*2+2,deltaAt=startAt+n*2,rangeAt=deltaAt+n*2;
      for(let j=0;j<n;j++)for(let c=bytes.readUInt16BE(startAt+j*2);c<=bytes.readUInt16BE(endAt+j*2)&&c!==0xffff;c++){
        const delta=bytes.readInt16BE(deltaAt+j*2),range=bytes.readUInt16BE(rangeAt+j*2);
        let glyph=range?bytes.readUInt16BE(rangeAt+j*2+range+(c-bytes.readUInt16BE(startAt+j*2))*2):(c+delta)&65535;
        if(range&&glyph)glyph=(glyph+delta)&65535;
        if(glyph)covered.add(c);
      }
    }
  }
  return covered;
}
// Resolve existing ancestors too: a symlink/junction cannot bypass the source guard.
export function realTarget(target) {
  let p=path.resolve(target),tail=[];
  while(!fs.existsSync(p)){tail.unshift(path.basename(p));p=path.dirname(p);}
  return path.join(fs.realpathSync(p),...tail);
}
export function guardOutput(source,target) {
  const relative=path.relative(source,realTarget(target));
  if(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep))) throw Error('OUTPUT_INSIDE_SOURCE');
}

function main() {
  if(!args.includes('--source')||!args.includes('--project')) throw Error('USAGE: --source <sourceRoot> --project <projectRoot>');
  const source=fs.realpathSync(arg('--source')),project=realTarget(arg('--project'));
  guardOutput(source,project);
  const require=createRequire(path.join(source,'package.json'));
  const provenance=[];
  const write=(dest,bytes,sourcePath,origin='copied source bytes')=>{
    const output=path.join(project,dest);
    guardOutput(source,output);
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);
    provenance.push({destination:dest,source:sourcePath,sha256:sha(bytes),bytes:bytes.length,commit:SOURCE_COMMIT,origin});
  };
  const copy=(src,dest=src)=>write(dest,fs.readFileSync(path.join(source,src)),src);
  const json=(dest,value,src)=>write(dest,Buffer.from(JSON.stringify(value,null,2)+'\n'),src,'explicit JSON export from source module');
  for(const n of [270,540,720]){
    copy('examples/deal-'+n+'.json','data/deals/deal-'+n+'.json');
    copy('examples/deal-'+n+'.receipt.json','data/deals/deal-'+n+'.receipt.json');
  }
  for(const name of ['home','board','characters','components','primary','user-cards']) copy('assets/theme/'+name+'.png');
  for(const name of ['manifest.json','user-cards-index.json','README.md','fonts/ZCOOLKuaiLe-Regular.ttf','fonts/OFL.txt'])copy('assets/theme/'+name);
  const catalog=require('./src/product/catalog.js'),profile=require('./src/play/profile.js'),round=require('./src/product/round.js');
  json('data/catalog.json',{POLICY:catalog.POLICY,REGIONS:catalog.REGIONS,SKINS:catalog.SKINS,BULLETS:catalog.BULLETS},'src/product/catalog.js');
  json('data/profile.json',profile.PROFILE,'src/play/profile.js');
  json('data/limits.json',round.LIMITS,'src/product/round.js');
  json('data/deals/tutorial.json',catalog.tutorial(),'src/product/catalog.js:tutorial()');
  const app=fs.readFileSync(path.join(source,'ui/product/app.js'),'utf8');
  if(!app.includes('const prefs={sound:true,music:true,vibration:true,bullets:true,reducedMotion:options.motion===false}'))throw Error('SOURCE_PREFS_CONTRACT_CHANGED');
  json('data/default-prefs.json',{sound:true,music:true,vibration:true,bullets:true,reducedMotion:false},'ui/product/app.js:23 (motion enabled default)');
  const corpusFiles=['src/product/catalog.js','src/product/social.js',...fs.readdirSync(path.join(source,'ui/product')).filter(f=>f.endsWith('.js')).map(f=>'ui/product/'+f)];
  const chars=[...new Set(('卜了个卜'+corpusFiles.map(f=>fs.readFileSync(path.join(source,f),'utf8')).join('')).match(/[\p{Script=Han}]/gu))].sort();
  const heading=fontCodepoints(fs.readFileSync(path.join(source,'assets/theme/fonts/ZCOOLKuaiLe-Regular.ttf')));
  const missing=chars.filter(c=>!heading.has(c.codePointAt(0)));
  const fontAudit={schema:'godot-font-audit-v1',scope:'all Han characters in source UI/product JS + catalog/social JS + product title (superset of UI literals)',corpusFiles,uniqueHanCharacters:chars.length,headingFont:'assets/theme/fonts/ZCOOLKuaiLe-Regular.ttf',headingMissing:missing,requiredCharacters:chars.join(''),fallbackRequired:missing.length>0};
  json('data/font-audit.json',fontAudit,corpusFiles.join(', '));
  // Run the original build only in a disposable copy, never inside the source.
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'godot-migration-audio-'));
  for(const entry of ['src','ui','assets','examples','templates','tools','package.json'])fs.cpSync(path.join(source,entry),path.join(scratch,entry),{recursive:true});
  fs.mkdirSync(path.join(scratch,'docs/product'),{recursive:true});
  const built=spawnSync(process.execPath,['tools/build-full.js'],{cwd:scratch,encoding:'utf8'});
  if(built.status!==0) throw Error('INDEPENDENT_AUDIO_BUILD_FAILED: '+built.stderr);
  for(const name of ['click','clear','win','fail','music'])write('assets/audio/'+name+'.wav',fs.readFileSync(path.join(scratch,'wechat_full/audio/'+name+'.wav')),'tools/build-full.js -> wechat_full/audio/'+name+'.wav','newly synthesized development tones; independent temporary source build');
  const manifest={schema:'godot-source-manifest-v1',sourceCommit:SOURCE_COMMIT,sourceRoot:source,sourceReadOnly:true,audioBuild:{script:'tools/build-full.js',scriptSha256:sha(fs.readFileSync(path.join(source,'tools/build-full.js'))),temporaryRoot:scratch},excluded:['local-data/social.json','localStorage','tiles.png','JS runtime bundles'],files:provenance};
  const out=path.join(project,'data/source-manifest.json');
  guardOutput(source,out);
  fs.writeFileSync(out,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({ok:true,sourceCommit:SOURCE_COMMIT,files:provenance.length,manifest:out}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(e){console.error(e.message);process.exitCode=1;}
}
