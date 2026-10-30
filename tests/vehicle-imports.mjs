import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('assets/firstlight-vehicles/catalog.json',root)));
assert.equal(catalog.complete,true);assert.ok(catalog.vehicles.length>=80);
assert.equal(new Set(catalog.vehicles.map(v=>v.id)).size,catalog.vehicles.length,'IDs must be unique');
let total=0;
for(const vehicle of catalog.vehicles){
  assert.ok(['ready','partial','unavailable'].includes(vehicle.status));
  if(!vehicle.model){assert.equal(vehicle.status,'unavailable');continue;}
  const buffer=fs.readFileSync(new URL(vehicle.model,root));
  assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(8),buffer.length);
  const doc=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)));
  assert.ok(doc.meshes.length>0,vehicle.name+' must contain renderable geometry');
  if(doc.images)assert.ok(doc.images.every(image=>image.bufferView!==undefined),'No external texture files can go missing');
  for(const accessor of doc.accessors)for(const bounds of [accessor.min,accessor.max])if(bounds)assert.ok(bounds.every(Number.isFinite),vehicle.name+' bounds must be finite');
  if(vehicle.status==='partial')assert.ok(vehicle.warnings.length>0,'Partial import must explain its limitation');
  total++;
}
for(const name of ['Aston Martin Valhalla 2025','Aston Martin DBS 2006','Triumph motorcycle','Jaguar Type 00','Land Rover Defender 110'])assert.ok(catalog.vehicles.some(v=>v.name===name&&v.model),name+' must be imported');
const index=fs.readFileSync(new URL('index.html',root),'utf8');assert.ok(index.indexOf('All Vehicles')>index.indexOf('All characters'),'Vehicles collection follows characters');
console.log(`PASS: ${total} vehicle GLBs, embedded texture references, finite bounds, unique IDs, import labels, named vehicles and collection navigation.`);
