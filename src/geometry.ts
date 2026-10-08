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

/**
 * Point–plane distance (slide 20):  D = |w·n + d| / ‖n‖   for the plane A·x + B·y + C·z + d = 0.
 * We keep the SIGN (no absolute value): with the plane's normal pointing INTO the room,
 *   positive = the point is on the inner side (inside the room), negative = it is outside.
 * That sign is exactly what "does it fit?" needs.
 */
export function signedPointPlaneDistance(w: THREE.Vector3, n: THREE.Vector3, d: number): number {
  return (w.dot(n) + d) / n.length();
}

/**
 * Distance from point Q to the SEGMENT P1–P2 (not the infinite line).
 * Slide 19 ("What about segment-segment? Need to check end points separately"):
 * project Q onto the line to get t; if 0 ≤ t ≤ 1 the closest point is inside the segment
 * and the point–line distance of slide 16 applies; otherwise the closest point is an end point.
 */
export function pointSegmentDistance(Q: THREE.Vector3, P1: THREE.Vector3, P2: THREE.Vector3): number {
  const d = P2.clone().sub(P1);
  const t = Q.clone().sub(P1).dot(d) / d.dot(d);
  if (t <= 0) return Q.distanceTo(P1);       // before P1 → the end point P1 is closest
  if (t >= 1) return Q.distanceTo(P2);       // after P2  → the end point P2 is closest
  return pointLineDistance(Q, P1, P2);       // in between → slide 16
}

/**
 * Gap between a sphere (centre c, radius R) and an axis-aligned box: negative = they intersect.
 * The point of the box closest to c is found by CLAMPING each coordinate of c into the
 * box's range [min, max]; the sphere touches the box exactly when that point is within R.
 * (The same "distance to the centre compared with R" idea as the line–sphere test of slide 24.)
 */
export function sphereBoxGap(c: THREE.Vector3, R: number, min: THREE.Vector3, max: THREE.Vector3): number {
  const closest = new THREE.Vector3(
    Math.min(Math.max(c.x, min.x), max.x),
    Math.min(Math.max(c.y, min.y), max.y),
    Math.min(Math.max(c.z, min.z), max.z),
  );
  return closest.distanceTo(c) - R;
}
