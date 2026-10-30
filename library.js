import { loadVehicleCatalog } from './vehicle-catalog.js';
import { characters } from './characters.js';
import * as THREE from 'three';
import { GLTFLoader } from './vendor/modern/GLTFLoader.js';

const $ = selector => document.querySelector(selector);
let catalog = null, selectedGame = 'all', renameId = null, busy = false;
const previews = new Map();
let renderer;
const requested = new URLSearchParams(location.search).get('character');
if (characters.some(character => character.id === requested)) {
  location.replace('./viewer.html' + location.search);
} else loadCatalog();

function message(text, error = false) {
  $('#libraryStatus').textContent = text;
  $('#libraryStatus').classList.toggle('error', error);
}

function gameFor(character) { return catalog.characterGames[character.id] || character.gameId; }
function countFor(id) { return characters.filter(character => gameFor(character) === id).length; }

async function loadCatalog() {
  try {
    const response = await fetch('./api/library');
    if (!response.ok) throw new Error('Could not load game categories. Refresh to retry.');
    catalog = await response.json();
    render();
    message('Select a character to open its model, voice library, and render controls.');
  } catch (error) { message(error.message, true); }
}

async function updateCatalog(change) {
  const response = await fetch('./api/library', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(change)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save game categories.');
  catalog = result;
}

function selectGame(id) { selectedGame = id; render(); }

function render() {
  if (!catalog) return;
  catalog.games.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  $('#allCount').textContent = characters.length;
  $('#summary').textContent = `${characters.length} characters · ${catalog.games.length} ${catalog.games.length === 1 ? 'game' : 'games'}`;
  $('#allGames').classList.toggle('active',selectedGame === 'all');
  $('#gameNav').replaceChildren();
  catalog.games.forEach(game => {
    const button=document.createElement('button');button.type='button';button.className='game-nav'+(selectedGame === game.id?' active':'');
    const icon=document.createElement('span');icon.textContent='◇';icon.style.flex='0';
    const name=document.createElement('span');name.textContent=game.name;
    const count=document.createElement('b');count.textContent=countFor(game.id);
    button.append(icon,name,count);button.onclick=()=>selectGame(game.id);$('#gameNav').append(button);
  });
  $('#gameSections').replaceChildren();
  const search=$('#characterSearch').value.trim().toLowerCase();
  let sections=0;
  for (const game of catalog.games) {
    if (selectedGame !== 'all' && selectedGame !== game.id) continue;
    const all=characters.filter(character=>gameFor(character) === game.id);
    const visible=all.filter(character=>`${character.name} ${game.name}`.toLowerCase().includes(search));
    visible.sort($('#sort').value === 'voice' ? (a,b)=>b.voiceCount-a.voiceCount : (a,b)=>a.name.localeCompare(b.name));
    if (search && !visible.length) continue;
    sections++;
    const section=document.createElement('section');section.className='game-section';
    const titleRow=document.createElement('div');titleRow.className='game-title-row';
    const titleGroup=document.createElement('div');titleGroup.className='game-title-group';
    const emblem=document.createElement('span');emblem.className='game-emblem';emblem.textContent='◇';
    const titles=document.createElement('div'),heading=document.createElement('h2'),summary=document.createElement('small');
    heading.textContent=game.name;summary.textContent=`${all.length} extracted ${all.length===1?'character':'characters'} · ${all.reduce((total,character)=>total+character.voiceCount,0)} voice clips`;
    titles.append(heading,summary);titleGroup.append(emblem,titles);
    const rename=document.createElement('button');rename.className='rename-game';rename.textContent='Rename game';rename.setAttribute('aria-label','Rename '+game.name);rename.onclick=()=>openGameDialog(game);
    titleRow.append(titleGroup,rename);section.append(titleRow);
    if (!visible.length) {
      const empty=document.createElement('div');empty.className='empty-game';
      const strong=document.createElement('strong');strong.textContent='No extracted characters yet';
      const text=document.createElement('span');text.textContent='This category is ready for future extractions. Assign an existing character using the Game category selector on its card.';
      empty.append(strong,text);section.append(empty);
    } else {
      const grid=document.createElement('div');grid.className='character-grid';
      visible.forEach(character=>grid.append(characterCard(character)));section.append(grid);
    }
    $('#gameSections').append(section);
  }
  if (!sections) { const empty=document.createElement('div');empty.className='empty-game';empty.textContent='No characters match your search.';$('#gameSections').append(empty); }
}

function characterCard(character) {
  const url='./viewer.html?character='+encodeURIComponent(character.id);
  const card=document.createElement('article');card.className='character-card';card.dataset.character=character.id;
  const preview=document.createElement('a');preview.className='character-preview';preview.href=url;preview.setAttribute('aria-label','Open '+character.name);
  const placeholder=document.createElement('span');placeholder.className='preview-placeholder';placeholder.textContent='◇';placeholder.setAttribute('aria-hidden','true');
  const badge=document.createElement('span');badge.className='model-badge';badge.textContent=character.representation==='2.5D'?'2.5D SPRITES':'EXTRACTED MODEL';
  const image=document.createElement('img');image.alt=character.name+' model preview';image.hidden=true;
  preview.append(placeholder,image,badge);
  previewFor(character).then(data=>{if(!preview.isConnected)return;image.src=data;image.hidden=false;placeholder.hidden=true}).catch(()=>{placeholder.textContent=character.name.charAt(0)});
  const details=document.createElement('div');details.className='card-details';
  const titleRow=document.createElement('div');titleRow.className='card-title';
  const title=document.createElement('a');title.href=url;title.textContent=character.name;
  const format=document.createElement('span');format.className='format';format.textContent='GLB';titleRow.append(title,format);
  const description=document.createElement('p');description.className='character-description';description.textContent=character.description;
  const info=document.createElement('div');info.className='asset-info';
  for (const value of [character.voiceCount+' voice clips',(character.languages||[]).map(l=>({English:'EN',Russian:'RU'})[l]||l).join(' / ')||'—',character.animationCount?character.animationCount+' game animations':character.representation==='2.5D'?'Prefab pose':'Rest pose']) {const tag=document.createElement('span');tag.textContent=value;info.append(tag)}
  const open=document.createElement('a');open.href=url;open.className='open-character';open.textContent='Open character';const arrow=document.createElement('span');arrow.textContent='↗';open.append(arrow);
  const category=document.createElement('label');category.className='category-row';category.textContent='Game category';
  const select=document.createElement('select');select.className='category-select';select.setAttribute('aria-label','Game category for '+character.name);
  catalog.games.forEach(game=>{const option=document.createElement('option');option.value=game.id;option.textContent=game.name;select.append(option)});select.value=gameFor(character);
  select.onchange=async()=>{
    const gameId=select.value;select.disabled=true;
    try {await updateCatalog({action:'assign-character',characterId:character.id,gameId});render();message(character.name+' moved to '+catalog.games.find(game=>game.id===gameId).name+'.');}
    catch(error){select.value=gameFor(character);select.disabled=false;message(error.message,true);}
  };
  category.append(select);details.append(titleRow,description,info,open,category);card.append(preview,details);return card;
}

function previewFor(character) {
  if (!previews.has(character.id)) previews.set(character.id,(async()=>{
    const gltf=await new GLTFLoader().loadAsync(character.model);
    if(!renderer){renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(480,360);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;}
    const scene=new THREE.Scene(), model=gltf.scene;
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z);
    const wrapper=new THREE.Group();wrapper.add(model);model.position.sub(center);wrapper.scale.setScalar(2/max);scene.add(wrapper);
    const camera=new THREE.PerspectiveCamera(36,480/360,.01,100);camera.position.set(2,1.15,4.5);camera.lookAt(0,0,0);
    const key=new THREE.DirectionalLight(0xffffff,2.8);key.position.set(3,5,5);scene.add(key,new THREE.HemisphereLight(0xc9e6ff,0x54634a,2));
    renderer.render(scene,camera);const data=renderer.domElement.toDataURL('image/png');
    model.traverse(object=>{if(object.isMesh){object.geometry.dispose();for(const mat of Array.isArray(object.material)?object.material:[object.material]){mat.map?.dispose();mat.dispose();}}});
    return data;
  })());
  return previews.get(character.id);
}

