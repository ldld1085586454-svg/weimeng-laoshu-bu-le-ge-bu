import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const source = process.env.MIGRATION_SOURCE;
assert.ok(source, 'MIGRATION_SOURCE must identify the read-only source');
const hashTree = root => {
  const h = crypto.createHash('sha256');
  const walk = dir => {
    for (const e of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const p=path.join(dir,e.name);
      h.update(path.relative(root,p));
      if(e.isDirectory()) walk(p); else if(e.isFile()) h.update(fs.readFileSync(p));
    }
  };
  walk(root);return h.digest('hex');
};
for(const target of [source,path.join(source,'forbidden-child')]) test('reject source output: '+target,()=>{
  const before=hashTree(source);
  const run=spawnSync(process.execPath,['tools/import_source.mjs','--source',source,'--project',target],{encoding:'utf8'});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/OUTPUT_INSIDE_SOURCE/);
  assert.equal(hashTree(source),before,'source tree unchanged');
});

test('reject nested output junction into a disposable source',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'godot-source-junction-'));
  const fakeSource=path.join(temporary,'source'),project=path.join(temporary,'project');
  fs.mkdirSync(path.join(fakeSource,'examples'),{recursive:true});
  fs.mkdirSync(path.join(fakeSource,'victim'));
  fs.writeFileSync(path.join(fakeSource,'package.json'),'{}');
  fs.writeFileSync(path.join(fakeSource,'examples/deal-270.json'),'{}');
  const victim=path.join(fakeSource,'victim/deal-270.json');
  fs.writeFileSync(victim,'protected source bytes');
  fs.mkdirSync(path.join(project,'data'),{recursive:true});
  fs.symlinkSync(path.join(fakeSource,'victim'),path.join(project,'data/deals'),'junction');
  const before=hashTree(fakeSource);
  const run=spawnSync(process.execPath,['tools/import_source.mjs','--source',fakeSource,'--project',project],{encoding:'utf8'});
  assert.notEqual(run.status,0);
  assert.equal(fs.readFileSync(victim,'utf8'),'protected source bytes');
  assert.match(run.stderr,/OUTPUT_INSIDE_SOURCE/);
  assert.equal(hashTree(fakeSource),before,'all disposable source bytes unchanged');
});
