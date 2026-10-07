// equipment.ts — the gym equipment, built from boxes and cylinders (mesh.ts)
// and lit with our Phong materials (phong.ts).
//
// Every piece is described by:
//   - size:  the box around it (length along X, width along Z, height along Y), in cm.
//            Later parts run all the fit/collision checks on this box.
//   - parts: the visible meshes, each with one material.
// Local coordinates: the origin is the CENTRE of the footprint, on the floor (y = 0),
// so the piece occupies x ∈ [−length/2, length/2], z ∈ [−width/2, width/2], y ∈ [0, height].

import * as THREE from "three";
import { FVMesh, emptyMesh, addBox, addCylinder } from "./mesh";
import { createPhongMaterial } from "./phong";

export interface Part { mesh: FVMesh; material: THREE.ShaderMaterial; }
export interface EquipmentType {
  name: string;
  size: { length: number; width: number; height: number };
  build: () => Part[];
}

// ---------- Materials (slide 13: k = material color) ----------
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const mat = (kd: THREE.Color, ks: number, alpha: number) =>
  createPhongMaterial({ k_a: kd.clone(), k_d: kd, k_s: C(ks, ks, ks), alpha });

export const materials = {
  frame:  mat(C(0.10, 0.10, 0.11), 0.6, 50),   // painted steel: dark, shiny
  chrome: mat(C(0.35, 0.35, 0.37), 0.9, 120),  // bars and handles: very shiny, small highlight
  pad:    mat(C(0.45, 0.05, 0.05), 0.25, 15),  // red leather pad: soft, wide highlight
  black:  mat(C(0.04, 0.04, 0.05), 0.3, 20),   // plastic / seat / plates
  belt:   mat(C(0.03, 0.03, 0.03), 0.05, 5),   // treadmill belt: almost matte
  rubber: mat(C(0.08, 0.20, 0.45), 0.05, 5),   // yoga mat: matte blue
};

/** Helper: one part = one mesh with one material. `fill` adds boxes/cylinders to it. */
function part(material: THREE.ShaderMaterial, fill: (m: FVMesh) => void): Part {
  const mesh = emptyMesh();
  fill(mesh);
  return { mesh, material };
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------- The catalogue (typical sizes; Part 7+ checks fit against these boxes) ----------
export const CATALOGUE: EquipmentType[] = [
  {
    name: "Treadmill",
    size: { length: 180, width: 80, height: 140 },
    build: () => [
      part(materials.frame, (m) => {
        addBox(m, 0, 12, -35, 170, 16, 10);  // left side frame of the deck
        addBox(m, 0, 12, 35, 170, 16, 10);   // right side frame
        addBox(m, 80, 75, -35, 6, 120, 6);   // left upright
        addBox(m, 80, 75, 35, 6, 120, 6);    // right upright
      }),
      part(materials.belt, (m) => addBox(m, 0, 18, 0, 160, 3, 60)),               // running belt
      part(materials.chrome, (m) => {
        addCylinder(m, V(-80, 12, 0), "z", 8, 66, 24);  // rear roller
        addCylinder(m, V(80, 12, 0), "z", 8, 66, 24);   // front roller
        addCylinder(m, V(55, 105, -35), "x", 2.5, 50, 16); // left handrail
        addCylinder(m, V(55, 105, 35), "x", 2.5, 50, 16);  // right handrail
      }),
      part(materials.black, (m) => addBox(m, 82, 132, 0, 16, 12, 76)),           // console
    ],
  },
  {
    name: "Squat rack",
    size: { length: 120, width: 130, height: 215 },
    build: () => [
      part(materials.frame, (m) => {
        for (const x of [-50, 50]) for (const z of [-50, 50]) addBox(m, x, 107.5, z, 7, 215, 7); // 4 posts
        for (const z of [-50, 50]) addBox(m, 0, 211, z, 93, 7, 7);  // top bars along X
        for (const x of [-50, 50]) addBox(m, x, 211, 0, 7, 7, 93);  // top bars along Z
        for (const z of [-50, 50]) addBox(m, 0, 3.5, z, 120, 7, 7); // feet
      }),
      part(materials.chrome, (m) => addCylinder(m, V(35, 140, 0), "z", 1.5, 130, 16)), // barbell
      part(materials.black, (m) => {
        addCylinder(m, V(35, 140, -57), "z", 22, 4, 32); // left plate
        addCylinder(m, V(35, 140, 57), "z", 22, 4, 32);  // right plate
      }),
    ],
  },
  {
    name: "Bench",
    size: { length: 120, width: 50, height: 45 },
    build: () => [
      part(materials.pad, (m) => addBox(m, 0, 40, 0, 120, 10, 30)), // pad
      part(materials.frame, (m) => {
        addBox(m, 0, 31, 0, 96, 6, 8);                       // spine under the pad
        for (const x of [-48, 48]) {
          addBox(m, x, 17.5, 0, 8, 29, 8);                    // leg
          addBox(m, x, 3, 0, 8, 6, 50);                       // foot
        }
      }),
    ],
  },
  {
    name: "Exercise bike",
    size: { length: 100, width: 55, height: 120 },
    build: () => [
      part(materials.frame, (m) => {
        for (const x of [-40, 40]) addBox(m, x, 4, 0, 8, 8, 55); // floor stabilisers
        addBox(m, 0, 12, 0, 88, 8, 8);                            // main beam
        addBox(m, -25, 55, 0, 5, 80, 5);                          // seat post
        addBox(m, 12, 60, 0, 5, 100, 5);                          // handlebar post
      }),
      part(materials.chrome, (m) => {
        addCylinder(m, V(35, 35, 0), "z", 25, 6, 40);   // flywheel
        addCylinder(m, V(12, 112, 0), "z", 2, 50, 16);  // handlebar
      }),
      part(materials.black, (m) => addBox(m, -25, 98, 0, 28, 6, 20)), // seat
    ],
  },
  {
    name: "Yoga mat",
    size: { length: 180, width: 60, height: 1 },
    build: () => [part(materials.rubber, (m) => addBox(m, 0, 0.5, 0, 180, 1, 60))],
  },
];

/** Default layout for a 400 × 350 cm room (x, z of each footprint centre). Part 6 makes it movable. */
export const DEFAULT_LAYOUT: { type: string; x: number; z: number }[] = [
  { type: "Treadmill", x: 110, z: 60 },
  { type: "Squat rack", x: 320, z: 90 },
  { type: "Yoga mat", x: 170, z: 180 },
  { type: "Bench", x: 300, z: 265 },
  { type: "Exercise bike", x: 80, z: 265 },
];
