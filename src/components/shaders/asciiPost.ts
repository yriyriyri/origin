export const asciiPostVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const asciiPostFrag = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uPixelation;

varying vec2 vUv;

float character(float n, vec2 p) {
  p = floor(p * vec2(8.0, -8.0) + (vec2(-4.0, 4.0) + vec2(1.0)));

  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    float x = 5.0 * p.y + p.x;
    float signbit = (n < 0.0) ? 1.0 : 0.0;
    signbit = (x == 0.0) ? signbit : 0.0;
    return (fract(abs(n * exp2(-x - 1.0))) >= 0.5) ? 1.0 : signbit;
  }

  return 0.0;
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  fragCoord /= uPixelation;

  vec2 uv = fragCoord.xy;
  vec2 cursorPosition =
    (floor(uv / 8.0) * 8.0 + (0.5 / uPixelation)) /
    (uResolution.xy / uPixelation);

  vec3 col = texture2D(uTexture, cursorPosition).rgb;

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float gray = smoothstep(0.0, 1.0, luma);

  float grayIndex = floor(clamp(gray, 0.0, 0.9999) * 16.0);
  float n = 0.0;

  if (grayIndex < 1.0) n = 0.0;
  else if (grayIndex < 2.0) n = 4194304.0;
  else if (grayIndex < 3.0) n = 131200.0;
  else if (grayIndex < 4.0) n = 324.0;
  else if (grayIndex < 5.0) n = 330.0;
  else if (grayIndex < 6.0) n = 283712.0;
  else if (grayIndex < 7.0) n = 12650880.0;
  else if (grayIndex < 8.0) n = 4532768.0;
  else if (grayIndex < 9.0) n = 13191552.0;
  else if (grayIndex < 10.0) n = 10648704.0;
  else if (grayIndex < 11.0) n = 11195936.0;
  else if (grayIndex < 12.0) n = 15218734.0;
  else if (grayIndex < 13.0) n = 15255086.0;
  else if (grayIndex < 14.0) n = 15252014.0;
  else if (grayIndex < 15.0) n = 15324974.0;
  else n = 11512810.0;

  vec2 p = fract(uv * 0.125);

  col = pow(col, vec3(0.55));
  col = col * character(n, p);

  float mixAmt = 1.0;
  col = mix(vec3(character(n, p)), col, mixAmt);

  gl_FragColor = vec4(col, 1.0);
}
`;