export const vignetteVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const vignetteFrag = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform float uStrength;
uniform float uPower;
uniform float uZoom;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  vec2 vigUv = (uv - 0.5) / max(uZoom, 0.0001) + 0.5;
  vigUv = clamp(vigUv, 0.0, 1.0);

  vec2 m = vigUv * (1.0 - vigUv.yx);
  float vig = m.x * m.y * 16.0;
  vig = pow(clamp(vig, 0.0, 1.0), uPower);

  vec3 src = texture2D(uTexture, uv).rgb;
  vec3 color = mix(src * (1.0 - uStrength), src, vig);

  gl_FragColor = vec4(color, 1.0);
}
`;