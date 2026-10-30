export const environments = [
  {id:'forest',name:'Forest clearing',model:'./environments/forest.glb',description:'A clearing surrounded by low-poly trees.',sky:0x90b7a0,ground:0x536e42,fog:true},
  {id:'rocks',name:'Rock field',model:'./environments/rocks.glb',description:'Scattered boulders on an open, earthy landscape.',sky:0xaeb6a2,ground:0x736d51},
  {id:'course',name:'Obstacle course',model:'./environments/course.glb',description:'A winding course of raised blocks and platforms.',sky:0x98b6c5,ground:0x5e7757},
  {id:'studio',name:'Studio floor',model:null,description:'A simple floor and grid for inspecting a character.',sky:0x18251e,ground:0x263c2b},
  {id:'schoolboy-kitchen-hallway',name:'Schoolboy Runaway · Kitchen & main hallway',model:'./environments/schoolboy-house/kitchen-hallway.glb',description:'Original kitchen, connecting corridor, and main hall with extracted furniture and textures. Cutaway viewing; game scripts and baked lighting are excluded.',sky:0x999c9a,ground:0x656159,groundPlane:false,playDistance:2.3,camera:{target:[0,1,0],yaw:.8,pitch:.5,distance:8}},
  {id:'mckenzie-hangar',name:'McKenzie Field · Hangar & runway',model:'./environments/mckenzie-hangar.glb',description:'Simple stand-in for the McKenzie Field hangar: an arched-roof hangar with open doors, concrete apron, and a marked runway. Built from basic shapes, not extracted from the game.',sky:0xa9c4d8,ground:0xb09a6a,runway:{center:[40,0,40],length:320},camera:{target:[0,3,-12],yaw:.5,pitch:.3,distance:42}}
];
