import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/modern/three.module.js';
import {characters} from '../characters.js';
const cats=characters.filter(c=>c.gameId==='cat-quest-iii');
assert.equal(cats.length,53);
assert.equal(new Set(characters.map(c=>c.id)).size,characters.length);
const data=JSON.parse(fs.readFileSync(new URL('../data/library.json',import.meta.url),'utf8'));
assert.deepEqual(data.games.map(g=>g.name),data.games.map(g=>g.name).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})));
const threeURL=new URL('../vendor/modern/three.module.js',import.meta.url).href;
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const utilsURL=moduleURL(fs.readFileSync(new URL('../vendor/modern/BufferGeometryUtils.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)));
const {GLTFLoader}=await import(moduleURL(fs.readFileSync(new URL('../vendor/modern/GLTFLoader.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)).replace("from './BufferGeometryUtils.js'",'from '+JSON.stringify(utilsURL))));
let layers=0,total=0;
for(const cat of cats){
 assert.equal(data.characterGames[cat.id],'cat-quest-iii');
 assert.equal(cat.audio,null);assert.equal(cat.voiceCount,0);assert.equal(cat.representation,'2.5D');
 const raw=fs.readFileSync(new URL('../'+cat.model.replace(/^\.\//,''),import.meta.url));
 assert.equal(raw.toString('ascii',0,4),'glTF');assert.equal(raw.readUInt32LE(8),raw.length);
 const n=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+n));
 assert.ok(doc.meshes.length>0,cat.name+' contains geometry');
 const bin=raw.subarray(28+n);
 for(const image of doc.images){const view=doc.bufferViews[image.bufferView];assert.equal(bin.subarray(view.byteOffset,view.byteOffset+8).toString('hex'),'89504e470d0a1a0a',cat.name+' embedded PNG');}
 for(const a of doc.accessors){const view=doc.bufferViews[a.bufferView];assert.ok(view.byteOffset+view.byteLength<=bin.length);assert.ok([...a.min,...a.max].every(Number.isFinite));}
 for(const m of doc.materials)delete m.pbrMetallicRoughness.baseColorTexture;
 let encoded=Buffer.from(JSON.stringify(doc));encoded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+encoded.length+raw.length-20-n,8);header.writeUInt32LE(encoded.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bytes=Buffer.concat([header,encoded,raw.subarray(20+n)]);
 const gltf=await new Promise((ok,bad)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',ok,bad));
 gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
 // The original mosh-pit prefab is a crowd spread over a 32-unit-wide stage.
 const maxExtent=cat.id==='catquest-concert-cats-moshpit'?100:30;
 assert.ok([...box.min,...box.max].every(Number.isFinite)&&size.y>0&&size.length()<maxExtent,cat.name+' valid bounds '+size.toArray());
 const source=new URL('../'+cat.model.replace(/^\.\//,'').replace('character.glb','provenance.json'),import.meta.url);
 const proof=JSON.parse(fs.readFileSync(source));assert.equal(proof.warnings.length,0,cat.name+' clean export');assert.equal(proof.parts.length,doc.meshes.length);
 if(!cat.id.startsWith('catquest-concert-'))assert.ok(proof.parts.every(p=>!p.path.split('/').includes('Main_back')),cat.name+' front assembly');
 layers+=doc.meshes.length;total+=raw.length;
}
// Exercise the actual loader's option builder, including renamed categories and selection retention.
const makeSelect=value=>({value,options:[],replaceChildren(){this.options=[];this.value='';},append(option){this.options.push(option);}});
const select=makeSelect('catquest-pi-rat'),gameSelect=makeSelect('');
const context=vm.createContext({characters,characterSelect:select,characterGameSelect:gameSelect,startCharacter:'mom',loading:false,document:{createElement:()=>({})}});
const loaderSource=fs.readFileSync(new URL('../custom-loader.js',import.meta.url),'utf8');
const begin=loaderSource.indexOf('const defaultGameNames=');
const end=loaderSource.indexOf('// Keep future game categories',begin);
vm.runInContext(loaderSource.slice(begin,end),context);
assert.equal(select.options.length,cats.length);
assert.equal(gameSelect.value,'cat-quest-iii','Deep-linked character selects its game');
assert.ok(select.options.every(o=>cats.some(c=>c.id===o.value)),'Character list contains only the selected game');
assert.ok(select.options.every(o=>!o.textContent.includes(' · ')),'Names do not repeat the selected game');
const gameLabels=gameSelect.options.map(o=>o.textContent);
assert.deepEqual(gameLabels,[...gameLabels].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})));
assert.equal(select.value,'catquest-pi-rat');
context.catalog={games:data.games.map(g=>({...g,name:g.id==='cat-quest-iii'?'ZZZ Renamed Cats':g.name})),characterGames:data.characterGames};
vm.runInContext('fillCharacterOptions(catalog)',context);
assert.equal(gameSelect.options.at(-1).textContent,'ZZZ Renamed Cats');
assert.equal(select.value,'catquest-pi-rat','Renaming/reordering retains the selected cat');
gameSelect.value='schoolboy-runaway';vm.runInContext('fillCharacters()',context);
assert.deepEqual(select.options.map(o=>o.value),['andrew','mom']);assert.equal(select.value,'andrew','Changing game selects its first character');
select.value='mom';vm.runInContext('fillCharacterOptions(catalog)',context);assert.equal(gameSelect.value,'schoolboy-runaway');assert.equal(select.value,'mom','Catalog refresh retains user selection');
gameSelect.value='titanfall-2';vm.runInContext('fillCharacters()',context);assert.equal(select.options.length,2);assert.ok(select.options.every(o=>['ion-titan','jack-cooper'].includes(o.value)));
console.log(`PASS: ${cats.length} cats/variants; ${layers} original sprite layers; ${total} bytes; all embedded textures, Three.js loads, bounds, provenance and category mappings verified.`);
