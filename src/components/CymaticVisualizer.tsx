"use client";

import {
  asciiPostFrag,
  asciiPostVert,
} from "@/components/shaders/asciiPost";
import {
  horizontalBlurFrag,
  horizontalBlurVert,
} from "@/components/shaders/horizontalBlur";
import {
  temporalChromaticAberrationFrag,
  temporalChromaticAberrationVert,
} from "@/components/shaders/temporalChromaticAberration";
import { useEffect, useRef } from "react";
import {
  radialGlowFrag,
  radialGlowVert,
} from "@/components/shaders/radialGlow";

type CymaticVisualizerProps = {
  value: number;
  opacity?: number;
};

type ModePair = {
  m: number;
  n: number;
};

type Rgb = {
  b: number;
  g: number;
  r: number;
};

type Particle = {
  energy: number;
  homeX: number;
  homeY: number;
  spin: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const copyVert = `
precision mediump float;

attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const copyFrag = `
precision mediump float;

uniform sampler2D uTexture;
varying vec2 vUv;

void main() {
  vec4 col = texture2D(uTexture, vUv);
  float luma = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
  float alpha = step(0.001, luma);
  gl_FragColor = vec4(col.rgb, alpha);
}
`;

const MODES: ModePair[] = [
  { n: 3, m: 5 },
  { n: 1, m: 4 },
  { n: 1, m: 5 },
  { n: 2, m: 7 },
];
const AGENT_COLORS: Rgb[] = [
  { r: 0.0, g: 0.0, b: 1.0 },
  { r: 1.0, g: 0.0, b: 0.0 },
  { r: 0.0, g: 1.0, b: 1.0 },
  { r: 1.0, g: 0.15, b: 0.72 },
];
const CENTER_REPEL_RADIUS = 0.18;
const CENTER_REPEL_STRENGTH = 0.0048;
const FIELD_EPSILON = 0.014;
const NODE_PULL_MIX = 0.78;
const NODE_PROJECTION_STEPS = 2;
const NODE_CLOSENESS_RANGE = 2.2;
const COLOR_MAX_STRENGTH = 1.0;
const COLOR_MIN_STRENGTH = 0.9;
const COLOR_BRIGHTNESS_BOOST = 1.01;
const HUE_SHIFT_MAX = 0.32;
const TARGET_AGENT_LUMA = 0.62;
const MAX_LUMA_LIFT = 1.0;
const ENABLE_RADIAL_GLOW = true;
const GLOW_OVERSCAN = 0.12;
const ASCII_PIXELATION = 0.82;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpColor = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
});

const getLuma = ({ r, g, b }: Rgb) =>
  r * 0.2126 + g * 0.7152 + b * 0.0722;

const liftColorToLuma = (color: Rgb, target: number, maxLift: number): Rgb => {
  const luma = getLuma(color);
  if (luma >= target) return color;

  const lift = clamp(
    (target - luma) / Math.max(1e-6, 1 - luma),
    0,
    maxLift
  );

  return lerpColor(color, { r: 1, g: 1, b: 1 }, lift);
};

const rgbToHsl = ({ r, g, b }: Rgb) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) * 0.5;
  const delta = max - min;

  if (delta < 1e-6) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return { h: hue / 6, s: saturation, l: lightness };
};

const hueToRgb = (p: number, q: number, t: number) => {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  if (s <= 1e-6) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
};

const shiftHue = (color: Rgb, amount: number): Rgb => {
  const hsl = rgbToHsl(color);
  return hslToRgb((hsl.h + amount) % 1, hsl.s, hsl.l);
};

const shiftHueTowardBrighterLuma = (color: Rgb, amount: number): Rgb => {
  const forward = shiftHue(color, amount);
  const backward = shiftHue(color, -amount);

  return getLuma(forward) >= getLuma(backward) ? forward : backward;
};

const getBlend = (value: number) => {
  const clamped = clamp(value, 1, MODES.length);
  const baseIndex = Math.min(MODES.length - 1, Math.max(0, Math.floor(clamped) - 1));
  const nextIndex = Math.min(MODES.length - 1, baseIndex + 1);
  const mix = nextIndex === baseIndex ? 0 : clamped - (baseIndex + 1);

  return {
    a: MODES[baseIndex],
    b: MODES[nextIndex],
    mix,
  };
};

const getBlendedAgentColor = (value: number) => {
  const clamped = clamp(value, 1, AGENT_COLORS.length);
  const baseIndex = Math.min(
    AGENT_COLORS.length - 1,
    Math.max(0, Math.floor(clamped) - 1)
  );
  const nextIndex = Math.min(AGENT_COLORS.length - 1, baseIndex + 1);
  const mix = nextIndex === baseIndex ? 0 : clamped - (baseIndex + 1);

  return lerpColor(AGENT_COLORS[baseIndex], AGENT_COLORS[nextIndex], mix);
};

const getPulseLegacyBlend = (value: number) => {
  const intoPulse = clamp(value - 2, 0, 1);
  const outOfPulse = clamp(value - 3, 0, 1);
  return intoPulse * (1 - outOfPulse);
};

const chladni = (x: number, y: number, mode: ModePair) => {
  const scale = Math.PI * 0.5;
  return (
    Math.cos(mode.n * scale * x) * Math.cos(mode.m * scale * y) -
    Math.cos(mode.m * scale * x) * Math.cos(mode.n * scale * y)
  );
};

const fieldValue = (x: number, y: number, value: number) => {
  const { a, b, mix } = getBlend(value);
  const fa = chladni(x, y, a);
  const fb = chladni(x, y, b);
  return lerp(fa, fb, mix);
};

const fieldEnergy = (x: number, y: number, value: number) => {
  const field = fieldValue(x, y, value);
  return field * field;
};

const sampleEnergyGradient = (x: number, y: number, value: number) => {
  const energy = fieldEnergy(x, y, value);
  const gradientX = (
    fieldEnergy(x + FIELD_EPSILON, y, value) -
    fieldEnergy(x - FIELD_EPSILON, y, value)
  ) / (FIELD_EPSILON * 2);
  const gradientY = (
    fieldEnergy(x, y + FIELD_EPSILON, value) -
    fieldEnergy(x, y - FIELD_EPSILON, value)
  ) / (FIELD_EPSILON * 2);

  return { energy, gradientX, gradientY };
};

const projectTowardNode = (x: number, y: number, value: number) => {
  const source = sampleEnergyGradient(x, y, value);
  let projectedX = x;
  let projectedY = y;
  let gradientX = source.gradientX;
  let gradientY = source.gradientY;

  for (let step = 0; step < NODE_PROJECTION_STEPS; step++) {
    const sample = sampleEnergyGradient(projectedX, projectedY, value);
    gradientX = sample.gradientX;
    gradientY = sample.gradientY;

    const gradientMag = Math.hypot(gradientX, gradientY);
    if (gradientMag < 1e-6) break;

    const stepSize = clamp(Math.sqrt(sample.energy) * 0.16, 0.014, 0.12);
    projectedX = clamp(projectedX - (gradientX / gradientMag) * stepSize, -1, 1);
    projectedY = clamp(projectedY - (gradientY / gradientMag) * stepSize, -1, 1);
  }

  return {
    gradientX,
    gradientY,
    sourceEnergy: source.energy,
    x: projectedX,
    y: projectedY,
  };
};

const randomParticle = (): Particle => {
  const x = Math.random() * 1.9 - 0.95;
  const y = Math.random() * 1.9 - 0.95;

  return {
    x,
    y,
    homeX: x,
    homeY: y,
    vx: Math.random() * 0.01 - 0.005,
    vy: Math.random() * 0.01 - 0.005,
    spin: Math.random() < 0.5 ? -1 : 1,
    energy: 1,
  };
};

export default function CymaticVisualizer({
  value,
  opacity = 1,
}: CymaticVisualizerProps) {
  const frameRef = useRef(0);
  const squareRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({
    dpr: 1,
    padX: 0,
    padY: 0,
    renderH: 0,
    renderW: 0,
    viewH: 0,
    viewW: 0,
  });
  const targetValueRef = useRef(value);
  const simValueRef = useRef(value);
  const opacityRef = useRef(opacity);

  targetValueRef.current = value;
  opacityRef.current = opacity;

  useEffect(() => {
    const square = squareRef.current;
    const simCanvas = simCanvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!square || !simCanvas || !glCanvas) return;

    const ctx = simCanvas.getContext("2d");
    if (!ctx) return;

    const gl = glCanvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });

    if (gl) {
      simCanvas.style.visibility = "hidden";
      glCanvas.style.display = "block";
    } else {
      simCanvas.style.visibility = "visible";
      glCanvas.style.display = "none";
    }

    const createShader = (
      context: WebGLRenderingContext,
      type: number,
      source: string
    ) => {
      const shader = context.createShader(type)!;
      context.shaderSource(shader, source);
      context.compileShader(shader);

      if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
        const info = context.getShaderInfoLog(shader);
        context.deleteShader(shader);
        throw new Error(info || "Shader compile failed");
      }

      return shader;
    };

    const createProgram = (
      context: WebGLRenderingContext,
      vert: string,
      frag: string
    ) => {
      const vs = createShader(context, context.VERTEX_SHADER, vert);
      const fs = createShader(context, context.FRAGMENT_SHADER, frag);

      const program = context.createProgram()!;
      context.attachShader(program, vs);
      context.attachShader(program, fs);
      context.linkProgram(program);

      if (!context.getProgramParameter(program, context.LINK_STATUS)) {
        const info = context.getProgramInfoLog(program);
        context.deleteProgram(program);
        throw new Error(info || "Program link failed");
      }

      return program;
    };

    let copyProgram: WebGLProgram | null = null;
    let blurProgram: WebGLProgram | null = null;
    let asciiProgram: WebGLProgram | null = null;
    let chromaticProgram: WebGLProgram | null = null;
    let glowProgram: WebGLProgram | null = null;
    let quadBuffer: WebGLBuffer | null = null;
    let sourceTexture: WebGLTexture | null = null;
    let passATexture: WebGLTexture | null = null;
    let passAFramebuffer: WebGLFramebuffer | null = null;
    let passBTexture: WebGLTexture | null = null;
    let passBFramebuffer: WebGLFramebuffer | null = null;

    let copyUniforms:
      | { texture: WebGLUniformLocation | null }
      | null = null;
    let blurUniforms:
      | {
          blurAmount: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          texture: WebGLUniformLocation | null;
        }
      | null = null;
    let asciiUniforms:
      | {
          mouse: WebGLUniformLocation | null;
          pixelation: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          texture: WebGLUniformLocation | null;
        }
      | null = null;
    let chromaticUniforms:
      | {
          resolution: WebGLUniformLocation | null;
          texture: WebGLUniformLocation | null;
          time: WebGLUniformLocation | null;
        }
      | null = null;
    let glowUniforms:
    | {
        texture: WebGLUniformLocation | null;
        resolution: WebGLUniformLocation | null;
        glowStrength: WebGLUniformLocation | null;
        glowRadius: WebGLUniformLocation | null;
        radialStrength: WebGLUniformLocation | null;
        radialFalloff: WebGLUniformLocation | null;
      }
    | null = null;

    const allocPassTargets = () => {
      if (
        !gl ||
        !passATexture ||
        !passAFramebuffer ||
        !passBTexture ||
        !passBFramebuffer
      ) {
        return;
      }

      const { dpr, renderH, renderW } = sizeRef.current;
      const rw = Math.max(1, Math.floor(renderW * dpr));
      const rh = Math.max(1, Math.floor(renderH * dpr));

      gl.bindTexture(gl.TEXTURE_2D, passATexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        rw,
        rh,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, passAFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        passATexture,
        0
      );

      gl.bindTexture(gl.TEXTURE_2D, passBTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        rw,
        rh,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, passBFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        passBTexture,
        0
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const bindFullscreenQuad = (program: WebGLProgram) => {
      if (!gl || !quadBuffer) return;

      const positionLoc = gl.getAttribLocation(program, "aPosition");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    };

    const renderPost = (timeMs: number) => {
      if (
        !gl ||
        !copyProgram ||
        !blurProgram ||
        !asciiProgram ||
        !chromaticProgram ||
        !glowProgram ||
        !copyUniforms ||
        !blurUniforms ||
        !asciiUniforms ||
        !chromaticUniforms ||
        !glowUniforms ||
        !sourceTexture ||
        !passATexture ||
        !passAFramebuffer ||
        !passBTexture ||
        !passBFramebuffer
      ) {
        return;
      }

      const { dpr, renderH, renderW } = sizeRef.current;
      const rw = Math.max(1, Math.floor(renderW * dpr));
      const rh = Math.max(1, Math.floor(renderH * dpr));
      const localCopyProgram = copyProgram;
      const localBlurProgram = blurProgram;
      const localAsciiProgram = asciiProgram;
      const localChromaticProgram = chromaticProgram;
      const localGlowProgram = glowProgram;
      const localCopyUniforms = copyUniforms;
      const localBlurUniforms = blurUniforms;
      const localAsciiUniforms = asciiUniforms;
      const localChromaticUniforms = chromaticUniforms;
      const localGlowUniforms = glowUniforms;
      const localSourceTexture = sourceTexture;
      const localPassATexture = passATexture;
      const localPassAFramebuffer = passAFramebuffer;
      const localPassBTexture = passBTexture;
      const localPassBFramebuffer = passBFramebuffer;

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, localSourceTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        simCanvas
      );

      let currentTexture = localSourceTexture;
      let writeToA = true;

      const renderPassToFbo = (
        program: WebGLProgram,
        uniforms: () => void,
        inputTexture: WebGLTexture
      ) => {
        const targetFramebuffer: WebGLFramebuffer = writeToA
          ? localPassAFramebuffer
          : localPassBFramebuffer;
        const targetTexture: WebGLTexture = writeToA
          ? localPassATexture
          : localPassBTexture;

        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
        gl.viewport(0, 0, rw, rh);
        gl.useProgram(program);
        bindFullscreenQuad(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        uniforms();
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        currentTexture = targetTexture;
        writeToA = !writeToA;
      };

      renderPassToFbo(
        localBlurProgram,
        () => {
          gl.uniform1i(localBlurUniforms.texture, 0);
          gl.uniform2f(localBlurUniforms.resolution, renderW, renderH);
          gl.uniform1f(localBlurUniforms.blurAmount, 6.0);
        },
        currentTexture
      );

      renderPassToFbo(
        localAsciiProgram,
        () => {
          gl.uniform1i(localAsciiUniforms.texture, 0);
          gl.uniform2f(localAsciiUniforms.resolution, renderW, renderH);
          gl.uniform2f(localAsciiUniforms.mouse, renderW * 0.5, renderH * 0.5);
          gl.uniform1f(localAsciiUniforms.pixelation, ASCII_PIXELATION);
        },
        currentTexture
      );

      renderPassToFbo(
        localChromaticProgram,
        () => {
          gl.uniform1i(localChromaticUniforms.texture, 0);
          gl.uniform1f(localChromaticUniforms.time, timeMs * 0.001);
          gl.uniform2f(localChromaticUniforms.resolution, renderW, renderH);
        },
        currentTexture
      );

      if (ENABLE_RADIAL_GLOW) {
        renderPassToFbo(
          localGlowProgram,
          () => {
            gl.uniform1i(localGlowUniforms.texture, 0);
            gl.uniform2f(localGlowUniforms.resolution, renderW, renderH);
            gl.uniform1f(localGlowUniforms.glowStrength, 1.8);
            gl.uniform1f(localGlowUniforms.glowRadius, 7.0);
            gl.uniform1f(localGlowUniforms.radialStrength, 0.8);
            gl.uniform1f(localGlowUniforms.radialFalloff, 1.45);
          },
          currentTexture
        );
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(localCopyProgram);
      bindFullscreenQuad(localCopyProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexture);
      gl.uniform1i(localCopyUniforms.texture, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    };

    if (gl) {
      copyProgram = createProgram(gl, copyVert, copyFrag);
      blurProgram = createProgram(gl, horizontalBlurVert, horizontalBlurFrag);
      asciiProgram = createProgram(gl, asciiPostVert, asciiPostFrag);
      chromaticProgram = createProgram(
        gl,
        temporalChromaticAberrationVert,
        temporalChromaticAberrationFrag
      );
      glowProgram = createProgram(gl, radialGlowVert, radialGlowFrag);

      quadBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ]),
        gl.STATIC_DRAW
      );

      sourceTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      passATexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, passATexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      passAFramebuffer = gl.createFramebuffer()!;

      passBTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, passBTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      passBFramebuffer = gl.createFramebuffer()!;

      copyUniforms = {
        texture: gl.getUniformLocation(copyProgram, "uTexture"),
      };
      blurUniforms = {
        texture: gl.getUniformLocation(blurProgram, "uTexture"),
        resolution: gl.getUniformLocation(blurProgram, "uResolution"),
        blurAmount: gl.getUniformLocation(blurProgram, "uBlurAmount"),
      };
      asciiUniforms = {
        texture: gl.getUniformLocation(asciiProgram, "uTexture"),
        resolution: gl.getUniformLocation(asciiProgram, "uResolution"),
        mouse: gl.getUniformLocation(asciiProgram, "uMouse"),
        pixelation: gl.getUniformLocation(asciiProgram, "uPixelation"),
      };
      chromaticUniforms = {
        texture: gl.getUniformLocation(chromaticProgram, "uTexture"),
        resolution: gl.getUniformLocation(chromaticProgram, "uResolution"),
        time: gl.getUniformLocation(chromaticProgram, "uTime"),
      };
      glowUniforms = {
        texture: gl.getUniformLocation(glowProgram, "uTexture"),
        resolution: gl.getUniformLocation(glowProgram, "uResolution"),
        glowStrength: gl.getUniformLocation(glowProgram, "uGlowStrength"),
        glowRadius: gl.getUniformLocation(glowProgram, "uGlowRadius"),
        radialStrength: gl.getUniformLocation(glowProgram, "uRadialStrength"),
        radialFalloff: gl.getUniformLocation(glowProgram, "uRadialFalloff"),
      };
    }

    const resize = () => {
      const viewWidth = Math.max(1, square.clientWidth);
      const viewHeight = Math.max(1, square.clientHeight);
      const padX = Math.round(viewWidth * GLOW_OVERSCAN);
      const padY = Math.round(viewHeight * GLOW_OVERSCAN);
      const renderWidth = viewWidth + padX * 2;
      const renderHeight = viewHeight + padY * 2;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      simCanvas.width = Math.floor(renderWidth * dpr);
      simCanvas.height = Math.floor(renderHeight * dpr);
      simCanvas.style.width = `${renderWidth}px`;
      simCanvas.style.height = `${renderHeight}px`;
      simCanvas.style.left = `${-padX}px`;
      simCanvas.style.top = `${-padY}px`;

      glCanvas.width = Math.floor(renderWidth * dpr);
      glCanvas.height = Math.floor(renderHeight * dpr);
      glCanvas.style.width = `${renderWidth}px`;
      glCanvas.style.height = `${renderHeight}px`;
      glCanvas.style.left = `${-padX}px`;
      glCanvas.style.top = `${-padY}px`;

      sizeRef.current = {
        dpr,
        padX,
        padY,
        renderH: renderHeight,
        renderW: renderWidth,
        viewH: viewHeight,
        viewW: viewWidth,
      };
      allocPassTargets();

      const particleCount = clamp(
        Math.round((viewWidth * viewHeight) / 150),
        1100,
        2200
      );
      particlesRef.current = Array.from({ length: particleCount }, randomParticle);
    };

    resize();

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(square);

    const loop = () => {
      frameRef.current = requestAnimationFrame(loop);

      if (opacityRef.current <= 0.01) {
        return;
      }

      const { dpr, padX, padY, renderH, renderW, viewH, viewW } = sizeRef.current;
      if (renderW <= 0 || renderH <= 0 || viewW <= 0 || viewH <= 0) {
        return;
      }

      simValueRef.current = lerp(
        simValueRef.current,
        targetValueRef.current,
        0.08
      );

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, renderW, renderH);

      const particles = particlesRef.current;
      const edge = 0.97;
      const agentColor = getBlendedAgentColor(simValueRef.current);

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        const projection = projectTowardNode(
          particle.homeX,
          particle.homeY,
          simValueRef.current
        );
        const desiredX = lerp(particle.homeX, projection.x, NODE_PULL_MIX);
        const desiredY = lerp(particle.homeY, projection.y, NODE_PULL_MIX);
        const gradientMag = Math.hypot(projection.gradientX, projection.gradientY) || 1e-6;
        const tangentX = -projection.gradientY / gradientMag;
        const tangentY = projection.gradientX / gradientMag;
        const energyBias = clamp(0.24 + projection.sourceEnergy * 0.65, 0.24, 1.6);
        const tangentialDrift = 0.00045 + Math.min(0.0009, projection.sourceEnergy * 0.00045);
        const jitter = 0.0012 * energyBias;
        const distToCenter = Math.hypot(particle.x, particle.y);

        particle.vx +=
          (desiredX - particle.x) * 0.05 +
          tangentX * tangentialDrift * particle.spin +
          (Math.random() * 2 - 1) * jitter;
        particle.vy +=
          (desiredY - particle.y) * 0.05 +
          tangentY * tangentialDrift * particle.spin +
          (Math.random() * 2 - 1) * jitter;

        if (distToCenter < CENTER_REPEL_RADIUS) {
          const angle = i * 2.399963229728653;
          const ux = distToCenter > 1e-4 ? particle.x / distToCenter : Math.cos(angle);
          const uy = distToCenter > 1e-4 ? particle.y / distToCenter : Math.sin(angle);
          const repel =
            Math.pow(1 - distToCenter / CENTER_REPEL_RADIUS, 2) *
            CENTER_REPEL_STRENGTH;

          particle.vx += ux * repel;
          particle.vy += uy * repel;
        }

        if (particle.x < -edge || particle.x > edge) {
          particle.vx += particle.x > 0 ? -0.003 : 0.003;
        }
        if (particle.y < -edge || particle.y > edge) {
          particle.vy += particle.y > 0 ? -0.003 : 0.003;
        }

        particle.vx *= 0.92;
        particle.vy *= 0.92;
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -1 || particle.x > 1) {
          particle.x = clamp(particle.x, -1, 1);
          particle.vx *= -0.35;
        }
        if (particle.y < -1 || particle.y > 1) {
          particle.y = clamp(particle.y, -1, 1);
          particle.vy *= -0.35;
        }

        particle.energy = fieldEnergy(
          particle.x,
          particle.y,
          simValueRef.current
        );
      }

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        const px = padX + (particle.x * 0.5 + 0.5) * viewW;
        const py = padY + (particle.y * 0.5 + 0.5) * viewH;
        const nodeBand = Math.pow(particle.energy, 0.65);
        const nodeCloseness = 1 - clamp(nodeBand / NODE_CLOSENESS_RANGE, 0, 1);
        const alpha = lerp(0.16, 0.98, nodeCloseness * nodeCloseness);
        const size = lerp(1.15, 2.85, nodeCloseness);
        const radialDistance = clamp(
          Math.hypot(particle.x, particle.y) / Math.SQRT2,
          0,
          1
        );
        const hueShiftAmount = HUE_SHIFT_MAX * Math.pow(radialDistance, 0.7);
        const pulseLegacyBlend = getPulseLegacyBlend(simValueRef.current);
        const shiftedColor = lerpColor(
          shiftHueTowardBrighterLuma(agentColor, hueShiftAmount),
          shiftHue(agentColor, hueShiftAmount),
          pulseLegacyBlend
        );
        const balancedColor = liftColorToLuma(
          shiftedColor,
          TARGET_AGENT_LUMA,
          MAX_LUMA_LIFT
        );
        const colorStrength = lerp(
          COLOR_MIN_STRENGTH,
          COLOR_MAX_STRENGTH,
          nodeCloseness
        );
        const whiteBase = 0.1;
        const r = Math.round(
          clamp(
            (whiteBase + balancedColor.r * colorStrength) *
              COLOR_BRIGHTNESS_BOOST,
            0,
            1
          ) * 255
        );
        const g = Math.round(
          clamp(
            (whiteBase + balancedColor.g * colorStrength) *
              COLOR_BRIGHTNESS_BOOST,
            0,
            1
          ) * 255
        );
        const b = Math.round(
          clamp(
            (whiteBase + balancedColor.b * colorStrength) *
              COLOR_BRIGHTNESS_BOOST,
            0,
            1
          ) * 255
        );

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(px - size * 0.5, py - size * 0.5, size, size);
      }

      renderPost(performance.now());
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();

      if (gl) {
        if (passAFramebuffer) gl.deleteFramebuffer(passAFramebuffer);
        if (passBFramebuffer) gl.deleteFramebuffer(passBFramebuffer);
        if (passATexture) gl.deleteTexture(passATexture);
        if (passBTexture) gl.deleteTexture(passBTexture);
        if (sourceTexture) gl.deleteTexture(sourceTexture);
        if (quadBuffer) gl.deleteBuffer(quadBuffer);
        if (copyProgram) gl.deleteProgram(copyProgram);
        if (blurProgram) gl.deleteProgram(blurProgram);
        if (asciiProgram) gl.deleteProgram(asciiProgram);
        if (chromaticProgram) gl.deleteProgram(chromaticProgram);
      }
    };
  }, []);

  return (
    <div className="root" style={{ opacity }}>
      <div className="square" ref={squareRef}>
        <canvas ref={simCanvasRef} className="simCanvas" />
        <canvas ref={glCanvasRef} className="canvas" />
      </div>

      <style jsx>{`
        .root {
          width: min(100%, 660px);
          transition: opacity 180ms linear;
          will-change: opacity;
        }

        .square {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
        }

        .canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }

        .simCanvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          visibility: hidden;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
