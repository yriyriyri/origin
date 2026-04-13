export const radialGlowVert = /* glsl */ `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const radialGlowFrag = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uGlowStrength;
uniform float uGlowRadius;
uniform float uRadialStrength;
uniform float uRadialFalloff;

varying vec2 vUv;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec3 src = texture2D(uTexture, vUv).rgb;

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      vec2 offset = vec2(float(x), float(y)) * texel * uGlowRadius;
      vec3 s = texture2D(uTexture, vUv + offset).rgb;

      float w = 1.0 - length(vec2(float(x), float(y))) / 4.25;
      w = max(w, 0.0);

      float bright = smoothstep(0.08, 0.95, luminance(s));
      w *= mix(0.35, 1.0, bright);

      sum += s * w;
      weightSum += w;
    }
  }

  vec3 blurred = sum / max(weightSum, 0.0001);
  vec3 glow = max(blurred - src * 0.35, 0.0);

  vec2 centered = vUv - 0.5;
  float dist = length(centered) * 2.0;
  float radial = pow(max(0.0, 1.0 - dist), uRadialFalloff);

  vec3 result = src + glow * uGlowStrength + glow * radial * uRadialStrength;

  gl_FragColor = vec4(result, 1.0);
}
`;