import fs from 'node:fs';
import path from 'node:path';
const live=path.resolve('character-extractor'),repo=path.resolve('three-d-web-apps/character-extractor');
const extracted=JSON.parse(fs.readFileSync(path.join(live,'assets/cat-quest-iii/catalog.json'),'utf8'));
const entries=extracted.characters.map(({parts,warnings,...entry})=>entry);
const generated='// Generated from locally installed Cat Quest III assets. Models stay local.\nexport const catQuestCharacters = '+JSON.stringify(entries,null,2)+';\n';
for(const root of [live,repo]){
 fs.writeFileSync(path.join(root,'catquest-characters.js'),generated);
 const file=path.join(root,'characters.js');let source=fs.readFileSync(file,'utf8');
 if(!source.includes("from './catquest-characters.js'"))source="import { catQuestCharacters } from './catquest-characters.js';\n"+source.replace('export const characters = [','export const characters = [\n  ...catQuestCharacters,');
 fs.writeFileSync(file,source);
 const library=path.join(root,'library.js');source=fs.readFileSync(library,'utf8');
 if(!source.includes('catalog.games.sort('))source=source.replace('if (!catalog) return;','if (!catalog) return;\n  catalog.games.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:\'base\'}));');
 source=source.replace("badge.textContent='EXTRACTED MODEL'","badge.textContent=character.representation==='2.5D'?'2.5D SPRITES':'EXTRACTED MODEL'");
 source=source.replace("character.animationCount+' game animations':'Rest pose'","character.animationCount+' game animations':character.representation==='2.5D'?'Prefab pose':'Rest pose'");
 fs.writeFileSync(library,source);
 const viewer=path.join(root,'extractor.js');source=fs.readFileSync(viewer,'utf8');
 if(!source.includes("'cat-quest-iii':'Cat Quest III'"))source=source.replace("'little-kitty-big-city':'Little Kitty, Big City'","'little-kitty-big-city':'Little Kitty, Big City','cat-quest-iii':'Cat Quest III'");
 fs.writeFileSync(viewer,source);
}
// Synchronize just the edited character-selection block; preserve other live/repository work.
const loaderPath=path.join(live,'custom-loader.js'),liveLoader=fs.readFileSync(loaderPath,'utf8');
const begin=liveLoader.indexOf('const defaultGameNames=');const end=liveLoader.indexOf('environmentSelect.replaceChildren();',begin);
const repoLoaderPath=path.join(repo,'custom-loader.js');let repoLoader=fs.readFileSync(repoLoaderPath,'utf8');
const repoBegin=repoLoader.indexOf('characters.forEach(character=>');const repoEnd=repoLoader.indexOf('environmentSelect.replaceChildren();',repoBegin);
if(repoBegin>=0&&repoEnd>repoBegin)fs.writeFileSync(repoLoaderPath,repoLoader.slice(0,repoBegin)+liveLoader.slice(begin,end)+repoLoader.slice(repoEnd));
const dataFile=path.join(live,'data/library.json');let data=JSON.parse(fs.readFileSync(dataFile,'utf8').replace(/^\uFEFF/,''));
const backup=path.join(live,'data/library.before-catquest.json');if(!fs.existsSync(backup))fs.copyFileSync(dataFile,backup);
if(!data.games.some(g=>g.id==='cat-quest-iii'))data.games.push({id:'cat-quest-iii',name:'Cat Quest III'});
for(const entry of entries)data.characterGames[entry.id]='cat-quest-iii';
data.games.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
fs.writeFileSync(dataFile,JSON.stringify(data,null,2)+'\n');
console.log('Registered',entries.length,'Cat Quest III entries in both source catalogs and the live game library.');
