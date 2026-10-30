import assert from 'node:assert/strict';
import fs from 'node:fs';
import {environments} from '../environments/catalog.js';
const environment=environments.find(item=>item.id==='schoolboy-kitchen-hallway');
assert.ok(environment);assert.equal(environment.groundPlane,false);
assert.equal(environments[0].id,'forest','Keep the existing default environment');
const path=new URL('../'+environment.model.replace(/^\.\//,''),import.meta.url);
const raw=fs.readFileSync(path),doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
const provenance=JSON.parse(fs.readFileSync(new URL('../environments/schoolboy-house/provenance.json',import.meta.url)));
for(const room of ['17522','25239','20776']){
  assert.ok(provenance.parts.some(part=>String(part.transform)===room),'Each requested room must be present');
}
assert.equal(provenance.skipped.length,0,'No mesh/material conversion failures');
assert.ok(doc.images.length>20,'Preserve original room and furniture textures');
assert.ok(doc.meshes.length>100,'Preserve furniture, not only room shells');
assert.ok(provenance.bounds[1][2]<10,'Exclude the game’s offstage prop storage');
assert.ok(provenance.bounds[0][1]>-.1&&provenance.bounds[0][1]<=0,'Floor aligns with character spawn');
for(const accessor of doc.accessors){
  for(const bound of [accessor.min,accessor.max])if(bound)assert.ok(bound.every(Number.isFinite),'Geometry bounds must be finite');
}
assert.ok(doc.images.every(image=>image.bufferView!==undefined),'Textures must be embedded for local and Tailscale loading');
console.log(`PASS: original kitchen, corridor and main hall; ${doc.meshes.length} mesh parts, ${doc.images.length} embedded textures; floor and scene bounds.`);
