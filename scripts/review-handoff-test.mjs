import assert from 'node:assert/strict';
import { reviewQueue, statusText } from './production-kit.mjs';
const manifest={project:{title:'Review fixture'},artifacts:[
  {id:'script',kind:'script',path:'script.json',status:'review',dependsOn:['outline']},
  {id:'outline',kind:'outline',path:'outline.json',status:'review',dependsOn:['source']},
  {id:'source',kind:'source',path:'source.txt',status:'approved'},
  {id:'old',kind:'art',path:'art.json',status:'stale',dependsOn:['source']},
  {id:'unknown',kind:'director',path:'director.json',status:'review',dependsOn:['not-registered']},
  {id:'missing',kind:'frames',path:'missing.json',status:'missing',dependsOn:[]}
]};
const snapshot=JSON.stringify(manifest);
assert.deepEqual(reviewQueue(manifest).ready.map(a=>a.id),['outline']);
assert.deepEqual(reviewQueue(manifest).blocked.map(a=>a.id),['script','old','unknown']);
assert.deepEqual(reviewQueue(manifest).blocked[2].dependencies,['not-registered']);
assert.ok(statusText(manifest).includes('outline.json'));
assert.equal(JSON.stringify(manifest),snapshot);
manifest.artifacts[1].status='approved';
assert.deepEqual(reviewQueue(manifest).ready.map(a=>a.id),['script']);
assert.deepEqual(reviewQueue({}).ready,[]);
console.log('PASS review handoff: dependency order, unknown dependencies, stale/missing exclusion, approved exclusion, read-only status');
