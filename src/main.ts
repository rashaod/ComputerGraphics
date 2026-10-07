// main.ts — entry point: sets up the renderer, camera and scene, and connects the sliders.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildRoom, Room } from "./room";
import { lightUniforms } from "./phong";
import { CATALOGUE, DEFAULT_LAYOUT } from "./equipment";
import { vertexNormalsAverage, toBufferGeometry } from "./mesh";

// ---------- Renderer, scene, camera ----------
const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d25);

// Perspective camera (same idea as the perspective projection in hw3).
// near/far are in cm: we see from 10 cm to 50 m.
const camera = new THREE.PerspectiveCamera(45, 1, 10, 5000);

// OrbitControls: drag to rotate around the room, scroll to zoom, right-drag to pan.
// We use the library here because camera navigation was already built by hand in hw3;
// the project's own work is in the fit/collision checks and the shading.
const controls = new OrbitControls(camera, canvas);

// ---------- Room state ----------
const room: Room = { length: 400, width: 350, height: 250 };
let roomGroup: THREE.Group | null = null;

/** Throws away the old room meshes and builds new ones with the current size. */
function rebuildRoom(): void {
  if (roomGroup) {
    scene.remove(roomGroup);
    // free GPU memory of the old meshes
    roomGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) obj.geometry.dispose();
    });
  }
  roomGroup = buildRoom(room);
  scene.add(roomGroup);
  // Always orbit around the centre of the room.
  controls.target.set(room.length / 2, room.height / 3, room.width / 2);
}

// ---------- Lamp (the point light source) ----------
// The lamp hangs 10 cm below the ceiling. Its X/Z position is stored as a fraction
// of the room size (0..1), so it stays inside the room when the room is resized.
const lamp = { fx: 0.5, fz: 0.5 };
// A small yellow ball shows where the light is. It is unlit (MeshBasicMaterial) on purpose:
// it represents the light itself, not a surface that receives light.
const lampMarker = new THREE.Mesh(
  new THREE.SphereGeometry(6, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffe08a })
);
scene.add(lampMarker);

/** Puts the light (and its marker) at its place under the ceiling. */
function updateLamp(): void {
  const pos = new THREE.Vector3(lamp.fx * room.length, room.height - 10, lamp.fz * room.width);
  lightUniforms.lightPos.value.copy(pos); // every Phong material sees the new position
  lampMarker.position.copy(pos);
}

// ---------- Sliders ----------
/** Connects one range input to one field of the room and shows its value next to the label. */
function bindSlider(id: "length" | "width" | "height"): void {
  const input = document.getElementById(id) as HTMLInputElement;
  const label = document.getElementById(id + "Val") as HTMLSpanElement;
  const update = () => {
    room[id] = Number(input.value);
    label.textContent = `${room[id]} cm`;
    rebuildRoom();
    updateLamp();
  };
  input.addEventListener("input", update);
  input.value = String(room[id]);
  label.textContent = `${room[id]} cm`;
}
bindSlider("length");
bindSlider("width");
bindSlider("height");

// Lighting checkboxes: each one switches one term of I = I_a + I_d + I_s.
for (const id of ["useAmbient", "useDiffuse", "useSpecular"] as const) {
  const box = document.getElementById(id) as HTMLInputElement;
  box.addEventListener("change", () => { lightUniforms[id].value = box.checked; });
}

// Lamp position sliders (fraction of the room's length / width).
for (const [id, key] of [["lampX", "fx"], ["lampZ", "fz"]] as const) {
  const input = document.getElementById(id) as HTMLInputElement;
  const label = document.getElementById(id + "Val") as HTMLSpanElement;
  const update = () => {
    lamp[key] = Number(input.value);
    label.textContent = `${Math.round(lamp[key] * 100)}%`;
    updateLamp();
  };
  input.addEventListener("input", update);
  update();
}

// ---------- Equipment ----------
// Each piece becomes a THREE.Group of its parts. Every part also gets a wireframe
// overlay (hidden by default) so the triangles of our meshes can be shown in the report.
const wireframes: THREE.LineSegments[] = [];
const statsLines: string[] = [];
for (const placed of DEFAULT_LAYOUT) {
  const type = CATALOGUE.find((t) => t.name === placed.type)!;
  const group = new THREE.Group();
  let nVerts = 0, nFaces = 0;
  for (const p of type.build()) {
    const geometry = toBufferGeometry(p.mesh, vertexNormalsAverage(p.mesh));
    group.add(new THREE.Mesh(geometry, p.material));
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x7fd1ff })
    );
    wire.visible = false;
    wireframes.push(wire);
    group.add(wire);
    nVerts += p.mesh.vertices.length;
    nFaces += p.mesh.faces.length;
  }
  group.position.set(placed.x, 0, placed.z); // footprint centre on the floor
  scene.add(group);
  statsLines.push(`${type.name}: ${nVerts} vertices, ${nFaces} triangles`);
}
(document.getElementById("meshStats") as HTMLDivElement).innerHTML = statsLines.join("<br>");
const wireBox = document.getElementById("showWire") as HTMLInputElement;
wireBox.addEventListener("change", () => wireframes.forEach((w) => (w.visible = wireBox.checked)));

// ---------- Start ----------
rebuildRoom();
updateLamp();
// Start the camera in front of the open corner, a bit above head height.
camera.position.set(room.length * 1.35, room.height * 1.6, room.width * 1.9);
controls.update();

/** Keeps the canvas size and camera aspect ratio equal to the window. */
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Render loop: draw a new frame every time the browser is ready.
function frame(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
