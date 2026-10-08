// main.ts — entry point: sets up the renderer, camera and scene, and connects the sliders.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildRoom, Room } from "./room";
import { lightUniforms } from "./phong";
import { CATALOGUE, DEFAULT_LAYOUT, LAYOUTS } from "./equipment";
import { PlacedItem, itemBox, zoneBox, applyPlacement, footprint } from "./placement";
import { linePlaneIntersection, lineSphereHit, lineBoxT } from "./geometry";
import { roomPlanes, fitInRoom, clearanceColor, boxOverlap, hsvToRgb } from "./checks";
import { signedPointPlaneDistance, pointSegmentDistance, sphereBoxGap } from "./geometry";
import { swingSphere, pressSegment, PLATE_RADIUS } from "./reach";
import { FVMesh, vertexNormalsAverage, vertexNormalsAreaWeighted, normalLines, toBufferGeometry } from "./mesh";

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
let floorSegments = 1; // Part 5: how many squares per floor side (2 triangles each)
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
  roomGroup = buildRoom(room, floorSegments);
  scene.add(roomGroup);
  // Always orbit around the centre of the room.
  controls.target.set(room.length / 2, room.height / 3, room.width / 2);
}

// ---------- Lamp (the point light source) ----------
// The lamp hangs LAMP_DROP cm below the ceiling. Its X/Z position is stored as a fraction
// of the room size (0..1), so it stays inside the room when the room is resized.
const lamp = { fx: 0.5, fz: 0.5 };
// A small yellow ball shows where the light is. It is unlit (MeshBasicMaterial) on purpose:
// it represents the light itself, not a surface that receives light.
// Part 9: the lamp is also an OBSTACLE — a sphere of radius LAMP_RADIUS hanging under the ceiling.
const LAMP_RADIUS = 15;  // cm
const LAMP_DROP = 20;    // cm from the ceiling to the lamp's centre
const lampMarker = new THREE.Mesh(
  new THREE.SphereGeometry(LAMP_RADIUS, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe08a })
);
scene.add(lampMarker);

