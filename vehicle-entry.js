// Only explicitly paired, original clips may participate. A finished static
// vehicle mesh does not imply that a compatible character-entry clip exists.
export function createNativeVehicleEntry(motion,character,vehicle=null){
  const profile=vehicle?.entryAnimation||(!vehicle?character?.vehicleInteraction:null);
  if(!profile||profile.source!=='game'||!profile.verified)return null;
  if(vehicle&&(vehicle.status!=='ready'||!vehicle.mainMesh||profile.characterId!==character.id))return null;
  const matching=ids=>(ids||[]).filter(id=>motion.presets.some(p=>p.id===id&&p.source==='game'&&p.mode==='once'&&Number.isFinite(p.duration)&&p.duration>0));
  const enter=matching(profile.enter),exit=matching(profile.exit);
  if(!enter.length||!exit.length)return null;
  let phase=null,elapsed=0,duration=0;
  const preferred={enter:enter[0],exit:exit[0]};
  return {
    selfMounted:profile.kind==='self',source:profile.game||'Original game',
    get busy(){return !!phase;},get phase(){return phase;},
    begin(direction){
      if(phase)return false;
      const options=direction==='enter'?enter:direction==='exit'?exit:[];if(!options.length)return false;
      if(enter.includes(motion.preset.id))preferred.enter=motion.preset.id;
      if(exit.includes(motion.preset.id))preferred.exit=motion.preset.id;
      const selected=preferred[direction];
      motion.select(selected);motion.trigger();phase=direction;elapsed=0;duration=motion.preset.duration;return true;
    },
    update(dt){
      if(!phase)return null;elapsed+=dt;motion.update(dt,{playing:true,moving:false});
      if(!motion.oneShot){const completed=phase;phase=null;return completed;}
      if(elapsed>duration+.5){motion.stop();phase=null;return 'cancelled';}
      return null;
    },
    cancel(){if(phase)motion.stop();phase=null;elapsed=0;}
  };
}
