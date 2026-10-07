// phong.ts — our own implementation of the Phong reflection model
// ("Illumination Models & Shading" lecture, slides 12–22), written as a GLSL shader.
//
// Why our own shader instead of three.js's built-in materials?
// Built-in materials hide the lighting math. Here every term of the slide formula
// appears in the code with the slide's own names, so it can be explained line by line.
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
};

// ---------- Vertex shader: runs once per vertex ----------
// It only moves data into world space and hands it to the fragment shader.
const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;    // surface point p, world space
  varying vec3 vWorldNormal; // normal n, world space

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    // Normals are transformed by the inverse-transpose of the model matrix,
    // so they stay perpendicular to the surface even after non-uniform scaling.
    vWorldNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// ---------- Fragment shader: runs once per pixel ----------
// Evaluates I = I_a + I_d + I_s (slide 22) for this pixel.
const fragmentShader = /* glsl */ `
  uniform vec3 lightPos;
  uniform vec3 L_a, L_d, L_s;
  uniform vec3 k_a, k_d, k_s;
  uniform float alpha;
  uniform bool useAmbient, useDiffuse, useSpecular;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    // Slide 13 notation — all unit vectors, all in world space:
    vec3 n = normalize(vWorldNormal);
    if (!gl_FrontFacing) n = -n;                    // walls can be seen from both sides
    vec3 l = normalize(lightPos - vWorldPos);       // "l – direction to light source"
    vec3 v = normalize(cameraPosition - vWorldPos); // "v – direction to COP" (the camera)
    vec3 r = reflect(-l, n);                        // "r – direction of reflected ray"
                                                    //  (= 2(l·n)n − l)

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
    gl_FragColor = vec4(clamp(I, 0.0, 1.0), 1.0);
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
