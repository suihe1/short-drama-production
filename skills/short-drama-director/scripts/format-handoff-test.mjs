import assert from 'node:assert/strict';
import { seedPackage } from './director-kit.mjs';
const script={episodes:[]};
assert.equal(seedPackage(script).format.aspectRatio,'16:9');
assert.equal(seedPackage({...script,aspectRatio:'9:16'}).format.aspectRatio,'9:16');
assert.equal(seedPackage({...script,format:{aspectRatio:'9:16'}}).format.aspectRatio,'9:16');
assert.equal(seedPackage({...script,aspectRatio:'9:16'},{aspectRatio:'16:9'}).format.aspectRatio,'16:9');
console.log('PASS director format: project-compatible default, input inheritance, explicit override');
