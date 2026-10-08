// checks.ts — "Does it fit?" (Part 7)
//
// Every wall and the ceiling are planes A·x + B·y + C·z + D = 0 (Basic Geometry, slide 20)
// with the normal n = (A, B, C) pointing INTO the room. For each piece of equipment we take
// the 8 corners of its box and measure their signed distance to every plane.
//   - the smallest distance to a plane = how much space is left to that wall
//   - a negative distance = that corner is OUTSIDE the room (the piece does not fit)

import * as THREE from "three";
import { Room } from "./room";
import { signedPointPlaneDistance } from "./geometry";

export interface WallPlane { name: string; n: THREE.Vector3; D: number; }

/** The 4 walls and the ceiling as planes with inward normals. (The floor is where things stand.) */
export function roomPlanes(room: Room): WallPlane[] {
  return [
    { name: "left wall (x = 0)",  n: new THREE.Vector3(1, 0, 0),  D: 0 },            //  x ≥ 0
    { name: "right wall",         n: new THREE.Vector3(-1, 0, 0), D: room.length },  //  x ≤ length
    { name: "back wall (z = 0)",  n: new THREE.Vector3(0, 0, 1),  D: 0 },            //  z ≥ 0
    { name: "front wall",         n: new THREE.Vector3(0, 0, -1), D: room.width },   //  z ≤ width
    { name: "ceiling",            n: new THREE.Vector3(0, -1, 0), D: room.height },  //  y ≤ height
  ];
}

/** The 8 corners of an axis-aligned box. */
export function boxCorners(min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  const c: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z])
    c.push(new THREE.Vector3(x, y, z));
  return c;
}

export interface FitResult {
  clearance: number;      // cm to the closest wall/ceiling (negative = sticks out by that much)
  wall: string;           // which plane is closest
  corner: THREE.Vector3;  // the box corner closest to that plane
  foot: THREE.Vector3;    // the point on the plane straight across from that corner
  outside: string[];      // every plane the box sticks through (can be more than one)
}

/** Measures how the box fits in the room: the closest plane, and by how much. */
export function fitInRoom(min: THREE.Vector3, max: THREE.Vector3, planes: WallPlane[]): FitResult {
  let best: FitResult | null = null;
  const outside: string[] = [];
  for (const p of planes) {
    let planeMin = Infinity;
    for (const w of boxCorners(min, max)) {
      const dist = signedPointPlaneDistance(w, p.n, p.D);
      planeMin = Math.min(planeMin, dist);
      if (!best || dist < best.clearance) {
        // foot of the perpendicular: move from the corner along −n by the distance
        const foot = w.clone().addScaledVector(p.n, -dist / p.n.length());
        best = { clearance: dist, wall: p.name, corner: w, foot, outside };
      }
    }
    if (planeMin < 0) outside.push(p.name);
  }
  return best!;
}

/**
 * HSV → RGB ("The HSV Color Model", Color lecture slide 38):
 *   H = angle around the V axis (0°–360°), S = saturation (0–1), V = value / brightness (0–1).
 * The standard conversion: the hue circle is split into 6 sectors of 60°;
 * in each sector one RGB channel is at its maximum (V), one at its minimum (V − C),
 * and one is rising or falling linearly in between.
 */
export function hsvToRgb(H: number, S: number, V: number): THREE.Color {
  const C = V * S;                                  // chroma: distance from grey
  const Hp = (H % 360) / 60;                        // which 60° sector (0..6)
  const X = C * (1 - Math.abs((Hp % 2) - 1));       // the channel that is changing
  let r = 0, g = 0, b = 0;
  if (Hp < 1) [r, g, b] = [C, X, 0];
  else if (Hp < 2) [r, g, b] = [X, C, 0];
  else if (Hp < 3) [r, g, b] = [0, C, X];
  else if (Hp < 4) [r, g, b] = [0, X, C];
  else if (Hp < 5) [r, g, b] = [X, 0, C];
  else [r, g, b] = [C, 0, X];
  const m = V - C;                                  // lift all channels to brightness V
  // The values are ordinary screen (sRGB) colours, so tell three.js which colour space they are in.
  return new THREE.Color().setRGB(r + m, g + m, b + m, THREE.SRGBColorSpace);
}

/** Clearances at or above this many cm count as fully "comfortable" (green). */
export const COMFORT_CM = 20;

/**
 * Colour for a clearance, using HSV so that only the HUE changes:
 *   sticks out (< 0)  → red   (H = 0°)
 *   0 … 20 cm         → red → orange → yellow → green, hue rising from 0° to 120°
 *   ≥ 20 cm           → green (H = 120°)
 * Keeping S and V fixed means every status colour is equally bright and readable.
 */
export function clearanceColor(cm: number): THREE.Color {
  const H = cm < 0 ? 0 : Math.min(cm / COMFORT_CM, 1) * 120;
  return hsvToRgb(H, 0.85, 0.95);
}

/**
 * Overlap of two axis-aligned boxes — "Collision of static primitives" (slide 21:
 * "Check if two primitives are intersecting … answer is only yes/no").
 * Two boxes intersect only if their ranges overlap on ALL THREE axes. On each axis the
 * overlap length is  min(maxA, maxB) − max(minA, minB)  (negative = a gap between them).
 * `depth` = the smaller of the X and Z overlaps = how far one piece must slide to separate.
 */
export function boxOverlap(
  a: { min: THREE.Vector3; max: THREE.Vector3 }, b: { min: THREE.Vector3; max: THREE.Vector3 }
): { intersects: boolean; depth: number } {
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return { intersects: ox > 0 && oy > 0 && oz > 0, depth: Math.min(ox, oz) };
}