function openGameDialog(game=null) {
  if (!catalog) return;
  renameId=game?.id||null;$('#dialogTitle').textContent=game?'Rename game category':'Add game category';
  $('#saveGame').textContent=game?'Save name':'Create category';$('#gameName').value=game?.name||'';$('#gameError').textContent='';$('#gameDialog').showModal();$('#gameName').focus();
}
$('#allGames').onclick=()=>selectGame('all');
$('#addGame').onclick=$('#addGameSmall').onclick=()=>openGameDialog();
$('#characterSearch').oninput=render;$('#sort').onchange=render;
$('#closeDialog').onclick=$('#cancelDialog').onclick=()=>$('#gameDialog').close();
$('#gameForm').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const name=$('#gameName').value.trim();if(!name)return;
  busy=true;$('#saveGame').disabled=true;$('#gameError').textContent='';
  try {
    await updateCatalog({action:renameId?'rename-game':'add-game',gameId:renameId,name});
    selectedGame=renameId||catalog.games.find(game=>game.name.toLowerCase()===name.toLowerCase()).id;
    $('#gameDialog').close();render();message('Game category saved on this PC.');
  }catch(error){$('#gameError').textContent=error.message;}
  finally{busy=false;$('#saveGame').disabled=false;}
};

loadVehicleCatalog().then(data=>{if(data)document.querySelector('#vehicleCollectionCount').textContent=data.vehicles.length;}).catch(()=>{});
