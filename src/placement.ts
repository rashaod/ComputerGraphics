// placement.ts — a piece of equipment placed in the room.
//
// Position = the centre of its footprint on the floor (x, z), in cm.
// Rotation = only 0° or 90° ("turned"). Keeping every piece aligned with the room's
// axes means its box is always an axis-aligned box, which keeps the checks in
// Parts 7–9 simple (see "Limitations" in the report).

import * as THREE from "three";
import { EquipmentType } from "./equipment";

export interface PlacedItem {
  id: number;
  type: EquipmentType;
  group: THREE.Group; // the visible meshes
  x: number;          // footprint centre, cm
  z: number;
  turned: boolean;    // false = length along X; true = turned 90°, length along Z
}

/** Footprint size after turning: a 90° turn swaps length and width. */
export function footprint(it: PlacedItem): { sizeX: number; sizeZ: number; height: number } {
  const s = it.type.size;
  return it.turned
    ? { sizeX: s.width, sizeZ: s.length, height: s.height }
    : { sizeX: s.length, sizeZ: s.width, height: s.height };
}

/** The item's box in room coordinates (min and max corner). Used for picking and all checks. */
export function itemBox(it: PlacedItem): { min: THREE.Vector3; max: THREE.Vector3 } {
  const f = footprint(it);
  return {
    min: new THREE.Vector3(it.x - f.sizeX / 2, 0, it.z - f.sizeZ / 2),
    max: new THREE.Vector3(it.x + f.sizeX / 2, f.height, it.z + f.sizeZ / 2),
  };
}

/** Copies x, z and the turn into the three.js group so the meshes move with the data. */
export function applyPlacement(it: PlacedItem): void {
  it.group.position.set(it.x, 0, it.z);
  it.group.rotation.y = it.turned ? Math.PI / 2 : 0;
}
