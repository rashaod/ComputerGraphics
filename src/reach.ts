// reach.ts — Part 9: the space a MOVEMENT needs, as simple 3D shapes.
//
//  - Kettlebell swing → a SPHERE around the shoulders: the bell can be anywhere the arms
//    reach, so the sphere's radius is arm length + the bell.
//  - Overhead press   → a vertical SEGMENT from the shoulders to the hands at full reach;
//    the bar's plates (radius 22 cm, as on our barbell) must clear everything around it.
//
// Body sizes are proportions of standing height H. They are the classic anthropometric
// segment proportions (Drillis & Contini), an approximation of an average body:
//   shoulder height ≈ 0.818·H,  shoulder → middle of the hand (grip) ≈ 0.386·H
//   (upper arm 0.186·H + forearm 0.146·H + half the hand 0.054·H)

import * as THREE from "three";

export const SHOULDER_HEIGHT = 0.818;  // × H
export const ARM_TO_GRIP = 0.386;      // × H
export const KETTLEBELL_RADIUS = 15;   // cm, the bell itself
export const PLATE_RADIUS = 22;        // cm, matches the plates in equipment.ts

/** Kettlebell swing: sphere centred at the shoulders, radius = arm + bell. */
export function swingSphere(x: number, z: number, H: number): { centre: THREE.Vector3; R: number } {
  return {
    centre: new THREE.Vector3(x, SHOULDER_HEIGHT * H, z),
    R: ARM_TO_GRIP * H + KETTLEBELL_RADIUS,
  };
}

/** Overhead press: segment from the shoulders (P1) straight up to the hands at lockout (P2). */
export function pressSegment(x: number, z: number, H: number): { P1: THREE.Vector3; P2: THREE.Vector3 } {
  const shoulder = SHOULDER_HEIGHT * H;
  return {
    P1: new THREE.Vector3(x, shoulder, z),
    P2: new THREE.Vector3(x, shoulder + ARM_TO_GRIP * H, z),
  };
}
