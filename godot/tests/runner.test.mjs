import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const godot=process.env.GODOT_EXECUTABLE || path.resolve(projectRoot,'../tools-local/godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe');

function temporarySuite(name,body){
  assert.ok(fs.existsSync(godot),'GODOT_EXECUTABLE must point to a real Godot console executable');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'godot-runner-regression-'));
  fs.mkdirSync(path.join(temporary,'tests'));
  fs.writeFileSync(path.join(temporary,'project.godot'),'config_version=5\n[application]\nconfig/name="Runner regression"\n');
  for(const file of ['run.gd','assertions.gd'])fs.copyFileSync(path.join(projectRoot,'tests',file),path.join(temporary,'tests',file));
  fs.writeFileSync(path.join(temporary,'tests','test_'+name+'.gd'),'extends RefCounted\nfunc run(a: RefCounted) -> bool:\n'+body);
  return spawnSync(godot,['--headless','--path',temporary,'--script','tests/run.gd','--','--suite',name],{
    encoding:'utf8',timeout:20000,env:{...process.env,APPDATA:temporary,LOCALAPPDATA:temporary},
  });
}

test('runner prints PASS only after the suite returns completion',()=>{
  const result=temporarySuite('complete','\ta.truth(true, "check ran")\n\treturn true\n');
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/^PASS complete$/m);
});

test('runner rejects a suite interrupted by a real runtime script error',t=>{
  const result=temporarySuite('crash','\ta.truth(true, "check before crash")\n\ta.call("missing_runtime_method")\n\treturn true\n');
  assert.notEqual(result.status,null,result.error?.message);
  assert.notEqual(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout+result.stderr,/SCRIPT ERROR/);
  assert.doesNotMatch(result.stdout,/^PASS crash$/m);
  t.diagnostic('injected runtime suite exited '+result.status+'; no PASS crash marker');
});

test('runner rejects a suite that finishes checks but returns false',()=>{
  const result=temporarySuite('unfinished','\ta.truth(true, "check ran")\n\treturn false\n');
  assert.notEqual(result.status,null,result.error?.message);
  assert.notEqual(result.status,0,result.stdout+result.stderr);
  assert.doesNotMatch(result.stdout,/^PASS unfinished$/m);
});

test('runner enters the live scene tree before node-based suites',()=>{
  const result=temporarySuite('tree','\tvar tree = Engine.get_main_loop()\n\ta.truth(tree.root.is_inside_tree(), "root is active")\n\tvar child = Node.new()\n\ttree.root.add_child(child)\n\ta.truth(child.is_inside_tree(), "native child entered tree")\n\tchild.free()\n\treturn true\n');
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/^PASS tree$/m);
});

test('runner waits for suites that observe a native process frame',()=>{
  const result=temporarySuite('async','\tvar tree = Engine.get_main_loop()\n\tawait tree.process_frame\n\ta.truth(tree.root.is_inside_tree(), "suite resumed in tree")\n\treturn true\n');
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/^PASS async$/m);
});
