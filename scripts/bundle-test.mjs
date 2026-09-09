import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planInstall, installBundle, companions } from './install-bundle.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'drama-bundle-test-'));
try{
  const target=path.join(temp,'skills'),plan=planInstall(target);
  assert.equal(plan.length,8);assert.equal(fs.existsSync(target),false);
  installBundle(target);
  for(const pkg of plan)for(const rel of pkg.files)assert.ok(fs.readFileSync(path.join(pkg.source,rel)).equals(fs.readFileSync(path.join(pkg.target,rel))));
  assert.equal(fs.existsSync(path.join(target,'short-drama-production','skills')),false);
  assert.throws(()=>installBundle(target),/已存在/);
  for(const name of ['short-drama-production',...companions.filter(n=>n!=='h3-prompt-writing')]){
    const script=path.join(target,name,'scripts/selftest.mjs');
    const result=spawnSync(process.execPath,[...process.execArgv,script],{cwd:path.dirname(script),encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,`${name}: ${result.stdout}\n${result.stderr}`);
    console.log(`PASS installed bundle: ${name} — ${result.stdout.trim().split('\n').at(-1)}`);
  }
  assert.ok(fs.existsSync(path.join(target,'h3-prompt-writing','references/ref-en.txt')));
  console.log('PASS bundle: eight siblings, exact copies, dry-run, no overwrite, installed regressions');
}finally{
  const resolved=path.resolve(temp),base=path.resolve(os.tmpdir());
  if(resolved.startsWith(base+path.sep)&&path.basename(resolved).startsWith('drama-bundle-test-'))fs.rmSync(resolved,{recursive:true,force:true});
}
