// main.ts — entry point: sets up the renderer, camera and scene, and connects the sliders.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildRoom, Room } from "./room";

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

// ---------- Sliders ----------
/** Connects one range input to one field of the room and shows its value next to the label. */
function bindSlider(id: "length" | "width" | "height"): void {
  const input = document.getElementById(id) as HTMLInputElement;
  const label = document.getElementById(id + "Val") as HTMLSpanElement;
  const update = () => {
    room[id] = Number(input.value);
    label.textContent = `${room[id]} cm`;
    rebuildRoom();
  };
  input.addEventListener("input", update);
  input.value = String(room[id]);
  label.textContent = `${room[id]} cm`;
}
bindSlider("length");
bindSlider("width");
bindSlider("height");

// ---------- Start ----------
rebuildRoom();
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
