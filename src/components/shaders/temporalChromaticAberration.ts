export const temporalChromaticAberrationVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const temporalChromaticAberrationFrag = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  vec2 centered = uv - 0.5;
  float dist = length(centered);

  float aberration = 0.003 * smoothstep(0.25, 1.0, dist);

  vec2 dir = dist > 0.0 ? centered / dist : vec2(0.0);

  float iters = 8.0;
  float dt = 0.12 / iters;

  float r = 0.0;
  float g = 0.0;
  float b = 0.0;

  for (float i = 0.0; i < 8.0; i++) {
    float t = i * dt;

    vec2 offR = dir * aberration * (1.0 + t);
    vec2 offG = dir * aberration * 0.5 * (1.0 + t);
    vec2 offB = -dir * aberration * (1.0 + t);

    r += texture2D(uTexture, uv + offR).r;
    g += texture2D(uTexture, uv + offG).g;
    b += texture2D(uTexture, uv + offB).b;
  }

  vec3 color = vec3(r, g, b) / iters;

  gl_FragColor = vec4(color, 1.0);
}
`;