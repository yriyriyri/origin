export const horizontalBlurVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const horizontalBlurFrag = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uBlurAmount;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 texel = vec2(1.0 / max(uResolution.x, 1.0), 0.0);
  float blur = uBlurAmount;

  vec3 blurCol = vec3(0.0);
  blurCol += texture2D(uTexture, uv + texel * -4.0 * blur).rgb * 0.05;
  blurCol += texture2D(uTexture, uv + texel * -3.0 * blur).rgb * 0.09;
  blurCol += texture2D(uTexture, uv + texel * -2.0 * blur).rgb * 0.12;
  blurCol += texture2D(uTexture, uv + texel * -1.0 * blur).rgb * 0.15;
  blurCol += texture2D(uTexture, uv).rgb * 0.18;
  blurCol += texture2D(uTexture, uv + texel *  1.0 * blur).rgb * 0.15;
  blurCol += texture2D(uTexture, uv + texel *  2.0 * blur).rgb * 0.12;
  blurCol += texture2D(uTexture, uv + texel *  3.0 * blur).rgb * 0.09;
  blurCol += texture2D(uTexture, uv + texel *  4.0 * blur).rgb * 0.05;

  vec3 src = texture2D(uTexture, uv).rgb;

  float alpha = max(max(src.r, src.g), src.b);

  vec3 color = mix(blurCol, src, alpha);

  gl_FragColor = vec4(color, 1.0);
}
`;