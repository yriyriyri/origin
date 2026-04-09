export const densityResolveVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const densityResolveFrag = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform float uDensityGain;

varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uTexture, vUv);

  float rawDensity = tex.a;
  vec3 avgColor = tex.rgb / max(rawDensity, 0.0001);

  float density = rawDensity * uDensityGain;

  float mappedDensity = 1.0 - exp(-(density));
  
  vec3 color = avgColor * mappedDensity;

  gl_FragColor = vec4(color, 1.0);
}
`;