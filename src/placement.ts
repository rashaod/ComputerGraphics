// placement.ts — a piece of equipment placed in the room.
//
// Position = the centre of its footprint on the floor (x, z), in cm.
// Rotation = a number of quarter turns (0°, 90°, 180°, 270°) around the vertical axis.
// Keeping every piece aligned with the room's axes means its box is always an
// axis-aligned box, which keeps the checks in Parts 7–9 simple (see "Limitations").
// (Part 6 had only 0°/90°; Part 8 added 180°/270° because a treadmill's safety zone
//  is BEHIND it, so its direction matters.)

import * as THREE from "three";
import { EquipmentType } from "./equipment";

export interface PlacedItem {
  id: number;
  type: EquipmentType;
  group: THREE.Group; // the visible meshes
  x: number;          // footprint centre, cm
  z: number;
  turns: number;      // quarter turns: 0, 1, 2 or 3  (= 0°, 90°, 180°, 270°)
}

/** Footprint size after turning: an odd number of quarter turns swaps length and width. */
export function footprint(it: PlacedItem): { sizeX: number; sizeZ: number; height: number } {
  const s = it.type.size;
  return it.turns % 2 === 1
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

/**
 * Rotates a direction on the floor by the item's quarter turns (rotation about the Y axis):
 *   x' = x·cosθ + z·sinθ,   z' = −x·sinθ + z·cosθ      (θ = turns · 90°)
 * The same rotation three.js applies to the meshes with rotation.y = θ.
 */
export function turnDirection(it: PlacedItem, dx: number, dz: number): { dx: number; dz: number } {
  const t = (it.turns * Math.PI) / 2;
  return {
    dx: Math.round(dx * Math.cos(t) + dz * Math.sin(t)),   // round: cos/sin of 90° steps are 0 or ±1
    dz: Math.round(-dx * Math.sin(t) + dz * Math.cos(t)),
  };
}

/**
 * The SAFETY ZONE (Part 8): the item's box grown by the free space its type needs on each
 * side. The zone is defined in the item's own frame (front = +X, back = −X, sides = ±Z)
 * and turned with the item, so a treadmill's "2 m behind" stays behind it.
 */
export function zoneBox(it: PlacedItem): { min: THREE.Vector3; max: THREE.Vector3 } {
  const { min, max } = itemBox(it);
  const z = it.type.zone;
  const sides: [number, number, number][] = [ // [local dx, local dz, extra cm]
    [1, 0, z.front], [-1, 0, z.back], [0, 1, z.side], [0, -1, z.side],
  ];
  for (const [lx, lz, cm] of sides) {
    const { dx, dz } = turnDirection(it, lx, lz);
    if (dx > 0) max.x += cm;
    if (dx < 0) min.x -= cm;
    if (dz > 0) max.z += cm;
    if (dz < 0) min.z -= cm;
  }
  return { min, max };
}

/** Copies x, z and the turns into the three.js group so the meshes move with the data. */
export function applyPlacement(it: PlacedItem): void {
  it.group.position.set(it.x, 0, it.z);
  it.group.rotation.y = (it.turns * Math.PI) / 2;
}
