import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=process.env.MIGRATION_SOURCE;
assert.ok(source,'MIGRATION_SOURCE required');
test('export deterministic source oracle with command/state/event vectors',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'godot-oracle-test-'));
  const output=path.join(dir,'oracle.json');
  const run=()=>spawnSync(process.execPath,['tools/export_oracle.mjs','--source',source,'--output',output],{encoding:'utf8'});
  const first=run();assert.equal(first.status,0,first.stderr);
  const bytes=fs.readFileSync(output);const data=JSON.parse(bytes);
  assert.equal(data.schema,'godot-js-oracle-v1');
  assert.equal(data.sourceCommit,'362c61027b7a7f7e573f4b28608e3b3098e2092a');
  assert.deepEqual(data.deals.map(d=>d.size),[270,540,720]);
  for(const name of ['tutorial-win','board-blocking','side-stack','move-buffer-return','undo-video','shuffle-video','revive-append-existing-buffer','share-qualification','video-incomplete','command-validation']){
    const c=data.cases.find(c=>c.name===name);assert.ok(c,name);assert.ok(c.steps.length,name);
    for(const step of c.steps){assert.equal(typeof step.command.id,'string');assert.equal(typeof step.result.ok,'boolean');assert.equal(typeof step.fingerprint,'string');}
  }
  const second=run();assert.equal(second.status,0,second.stderr);assert.deepEqual(fs.readFileSync(output),bytes,'repeat export identical');
});
test('oracle output never writes into source',()=>{
  const run=spawnSync(process.execPath,['tools/export_oracle.mjs','--source',source,'--output',path.join(source,'forbidden-oracle.json')],{encoding:'utf8'});
  assert.notEqual(run.status,0);assert.match(run.stderr,/OUTPUT_INSIDE_SOURCE/);assert.equal(fs.existsSync(path.join(source,'forbidden-oracle.json')),false);
});
