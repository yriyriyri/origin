export const logoCompositeVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const logoCompositeFrag = /* glsl */ `
precision mediump float;

uniform sampler2D uDensity;
uniform sampler2D uLogo;
uniform vec2 uLogoPos;
uniform vec2 uLogoSize;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  float density = texture2D(uDensity, vUv).r;

  vec2 logoLocal = (vUv - uLogoPos) / uLogoSize;
  float logoHeight = 0.0;
  if (
    logoLocal.x >= 0.0 && logoLocal.x <= 1.0 &&
    logoLocal.y >= 0.0 && logoLocal.y <= 1.0
  ) {
    float raw = texture2D(uLogo, logoLocal).r;
    logoHeight = (1.0 - raw) * uIntensity; // dark pixels = high, scaled by intensity
  }

  // Scale density by the same intensity so both fade together
  float combined = max(density * uIntensity, logoHeight);
  gl_FragColor = vec4(combined, combined, combined, 1.0);
}
`;
