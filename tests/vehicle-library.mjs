import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element{
  constructor(){this.children=[];this.dataset={};this.value='';this.style={};this.attributes={};this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(){}
}
const elements=new Map(),html=fs.readFileSync(new URL('../vehicles.html',import.meta.url),'utf8');
for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set('#'+match[1],new Element());
elements.get('#vehicleFilter').value='all';
const catalog={game:'007 First Light',complete:true,vehicles:[
  {id:'car',name:'Aston Martin Test',family:'aston_martin',status:'ready',model:'car.glb',mainMesh:true,triangles:100,warnings:[]},
  {id:'boat',name:'Escape Boat',family:'escape_boat',status:'partial',model:'boat.glb',mainMesh:false,triangles:50,warnings:['Component preview']},
  {id:'bike',name:'Missing Bike',family:'motorcycle',status:'unavailable',model:null,warnings:['Archive locked']},
  {id:'other-car',gameId:'second-game',gameName:'Second Game',name:'Second Game Sedan',family:'sedan',status:'ready',model:'other.glb',mainMesh:true,triangles:70,warnings:[]}
]};
let fetched=false;
const context=vm.createContext({document:{querySelector:key=>elements.get(key),createElement:()=>new Element()},
  THREE:{Vector3:class{}},GLTFLoader:class{},IntersectionObserver:class{observe(){}disconnect(){}unobserve(){}},
  loadVehicleCatalog:async()=>{fetched=true;return catalog;},fetch:async()=>({ok:true,json:async()=>catalog}),setTimeout(){throw Error('Finished catalogs must not poll');}});
const source=fs.readFileSync(new URL('../vehicles.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
const grid=elements.get('#vehicleGrid');assert.equal(fetched,true);assert.equal(grid.children.length,4,'All vehicle statuses are shown');
assert.equal(elements.get('#vehicleCount').textContent,4);
const gameSelect=elements.get('#vehicleGameFilter'),gameNav=elements.get('#vehicleGames');
assert.equal(gameSelect.children.length,3,'Dropdown includes All games and both source games');
assert.equal(gameNav.children[1].textContent,'007 First Light','Legacy single-game catalog gets its source label');
assert.equal(gameNav.children[1].children[0].textContent,3);
assert.equal(gameNav.children[2].children[0].textContent,1);
gameNav.children[2].onclick();assert.equal(gameSelect.value,'second-game','Sidebar synchronizes dropdown');assert.equal(grid.children.length,1);
assert.equal(gameNav.children[2].attributes['aria-pressed'],'true');
assert.equal(elements.get('#vehicleTypes').children[0].children[0].textContent,1,'Type totals respect selected game');
assert.match(grid.children[0].children[1].children[1].textContent,/Second Game/,'Cards label their actual game');
gameSelect.value='007-first-light';gameSelect.onchange();assert.equal(grid.children.length,3);assert.equal(gameNav.children[1].attributes['aria-pressed'],'true','Dropdown synchronizes sidebar');
const unavailable=grid.children.find(card=>card.dataset.status==='unavailable');assert.equal(unavailable.children[1].children[3].disabled,true,'Unavailable imports cannot open a broken model');
elements.get('#vehicleFilter').value='imported';elements.get('#vehicleFilter').onchange();assert.equal(grid.children.length,2);
elements.get('#vehicleSearch').value='Aston';elements.get('#vehicleSearch').oninput();assert.equal(grid.children.length,1);
elements.get('#vehicleSearch').value='';elements.get('#vehicleFilter').value='all';elements.get('#vehicleSearch').oninput();
const types=elements.get('#vehicleTypes').children;types[types.length-1].onclick();assert.equal(grid.children.length,1,'Watercraft category filters correctly');assert.equal(grid.children[0].dataset.status,'partial');
assert.match(elements.get('#vehicleStatus').textContent,/Batch finished/);
gameSelect.value='second-game';gameSelect.onchange();assert.equal(grid.children.length,1);assert.equal(grid.children[0].className,'empty-game','Game and type filters combine into an empty state');
assert.equal(elements.get('#vehicleResults').textContent,'0 of 4 vehicles');
gameNav.children[0].onclick();assert.equal(gameSelect.value,'all');assert.equal(grid.children[0].dataset.status,'partial','All games retains the type filter');
elements.get('#vehicleTypes').children[0].onclick();assert.equal(grid.children.length,4,'All games and all types restore inventory');
elements.get('#vehicleFilter').value='imported';elements.get('#vehicleFilter').onchange();assert.equal(grid.children.length,3);
console.log('PASS: synchronized game dropdown/sidebar, source labels/counts, combined search/type/status filters, empty states and legacy catalog.');
