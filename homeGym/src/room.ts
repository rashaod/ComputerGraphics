// room.ts — builds the room the equipment will stand in.
//
// Units: 1 unit = 1 cm. Axes: X = length, Y = up (height), Z = width.
// The room's corner sits at the origin (0,0,0), so the floor is the
// rectangle 0..length on X and 0..width on Z, and the ceiling is at y = height.

import * as THREE from "three";
import { createPhongMaterial } from "./phong";

/** The room size in centimetres. Later parts read this to test if equipment fits. */
export interface Room {
  length: number; // along X
  width: number;  // along Z
  height: number; // along Y
}

/**
 * Builds the visible room: a floor with a 50 cm grid, two solid back walls,
 * and a thin outline of the whole room so the ceiling height is visible.
 * floorSegments: how finely the floor is split into triangles (Part 5).
 * Returns one THREE.Group so the caller can remove and rebuild it when a slider moves.
 *
 * Since Part 2 the floor and walls are lit by our own Phong shader (phong.ts).
 * The floor is slightly shiny (like a rubber gym floor) so the specular term is visible;
 * the walls are matte paint (k_s = 0).
 */
export function buildRoom(room: Room, floorSegments = 1): THREE.Group {
  const group = new THREE.Group();
  const { length, width, height } = room;

  // Floor: a flat rectangle lying on y = 0.
  const floor = new THREE.Mesh(
    // floorSegments × floorSegments squares (2 triangles each). Part 5 shows that
    // Gouraud shading needs MANY vertices to show a highlight; Phong shading does not.
    new THREE.PlaneGeometry(length, width, floorSegments, floorSegments),
    createPhongMaterial({
      k_a: new THREE.Color(0.2, 0.21, 0.24),
      k_d: new THREE.Color(0.2, 0.21, 0.24),
      k_s: new THREE.Color(0.35, 0.35, 0.35),
      alpha: 20,
    }, true)
  );
  floor.rotation.x = -Math.PI / 2;             // PlaneGeometry is vertical by default; lay it down
  floor.position.set(length / 2, 0, width / 2); // move its centre to the middle of the room
  group.add(floor);

  // Floor grid: one line every 50 cm, so sizes can be read off the screenshot.
  const gridPoints: THREE.Vector3[] = [];
  for (let x = 0; x <= length; x += 50) gridPoints.push(new THREE.Vector3(x, 0.1, 0), new THREE.Vector3(x, 0.1, width));
  for (let z = 0; z <= width; z += 50) gridPoints.push(new THREE.Vector3(0, 0.1, z), new THREE.Vector3(length, 0.1, z));
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0x3a3c44 })
  );
  group.add(grid);

  // Back wall: lies on the plane z = 0.
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(length, height),
    createPhongMaterial({
      k_a: new THREE.Color(0.26, 0.28, 0.34),
      k_d: new THREE.Color(0.26, 0.28, 0.34),
      k_s: new THREE.Color(0, 0, 0),
      alpha: 1,
    }, true)
  );
  backWall.position.set(length / 2, height / 2, 0);
  group.add(backWall);

  // Left wall: lies on the plane x = 0.
  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    createPhongMaterial({
      k_a: new THREE.Color(0.3, 0.32, 0.38),
      k_d: new THREE.Color(0.3, 0.32, 0.38),
      k_s: new THREE.Color(0, 0, 0),
      alpha: 1,
    }, true)
  );
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(0, height / 2, width / 2);
  group.add(leftWall);

  // Outline of the whole room (12 edges of the box), so the open front
  // walls and the ceiling are still visible without hiding the inside.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(length, height, width)),
    new THREE.LineBasicMaterial({ color: 0xc8ccd8 })
  );
  outline.position.set(length / 2, height / 2, width / 2);
  group.add(outline);

  return group;
}
