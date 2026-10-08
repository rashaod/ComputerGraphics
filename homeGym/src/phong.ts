// phong.ts — our own implementation of the Phong reflection model
// ("Illumination Models & Shading" lecture, slides 12–22), written as a GLSL shader.
//
// Why our own shader instead of three.js's built-in materials?
// Built-in materials hide the lighting math. Here every term of the slide formula
// appears in the code with the slide's own names, so it can be explained line by line.
//
// Since Part 5 the same equation can be evaluated per pixel (Phong shading) or
// per vertex (Gouraud shading) — see `useGouraud`.
//
// All lighting vectors are computed in WORLD space (positions, normals, light, camera),
// so no vector from one coordinate system is ever mixed with a vector from another.

import * as THREE from "three";

/** Slide 13 "Some Notation": k = material color (RGB), split per term on slides 14/17/20. */
export interface PhongMaterialParams {
  k_a: THREE.Color; // ambient color   (slide 14: "k_a – ambient color")
  k_d: THREE.Color; // diffuse coeff.  (slide 17: "k_d – surface diffuse reflection coefficient")
  k_s: THREE.Color; // specular coeff. (slide 20: "k_s – surface specular reflection coefficient")
  alpha: number;    // shininess       (slide 20: "α: shininess coefficient")
}

/**
 * The light and the on/off switches. ONE object is shared by every material,
 * so moving the lamp or ticking a checkbox updates the whole scene at once.
 * Slide 13: "L – light color (RGB)", split per term into L_a, L_d, L_s.
 */
export const lightUniforms = {
  lightPos: { value: new THREE.Vector3(200, 240, 175) }, // a point source (slide 9)
  L_a: { value: new THREE.Color(0.3, 0.3, 0.33) },     // ambient light intensity  (slide 14)
  L_d: { value: new THREE.Color(1.0, 0.97, 0.9) },       // source diffuse intensity  (slide 17)
  L_s: { value: new THREE.Color(1.0, 1.0, 1.0) },        // source specular intensity (slide 20)
  useAmbient: { value: true },  // switches for before/after pictures in the report
  useDiffuse: { value: true },
  useSpecular: { value: true },
  // Part 5: where the illumination equation is evaluated (Shading slides 25–29).
  //   false → PHONG shading:   once per PIXEL, with the interpolated normal
  //   true  → GOURAUD shading: once per VERTEX, then the COLOR is interpolated
  useGouraud: { value: false },
};

// ---------- The illumination equation, shared by both shaders ----------
// The SAME function is used per-vertex (Gouraud) and per-pixel (Phong), so the
// only difference between the two modes is WHERE it is evaluated.
const illumination = /* glsl */ `
  uniform vec3 lightPos;
  uniform vec3 L_a, L_d, L_s;
  uniform vec3 k_a, k_d, k_s;
  uniform float alpha;
  uniform bool useAmbient, useDiffuse, useSpecular, useGouraud;

  // p = surface point, n = unit normal (both in world space).
  vec3 phongIllumination(vec3 p, vec3 n) {
    // Slide 13 notation — all unit vectors, all in world space:
    vec3 l = normalize(lightPos - p);       // "l – direction to light source"
    vec3 v = normalize(cameraPosition - p); // "v – direction to COP" (the camera)
    vec3 r = reflect(-l, n);                // "r – direction of reflected ray" (= 2(l·n)n − l)

    // Slide 14 — Ambient: I_a = L_a k_a
    vec3 I_a = L_a * k_a;

    // Slide 17 — Diffuse (Lambert): I_d = k_d (l·n) L_d
    // max(…, 0): a surface facing away from the light gets no diffuse light.
    vec3 I_d = k_d * max(dot(l, n), 0.0) * L_d;

    // Slide 20 — Specular: I_s = k_s (r·v)^α L_s
    // Only if the light is in front of the surface, otherwise no highlight.
    vec3 I_s = vec3(0.0);
    if (dot(l, n) > 0.0) {
      I_s = k_s * pow(max(dot(r, v), 0.0), alpha) * L_s;
    }

    // Slide 22 — Total illumination: I = I_a + I_d + I_s (each term can be switched off)
    vec3 I = vec3(0.0);
    if (useAmbient)  I += I_a;
    if (useDiffuse)  I += I_d;
    if (useSpecular) I += I_s;
    // Slide 22: "Beware of overflows" — clamp to the displayable range [0,1].
    return clamp(I, 0.0, 1.0);
  }
`;

// ---------- Vertex shader: runs once per VERTEX ----------
const vertexShader = /* glsl */ `
  ${illumination}
  varying vec3 vWorldPos;     // surface point p, world space   (for Phong shading)
  varying vec3 vWorldNormal;  // normal n, world space          (for Phong shading)
  varying vec3 vGouraudColor; // the color I at this vertex     (for Gouraud shading)

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    // Normals are transformed by the inverse-transpose of the model matrix,
    // so they stay perpendicular to the surface even after non-uniform scaling.
    vWorldNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);

    // Gouraud (slide 25): "Compute illumination intensity at vertices using normals".
    // The GPU then linearly interpolates vGouraudColor over the triangle (slide 28).
    vGouraudColor = useGouraud ? phongIllumination(vWorldPos, vWorldNormal) : vec3(0.0);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// ---------- Fragment shader: runs once per PIXEL ----------
const fragmentShader = /* glsl */ `
  ${illumination}
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vGouraudColor;

  void main() {
    vec3 I;
    if (useGouraud) {
      // Gouraud: just use the color interpolated between the 3 vertices.
      I = vGouraudColor;
    } else {
      // Phong shading (slide 29): "Interpolate normal vectors instead of illumination
      // intensities. Renormalize. Apply the illumination equation for each interior pixel."
      vec3 n = normalize(vWorldNormal);    // renormalize: interpolation shortens the vector
      if (!gl_FrontFacing) n = -n;         // walls can be seen from both sides
      I = phongIllumination(vWorldPos, n);
    }
    gl_FragColor = vec4(I, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Creates a material that is lit by our Phong shader. */
export function createPhongMaterial(p: PhongMaterialParams, doubleSided = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      ...lightUniforms, // shared objects (same references) — not copies
      k_a: { value: p.k_a },
      k_d: { value: p.k_d },
      k_s: { value: p.k_s },
      alpha: { value: p.alpha },
    },
  });
}