/** Puts the light (and its marker) at its place under the ceiling. */
function updateLamp(): void {
  const pos = new THREE.Vector3(lamp.fx * room.length, room.height - LAMP_DROP, lamp.fz * room.width);
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

// Part 5 — shading mode: Phong (per pixel) or Gouraud (per vertex).
const shadingSelect = document.getElementById("shading") as HTMLSelectElement;
shadingSelect.addEventListener("change", () => {
  lightUniforms.useGouraud.value = shadingSelect.value === "gouraud";
});
// Part 5 — floor tessellation: more vertices = more places where Gouraud evaluates the light.
const floorSelect = document.getElementById("floorSegments") as HTMLSelectElement;
floorSelect.addEventListener("change", () => {
  floorSegments = Number(floorSelect.value);
  rebuildRoom();
});

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
// Every placed piece is a PlacedItem (placement.ts) with a THREE.Group of its parts.
// For every part we keep its FVMesh, so its normals can be recomputed when the user
// switches the normal method (Part 4). Every part also gets two debug overlays:
//   - its triangles (wireframe)            — Part 3
//   - its vertex normals as short lines    — Part 4
interface ScenePart {
  itemId: number;
  mesh: FVMesh;
  geometry: THREE.BufferGeometry;
  wire: THREE.LineSegments;
  normalViz: THREE.LineSegments;
}
let sceneParts: ScenePart[] = [];

// Part 7 overlays for every placed piece: its box outline and footprint in the status colour,
// a line from its closest corner to the closest wall, and a text label with the distance.
interface CheckOverlay {
  outline: THREE.LineSegments;
  footprintFill: THREE.Mesh;
  distLine: THREE.Line;
  label: HTMLDivElement;
  zoneFill: THREE.Mesh;          // Part 8: the safety zone on the floor
  zoneOutline: THREE.LineSegments;
  movement: THREE.Group | null;  // Part 9: swing sphere or press arms + bar
}
const overlays = new Map<number, CheckOverlay>();
const labelLayer = document.getElementById("labels") as HTMLDivElement;
const unitBoxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const unitSquare = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // lying flat on the floor
let items: PlacedItem[] = [];
let nextId = 1;
const normalVizMaterial = new THREE.LineBasicMaterial({ color: 0xffd479 });
const wireBox = document.getElementById("showWire") as HTMLInputElement;
const normalsBox = document.getElementById("showNormals") as HTMLInputElement;
const methodSelect = document.getElementById("normalMethod") as HTMLSelectElement;

/** Vertex normals with the method chosen in the panel (Part 4). */
function computeNormals(m: FVMesh): THREE.Vector3[] {
  return methodSelect.value === "area" ? vertexNormalsAreaWeighted(m) : vertexNormalsAverage(m);
}

/**
 * Part 9: the shape of a movement, drawn see-through in the status colour.
 * Built once at unit size; updateChecks() scales and moves it every frame.
 *  - swing: a wireframe sphere (radius 1 → scaled to R)
 *  - press: the arms as a thin vertical rod (height 1 → scaled to the segment length),
 *           plus the bar with two plates of radius PLATE_RADIUS at the top
 */
function buildMovementOverlay(kind: "swing" | "press"): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  if (kind === "swing") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ wireframe: true })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat));
  } else {
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1, 12).translate(0, 0.5, 0), mat);
    arms.name = "arms";
    const bar = new THREE.Group();
    bar.name = "bar";
    bar.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 130, 8).rotateX(Math.PI / 2), mat));
    for (const zSide of [-57, 57]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, 4, 24).rotateX(Math.PI / 2), mat);
      plate.position.z = zSide;
      bar.add(plate);
    }
    g.add(arms, bar);
  }
  return g;
}

/** Builds one piece of equipment, adds it to the scene and returns it. */
function addItem(typeName: string, x: number, z: number, turns = 0): PlacedItem {
  const type = CATALOGUE.find((t) => t.name === typeName)!;
  const item: PlacedItem = { id: nextId++, type, group: new THREE.Group(), x, z, turns };
  for (const p of type.build()) {
    const normals = computeNormals(p.mesh);
    const geometry = toBufferGeometry(p.mesh, normals);
    item.group.add(new THREE.Mesh(geometry, p.material));
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x7fd1ff })
    );
    const normalViz = new THREE.LineSegments(normalLines(p.mesh, normals, 6), normalVizMaterial);
    wire.visible = wireBox.checked;
    normalViz.visible = normalsBox.checked;
    item.group.add(wire, normalViz);
    sceneParts.push({ itemId: item.id, mesh: p.mesh, geometry, wire, normalViz });
  }
  applyPlacement(item);
  scene.add(item.group);
  items.push(item);

  // Part 7 overlays (positioned every frame by updateChecks)
  const ov: CheckOverlay = {
    outline: new THREE.LineSegments(unitBoxEdges, new THREE.LineBasicMaterial()),
    footprintFill: new THREE.Mesh(unitSquare, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })),
    distLine: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff })),
    label: document.createElement("div"),
    zoneFill: new THREE.Mesh(unitSquare, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })),
    zoneOutline: new THREE.LineSegments(new THREE.EdgesGeometry(unitSquare), new THREE.LineBasicMaterial()),
    movement: type.movement ? buildMovementOverlay(type.movement) : null,
  };
  if (ov.movement) scene.add(ov.movement);
  ov.label.className = "dist-label";
  labelLayer.appendChild(ov.label);
  scene.add(ov.outline, ov.footprintFill, ov.distLine, ov.zoneFill, ov.zoneOutline);
  overlays.set(item.id, ov);
  return item;
}

