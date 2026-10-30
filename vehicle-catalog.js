import {titanfallVehicles} from './titanfall-vehicles.js';

// Keep each game's source catalog intact; all collection pages consume this merge.
export async function loadVehicleCatalog(fetcher=fetch){
  let base={vehicles:[],complete:true},warning='';
  try{
    const response=await fetcher('./assets/firstlight-vehicles/catalog.json',{cache:'no-store'});
    if(!response.ok)throw Error('007 First Light catalog is unavailable.');
    base=await response.json();
    if(!Array.isArray(base.vehicles))throw Error('007 First Light catalog is invalid.');
  }catch(error){base={vehicles:[],complete:true};warning=error.message;}
  const vehicles=new Map(),games=new Map();
  for(const game of base.games||[])games.set(game.id,game);
  for(const row of [...base.vehicles.map(vehicle=>({...vehicle,gameId:vehicle.gameId||base.gameId||'007-first-light',gameName:vehicle.gameName||(vehicle.gameId&&vehicle.gameId!==(base.gameId||'007-first-light')?undefined:base.game||'007 First Light')})),...titanfallVehicles]){
    const vehicle={...row,warnings:row.warnings||[]};vehicles.set(vehicle.gameId+':'+vehicle.id,vehicle);
    if(!games.has(vehicle.gameId))games.set(vehicle.gameId,{id:vehicle.gameId,name:vehicle.gameName||vehicle.gameId});
  }
  return {...base,game:'Vehicle library',games:[...games.values()].sort((a,b)=>a.name.localeCompare(b.name)),vehicles:[...vehicles.values()],warning};
}
