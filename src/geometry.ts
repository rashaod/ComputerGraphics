// geometry.ts — the geometric tests from the "Basic Geometry" lecture.
// Every function follows the slide's formula and uses the slide's names.
// (THREE.Vector3 is only used as a 3D vector type: add, sub, dot, cross, length.)

import * as THREE from "three";

/**
 * A line in PARAMETRIC FORM (slide 15):  f(t) = (1 − t)·P1 + t·P2
 * t = 0 gives P1, t = 1 gives P2, values in between lie on the segment.
 */
export function lineAt(P1: THREE.Vector3, P2: THREE.Vector3, t: number): THREE.Vector3 {
  return P1.clone().multiplyScalar(1 - t).addScaledVector(P2, t);
}

/**
 * Intersection of the line f(t) with the plane  A·x + B·y + C·z + D = 0
 * (plane equation and normal n = (A, B, C) from slide 20).
 * Substituting f(t) = P1 + t·(P2 − P1) into the plane equation gives
 *   n·P1 + t·n·(P2 − P1) + D = 0   →   t = −(n·P1 + D) / n·(P2 − P1)
 * linePlaneT returns t, linePlaneIntersection the point; null if the line is parallel.
 */
export function linePlaneT(
  P1: THREE.Vector3, P2: THREE.Vector3, n: THREE.Vector3, D: number
): number | null {
  const denom = n.dot(P2.clone().sub(P1));
  if (Math.abs(denom) < 1e-9) return null; // parallel: no single intersection point
  return -(n.dot(P1) + D) / denom;
}
export function linePlaneIntersection(
  P1: THREE.Vector3, P2: THREE.Vector3, n: THREE.Vector3, D: number
): THREE.Vector3 | null {
  const t = linePlaneT(P1, P2, n, D);
  return t === null ? null : lineAt(P1, P2, t);
}

/**
 * Distance from point Q to the line through P1, P2 (slide 16):
 *   ‖QP‖ = ‖QP1 × QP2‖ / ‖P1P2‖
 * (the cross product's length is the area of the parallelogram; divide by the base).
 */
export function pointLineDistance(Q: THREE.Vector3, P1: THREE.Vector3, P2: THREE.Vector3): number {
  const QP1 = P1.clone().sub(Q);
  const QP2 = P2.clone().sub(Q);
  return QP1.cross(QP2).length() / P2.clone().sub(P1).length();
}

/**
 * Line–sphere test, the "simpler way" from slide 24:
 *   "Find distance from line to center of sphere. If it is less than R, there is an intersection."
 * Also returns t of the point on the line closest to the centre, so that when several
 * spheres are hit we can pick the one nearest to the camera.
 */
export function lineSphereHit(
  P1: THREE.Vector3, P2: THREE.Vector3, centre: THREE.Vector3, R: number
): { hit: boolean; t: number } {
  const d = P2.clone().sub(P1);
  const t = centre.clone().sub(P1).dot(d) / d.dot(d); // projection of the centre onto the line
  return { hit: pointLineDistance(centre, P1, P2) < R, t };
}

/**
 * Line–box test for an axis-aligned box, built only from the line–plane intersection above:
 * every side of the box lies on a plane (x = min.x, x = max.x, y = …, z = …).
 * For each side: intersect the line with its plane, then check that the point lies
 * inside that side's rectangle. The smallest t of all hits is where the line enters the box.
 * Returns that t, or null if the line misses the box.
 */
export function lineBoxT(
  P1: THREE.Vector3, P2: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3
): number | null {
  const eps = 1e-6;
  let best: number | null = null;
  const axes = ["x", "y", "z"] as const;
  for (let a = 0; a < 3; a++) {
    const axis = axes[a];
    const n = new THREE.Vector3(); n[axis] = 1;           // plane normal along this axis
    for (const value of [min[axis], max[axis]]) {
      const t = linePlaneT(P1, P2, n, -value);             // plane: axis = value  →  D = −value
      if (t === null || t < 0) continue;                    // parallel, or behind the camera
      const p = lineAt(P1, P2, t);
      // inside the rectangle of this side? (check the two OTHER axes)
      const inside = axes.every((o) => o === axis || (p[o] >= min[o] - eps && p[o] <= max[o] + eps));
      if (inside && (best === null || t < best)) best = t;
    }
  }
  return best;
}