/** Removes a piece from the scene and frees its GPU memory. */
function removeItem(item: PlacedItem): void {
  scene.remove(item.group);
  item.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
  sceneParts = sceneParts.filter((p) => p.itemId !== item.id);
  items = items.filter((i) => i !== item);
  const ov = overlays.get(item.id)!;
  scene.remove(ov.outline, ov.footprintFill, ov.distLine, ov.zoneFill, ov.zoneOutline);
  if (ov.movement) scene.remove(ov.movement);
  ov.zoneOutline.geometry.dispose();
  ov.distLine.geometry.dispose();
  ov.label.remove();
  overlays.delete(item.id);
}

for (const placed of DEFAULT_LAYOUT) addItem(placed.type, placed.x, placed.z, placed.turns ?? 0);

/** The vertex/triangle counts in the panel (Part 3). */
function updateStats(): void {
  const lines = items.map((it) => {
    const parts = sceneParts.filter((p) => p.itemId === it.id);
    const v = parts.reduce((n, p) => n + p.mesh.vertices.length, 0);
    const f = parts.reduce((n, p) => n + p.mesh.faces.length, 0);
    return `${it.type.name}: ${v} vertices, ${f} triangles`;
  });
  (document.getElementById("meshStats") as HTMLDivElement).innerHTML = lines.join("<br>");
}
updateStats();

wireBox.addEventListener("change", () => sceneParts.forEach((p) => (p.wire.visible = wireBox.checked)));
normalsBox.addEventListener("change", () => sceneParts.forEach((p) => (p.normalViz.visible = normalsBox.checked)));

/**
 * Recomputes the vertex normals of every part with the chosen method (Mesh slide 11)
 * and sends them to the GPU. Positions and faces do not change — only the normals.
 */
function applyNormalMethod(): void {
  for (const p of sceneParts) {
    const normals = computeNormals(p.mesh);
    const attr = p.geometry.getAttribute("normal") as THREE.BufferAttribute;
    normals.forEach((n, i) => attr.setXYZ(i, n.x, n.y, n.z));
    attr.needsUpdate = true; // tell three.js to upload the new values
    p.normalViz.geometry.dispose();
    p.normalViz.geometry = normalLines(p.mesh, normals, 6);
  }
}
methodSelect.addEventListener("change", applyNormalMethod);

// ---------- Part 6: selecting, adding, moving, turning ----------
let selected: PlacedItem | null = null;

// The selected piece is outlined with its BOX (the box all later checks use).
const selectionOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
selectionOutline.visible = false;
scene.add(selectionOutline);

/** Moves the yellow outline onto the selected item's box and refreshes the info text. */
function updateSelectionView(): void {
  const info = document.getElementById("selInfo") as HTMLDivElement;
  if (!selected) {
    selectionOutline.visible = false;
    info.textContent = "Nothing selected — click a piece of equipment.";
    return;
  }
  const { min, max } = itemBox(selected);
  selectionOutline.visible = true;
  selectionOutline.scale.copy(max.clone().sub(min)).addScalar(4);    // unit cube → box size (+4 cm so it
                                                                     // does not hide the status outline)
  selectionOutline.position.copy(min.clone().add(max).multiplyScalar(0.5)); // → box centre
  const f = footprint(selected);
  info.innerHTML = `<b>${selected.type.name}</b><br>centre x = ${selected.x} cm, z = ${selected.z} cm<br>` +
    `box ${f.sizeX} × ${f.sizeZ} × ${f.height} cm, rotated ${selected.turns * 90}°`;
}
function select(item: PlacedItem | null): void {
  selected = item;
  updateSelectionView();
}

/** Positions are rounded to 5 cm so that values are easy to read and to type into a report. */
const snap = (v: number) => Math.round(v / 5) * 5;

/**
 * The line through the camera and the mouse pixel, in PARAMETRIC FORM (slide 15):
 *   f(t) = (1 − t)·P1 + t·P2
 * P1 is the pixel on the near plane, P2 the same pixel on the far plane
 * (unproject = the inverse of the projection we built in hw3).
 */
