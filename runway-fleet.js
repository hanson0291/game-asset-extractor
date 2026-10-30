import {isAirplane} from './airplane-flight.js';

// The fixed-wing aircraft in the loaded vehicle catalogs, in catalog order:
// exactly the vehicles the airplane controller would fly — planes and jets
// (including the Drone Webb), never helicopters, cars or quadcopter drones.
// Entries without a model file cannot be parked.
export function fixedWingVehicles(catalogs){
  const fleet=[],seen=new Set();
  for(const catalog of catalogs||[]){
    for(const vehicle of catalog?.vehicles||[]){
      if(!vehicle?.model||seen.has(vehicle.id))continue;
      if(isAirplane({name:vehicle.name,userData:{vehicle}})){seen.add(vehicle.id);fleet.push(vehicle);}
    }
  }
  return fleet;
}

// Parking slots for a line of aircraft on a runway: centered on the
// runway's center, spread along its length (the X axis), every aircraft
// facing the same way down the strip (+X). Slots advance by each
// aircraft's length plus a gap, so aircraft never overlap; the gap drops
// from 6 m to 2 m when the line would otherwise overrun the strip, and a
// line that still cannot fit stays centered on the runway.
export function runwayParking(runway,sizes){
  const [cx,cy,cz]=runway.center;
  const lengths=(sizes||[]).map(size=>size.length);
  const body=lengths.reduce((total,length)=>total+length,0);
  const gaps=Math.max(0,lengths.length-1);
  const gap=body+6*gaps>runway.length-16?2:6;
  let cursor=cx-(body+gap*gaps)/2;
  return lengths.map(length=>{
    const slot={x:cursor+length/2,y:cy,z:cz,heading:-Math.PI/2};
    cursor+=length+gap;
    return slot;
  });
}