function mouseLine(ev: PointerEvent): { P1: THREE.Vector3; P2: THREE.Vector3 } {
  const r = canvas.getBoundingClientRect();
  const ndcX = ((ev.clientX - r.left) / r.width) * 2 - 1;  // pixel → normalized device coords
  const ndcY = -((ev.clientY - r.top) / r.height) * 2 + 1;
  return {
    P1: new THREE.Vector3(ndcX, ndcY, -1).unproject(camera),
    P2: new THREE.Vector3(ndcX, ndcY, 1).unproject(camera),
  };
}

/**
 * Picking: which piece is under the mouse? Two steps, as in "Collision Detection" (slide 21:
 * "needs to be efficient and accurate"):
 *   1. QUICK REJECT with a bounding sphere (centre of the box, radius = half its diagonal)
 *      and the line–sphere test of slide 24. Most pieces are rejected here.
 *   2. EXACT TEST with the piece's box: lineBoxT (built from line–plane intersections, slide 20).
 * If several boxes are hit, the one the line enters first (smallest t) is nearest to the camera.
 */
function pick(P1: THREE.Vector3, P2: THREE.Vector3): PlacedItem | null {
  let best: PlacedItem | null = null;
  let bestT = Infinity;
  for (const it of items) {
    const { min, max } = itemBox(it);
    const centre = min.clone().add(max).multiplyScalar(0.5);
    const R = max.clone().sub(min).length() / 2;
    if (!lineSphereHit(P1, P2, centre, R).hit) continue; // step 1: cannot be under the mouse
    const t = lineBoxT(P1, P2, min, max);                 // step 2: exact box test
    if (t !== null && t < bestT) { best = it; bestT = t; }
  }
  return best;
}

// The floor is the plane y = 0, i.e. A·x + B·y + C·z + D = 0 with n = (0, 1, 0), D = 0 (slide 20).
const FLOOR_N = new THREE.Vector3(0, 1, 0);
const FLOOR_D = 0;
let dragOffset: THREE.Vector3 | null = null; // where on the piece the user grabbed it

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return; // left button only; right button still pans the camera
  const { P1, P2 } = mouseLine(ev);
  const hit = pick(P1, P2);
  select(hit);
  if (!hit) return;                     // empty space: let OrbitControls rotate the camera
  const onFloor = linePlaneIntersection(P1, P2, FLOOR_N, FLOOR_D);
  if (!onFloor) return;
  dragOffset = new THREE.Vector3(hit.x, 0, hit.z).sub(onFloor);
  controls.enabled = false;             // while dragging, the camera must not move
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener("pointermove", (ev) => {
  if (!selected || !dragOffset) return;
  const { P1, P2 } = mouseLine(ev);
  // Dragging = intersecting the mouse line with the floor plane (slides 15 + 20).
  const onFloor = linePlaneIntersection(P1, P2, FLOOR_N, FLOOR_D);
  if (!onFloor) return;
  selected.x = snap(onFloor.x + dragOffset.x);
  selected.z = snap(onFloor.z + dragOffset.z);
  applyPlacement(selected);
  updateSelectionView();
});

const endDrag = () => { dragOffset = null; controls.enabled = true; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

/** Turns the selected piece by 90° around its own centre (0° → 90° → 180° → 270° → 0°). */
function turnSelected(): void {
  if (!selected) return;
  selected.turns = (selected.turns + 1) % 4;
  applyPlacement(selected);
  updateSelectionView();
}
function deleteSelected(): void {
  if (!selected) return;
  removeItem(selected);
  select(null);
  updateStats();
}

// Panel: load one of the example layouts (replaces everything in the room).
const layoutSelect = document.getElementById("layoutSelect") as HTMLSelectElement;
for (const name of Object.keys(LAYOUTS)) layoutSelect.add(new Option(name, name));
document.getElementById("layoutBtn")!.addEventListener("click", () => {
  for (const it of [...items]) removeItem(it);
  for (const e of LAYOUTS[layoutSelect.value]) addItem(e.type, e.x, e.z, e.turns ?? 0);
  select(null);
  updateStats();
  refreshLookAt();
});

// Panel: add a new piece in the middle of the room, turn, delete.
const addSelect = document.getElementById("addType") as HTMLSelectElement;
for (const t of CATALOGUE) addSelect.add(new Option(t.name, t.name));
document.getElementById("addBtn")!.addEventListener("click", () => {
  const it = addItem(addSelect.value, snap(room.length / 2), snap(room.width / 2));
  select(it);
  updateStats();
  refreshLookAt();
});
document.getElementById("turnBtn")!.addEventListener("click", turnSelected);
document.getElementById("deleteBtn")!.addEventListener("click", () => { deleteSelected(); refreshLookAt(); });

// Keyboard: arrows move the selected piece by 5 cm (like hw2's arrow keys), R turns, Delete removes.
window.addEventListener("keydown", (ev) => {
  if (!selected || (ev.target as HTMLElement).tagName === "SELECT") return;
  const step: Record<string, [number, number]> = {
    ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5],
  };
  if (step[ev.key]) {
    selected.x += step[ev.key][0];
    selected.z += step[ev.key][1];
    applyPlacement(selected);
    updateSelectionView();
    ev.preventDefault();
  } else if (ev.key === "r" || ev.key === "R") turnSelected();
  else if (ev.key === "Delete") { deleteSelected(); refreshLookAt(); }
});
updateSelectionView();

// ---------- "Look at" — move the camera to one piece of equipment ----------
// Makes close-up comparisons easy (and repeatable for the report screenshots).
const lookSelect = document.getElementById("lookAt") as HTMLSelectElement;
/** Rebuilds the "Look at" list from the pieces currently in the room. */
function refreshLookAt(): void {
  while (lookSelect.options.length > 1) lookSelect.remove(1);
  for (const it of items) lookSelect.add(new Option(`${it.type.name} #${it.id}`, String(it.id)));
}
refreshLookAt();
lookSelect.addEventListener("change", () => {
  if (lookSelect.value === "room") { resetCamera(); return; }
  const it = items.find((i) => String(i.id) === lookSelect.value);
  if (!it) return;
  const box = new THREE.Box3().setFromObject(it.group);        // around the piece
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  controls.target.copy(centre);
  camera.position.copy(centre).add(new THREE.Vector3(1.0, 0.6, 1.2).normalize().multiplyScalar(radius * 2.2));
  controls.update();
});

// ---------- Parts 7–8: does every piece fit, and does it have its safety space? ----------
const showFit = document.getElementById("showFit") as HTMLInputElement;
const showZones = document.getElementById("showZones") as HTMLInputElement;
const fitList = document.getElementById("fitList") as HTMLDivElement;
const conflictList = document.getElementById("conflictList") as HTMLDivElement;
const moveList = document.getElementById("moveList") as HTMLDivElement;
const verdict = document.getElementById("verdict") as HTMLDivElement;
let lastFitHtml = "", lastConflictHtml = "", lastMoveHtml = "", lastVerdictHtml = "";

// Part 9: the user's height (cm) — the movement shapes are built from it (reach.ts).
let personHeight = 175;
const heightInput = document.getElementById("personHeight") as HTMLInputElement;
const heightLabel = document.getElementById("personHeightVal") as HTMLSpanElement;
const updateHeight = () => { personHeight = Number(heightInput.value); heightLabel.textContent = `${personHeight} cm`; };
heightInput.addEventListener("input", updateHeight);
updateHeight();

// Status colours, all from the HSV model (Color slide 38) with the same S and V:
const COLOR_COLLISION = hsvToRgb(0, 0.85, 0.95);     // red    — pieces overlap / outside the room
const COLOR_ZONE_BLOCKED = hsvToRgb(30, 0.85, 0.95); // orange — its safety space is blocked
const COLOR_ZONE_OK = hsvToRgb(200, 0.5, 0.95);      // light blue — a free safety zone
const hex = (c: THREE.Color) => "#" + c.getHexString(THREE.SRGBColorSpace);

/** Places a flat unit-square overlay (fill + outline) over a rectangle of the floor. */
function placeOnFloor(obj: THREE.Object3D, min: THREE.Vector3, max: THREE.Vector3, y: number): void {
  obj.position.set((min.x + max.x) / 2, y, (min.z + max.z) / 2);
  obj.scale.set(max.x - min.x, 1, max.z - min.z);
}

/**
 * Runs all checks for every piece and updates the overlays. Called every frame: it is cheap
 * (a few pieces), and the colours follow a piece while it is dragged or the room changes.
 *   Part 7: fit in the room   — signed point–plane distance of the 8 box corners
 *   Part 8: overlaps          — box vs box (static collision, slide 21)
 *           safety zones      — zone box vs the other boxes, and vs the walls
 */
function updateChecks(): void {
  const walls = roomPlanes(room);
  const wallsOnly = walls.filter((w) => w.name !== "ceiling"); // a zone is floor space only
  const r = canvas.getBoundingClientRect();
  const fitRows: string[] = [];
  const conflicts: string[] = [];
  const collided = new Set<number>();
  const zoneBlocked = new Set<number>();

  // Part 8a — every PAIR of pieces: do their boxes overlap?
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const o = boxOverlap(itemBox(items[i]), itemBox(items[j]));
      if (o.intersects) {
        collided.add(items[i].id); collided.add(items[j].id);
        conflicts.push(`<b style="color:${hex(COLOR_COLLISION)}">✕</b> ${items[i].type.name} and ` +
          `${items[j].type.name} overlap by ${Math.round(o.depth)} cm`);
      }
    }
  }
  // Part 8b — every piece's SAFETY ZONE: is another piece, or a wall, inside it?
  for (const it of items) {
    const zone = zoneBox(it);
    const blockers: string[] = [];
    for (const other of items) {
      if (other === it) continue;
      if (boxOverlap(zone, itemBox(other)).intersects) blockers.push(other.type.name);
    }
    const zfit = fitInRoom(zone.min, zone.max, wallsOnly);
    if (zfit.clearance < 0) {
      blockers.push(`${zfit.wall} (${Math.round(-zfit.clearance)} cm short)`);
      for (const w of zfit.outside) if (w !== zfit.wall) blockers.push(w); // other walls it also crosses
    }
    if (blockers.length) {
      zoneBlocked.add(it.id);
      conflicts.push(`<b style="color:${hex(COLOR_ZONE_BLOCKED)}">!</b> ${it.type.name} needs free space; ` +
        `blocked by ${blockers.join(", ")}`);
    }
  }

  // Part 9 — movements: the swing SPHERE and the press SEGMENT against the room, the lamp
  // and the other pieces. For each one we keep the smallest gap (negative = they hit).
  const H = personHeight;
  const lampPos = lightUniforms.lightPos.value;
  const moveRows: string[] = [];
  const moveGap = new Map<number, number>();
  for (const it of items) {
    if (!it.type.movement) continue;
    const gaps: { what: string; gap: number }[] = [];
    if (it.type.movement === "swing") {
      const { centre, R } = swingSphere(it.x, it.z, H);
      // walls and ceiling: signed point–plane distance of the centre, minus the radius (slide 20)
      for (const w of walls) gaps.push({ what: w.name, gap: signedPointPlaneDistance(centre, w.n, w.D) - R });
      // the lamp: two spheres touch when the distance between centres < R1 + R2
      gaps.push({ what: "lamp", gap: centre.distanceTo(lampPos) - R - LAMP_RADIUS });
      // the other pieces: sphere against box
      for (const other of items) {
        if (other === it) continue;
        const b = itemBox(other);
        gaps.push({ what: other.type.name, gap: sphereBoxGap(centre, R, b.min, b.max) });
      }
    } else {
      const { P1, P2 } = pressSegment(it.x, it.z, H);
      // ceiling: the hands' distance to the ceiling plane, minus the plates' radius
      const ceiling = walls.find((w) => w.name === "ceiling")!;
      gaps.push({ what: "ceiling", gap: signedPointPlaneDistance(P2, ceiling.n, ceiling.D) - PLATE_RADIUS });
      // the lamp: distance from the lamp's centre to the arm SEGMENT (slide 19: check the end points)
      gaps.push({ what: "lamp", gap: pointSegmentDistance(lampPos, P1, P2) - PLATE_RADIUS - LAMP_RADIUS });
    }
    const worst = gaps.reduce((a, b) => (b.gap < a.gap ? b : a));
    moveGap.set(it.id, worst.gap);
    // Decide on the exact value, round only for display (a 0.3 cm overlap is still a hit → "1 cm").
    const hit = worst.gap < 0;
    const cmText = hit ? Math.max(1, Math.round(-worst.gap)) : Math.round(worst.gap);
    const verb = it.type.movement === "swing" ? "swing" : "press";
    if (hit) {
      const hits = gaps.filter((x) => x.gap < 0).map((x) => x.what);
      conflicts.push(`<b style="color:${hex(COLOR_COLLISION)}">✕</b> ${it.type.name}: the ${verb} hits the ${hits.join(", ")} ` +
        `(${cmText} cm too close)`);
    }
    moveRows.push(`<b style="color:${hex(clearanceColor(worst.gap))}">■</b> ${it.type.name}: ` +
      (hit ? `❌ hits the ${worst.what} by ${cmText} cm` : `✔ ${cmText} cm to the ${worst.what}`));

    // draw the movement shape
    const ov = overlays.get(it.id)!;
    const mc = clearanceColor(worst.gap);
    ov.movement!.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.copy(mc); });
    if (it.type.movement === "swing") {
      const { centre, R } = swingSphere(it.x, it.z, H);
      ov.movement!.position.copy(centre);
      ov.movement!.scale.setScalar(R);
    } else {
      const { P1, P2 } = pressSegment(it.x, it.z, H);
      ov.movement!.position.copy(P1);
      ov.movement!.getObjectByName("arms")!.scale.set(1, P2.y - P1.y, 1);
      ov.movement!.getObjectByName("bar")!.position.set(0, P2.y - P1.y, 0);
      ov.movement!.rotation.y = (it.turns * Math.PI) / 2; // the bar turns with the spot
    }
    ov.movement!.visible = showFit.checked;
  }
  const moveHtml = moveRows.length ? moveRows.join("<br>") : "Add a kettlebell or press spot to check a movement.";
  if (moveHtml !== lastMoveHtml) { moveList.innerHTML = moveHtml; lastMoveHtml = moveHtml; }

  for (const it of items) {
    const ov = overlays.get(it.id)!;
    const { min, max } = itemBox(it);
    const fit = fitInRoom(min, max, walls);
    const cm = Math.round(fit.clearance);
    // Status colour, most serious problem first.
    const color = collided.has(it.id) || fit.clearance < 0 || (moveGap.get(it.id) ?? 0) < 0 ? COLOR_COLLISION
                : zoneBlocked.has(it.id) ? COLOR_ZONE_BLOCKED
                : clearanceColor(fit.clearance);

    // box outline + footprint on the floor, in the status colour
    const size = max.clone().sub(min);
    ov.outline.position.copy(min.clone().add(max).multiplyScalar(0.5));
    ov.outline.scale.copy(size);
    (ov.outline.material as THREE.LineBasicMaterial).color.copy(color);
    placeOnFloor(ov.footprintFill, min, max, 0.3);
    (ov.footprintFill.material as THREE.MeshBasicMaterial).color.copy(color);

    // safety zone on the floor (just below the footprint)
    const zone = zoneBox(it);
    const zoneColor = zoneBlocked.has(it.id) ? COLOR_ZONE_BLOCKED : COLOR_ZONE_OK;
    placeOnFloor(ov.zoneFill, zone.min, zone.max, 0.15);
    placeOnFloor(ov.zoneOutline, zone.min, zone.max, 0.2);
    (ov.zoneFill.material as THREE.MeshBasicMaterial).color.copy(zoneColor);
    (ov.zoneOutline.material as THREE.LineBasicMaterial).color.copy(zoneColor);

    // distance line: from the closest corner straight to the closest wall (the perpendicular)
    ov.distLine.geometry.setFromPoints([fit.corner, fit.foot]);

    // label at the middle of the line, projected to the screen (the same projection as hw3)
    const mid = fit.corner.clone().add(fit.foot).multiplyScalar(0.5).project(camera);
    ov.label.style.left = `${((mid.x + 1) / 2) * r.width}px`;
    ov.label.style.top = `${((1 - mid.y) / 2) * r.height}px`;
    ov.label.textContent = cm < 0 ? `${-cm} cm outside!` : `${cm} cm`;
    ov.label.style.borderColor = hex(clearanceColor(fit.clearance));

    const visible = showFit.checked;
    ov.outline.visible = ov.footprintFill.visible = ov.distLine.visible = visible;
    ov.label.style.display = visible && mid.z < 1 ? "block" : "none"; // mid.z ≥ 1: behind the camera
    ov.zoneFill.visible = ov.zoneOutline.visible = showZones.checked;

    const others = fit.outside.filter((w) => w !== fit.wall);
    const status = cm < 0
      ? `❌ sticks out ${-cm} cm through the ${fit.wall}` + (others.length ? ` (also: ${others.join(", ")})` : "")
      : `✔ ${cm} cm to the ${fit.wall}`;
    fitRows.push(`<b style="color:${hex(clearanceColor(fit.clearance))}">■</b> ${it.type.name}: ${status}`);
  }
  const fitHtml = fitRows.join("<br>");
  if (fitHtml !== lastFitHtml) { fitList.innerHTML = fitHtml; lastFitHtml = fitHtml; } // touch the DOM only on change
  const conflictHtml = conflicts.length ? conflicts.join("<br>") : "✔ No overlaps, every safety zone is free.";
  if (conflictHtml !== lastConflictHtml) { conflictList.innerHTML = conflictHtml; lastConflictHtml = conflictHtml; }

  // Final verdict (Part 9): one line that answers the project's question.
  const problems = conflicts.length + items.filter((it) => fitInRoom(itemBox(it).min, itemBox(it).max, walls).clearance < 0).length;
  const verdictHtml = problems === 0
    ? `<b style="color:${hex(clearanceColor(100))}">✔ This home gym works: everything fits, with room to train.</b>`
    : `<b style="color:${hex(COLOR_COLLISION)}">⚠ ${problems} problem${problems > 1 ? "s" : ""} — see the lists below.</b>`;
  if (verdictHtml !== lastVerdictHtml) { verdict.innerHTML = verdictHtml; lastVerdictHtml = verdictHtml; }
}

// ---------- Start ----------
rebuildRoom();
updateLamp();
/** Puts the camera in front of the open corner of the room, a bit above head height. */
function resetCamera(): void {
  controls.target.set(room.length / 2, room.height / 3, room.width / 2);
  camera.position.set(room.length * 1.35, room.height * 1.6, room.width * 1.9);
  controls.update();
}
resetCamera();

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
  updateChecks();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
