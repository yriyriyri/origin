"use client";

import { useEffect, useRef, useState } from "react";

import {
  temporalChromaticAberrationFrag,
  temporalChromaticAberrationVert,
} from "@/components/shaders/temporalChromaticAberration";

import {
  asciiPostFrag,
  asciiPostVert,
} from "@/components/shaders/asciiPost";

import {
  horizontalBlurFrag,
  horizontalBlurVert,
} from "@/components/shaders/horizontalBlur";

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
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

type Vec2 = { x: number; y: number };
const V = {
  add(a: Vec2, b: Vec2) { a.x += b.x; a.y += b.y; },
  subNew(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; },
  mag(v: Vec2) { return Math.hypot(v.x, v.y); },
  setMag(v: Vec2, m: number) {
    const n = V.mag(v) || 1;
    v.x = (v.x / n) * m;
    v.y = (v.y / n) * m;
  },
  normNew(v: Vec2): Vec2 {
    const n = V.mag(v) || 1;
    return { x: v.x / n, y: v.y / n };
  },
  limit(v: Vec2, max: number) {
    const m2 = v.x * v.x + v.y * v.y;
    if (m2 > max * max) {
      const m = Math.sqrt(m2);
      v.x = (v.x / m) * max;
      v.y = (v.y / m) * max;
    }
  },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const approxLen = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type MouseMode = "seek" | "flee" | "follow" | "off";

type SkeletonConfig = {
  enabled: boolean;
  visible?: boolean;
  segments: number;
  segmentLength: number;
  spineBarFrac: number;
  ribEvery: number;
  ribLength: number;
  ribTailCut: number;
  ribHeadMinFrac: number;
  ribPeakPos: number;
  ribAngleMinDeg: number;
  ribAngleMaxDeg: number;
  ribCurveOutMin?: number;
  ribCurveOutMax?: number;
  ribCurveBackMin?: number;
  ribCurveBackMax?: number;
  ribCurvePow?: number;
  tailRibLength?: number;
  headSize: number;
  headSpeed: number;
  maxTurn: number;
  avoidEdges: number;
  centerBias: number;
  color: string;
};

type Skeleton = {
  cfg: SkeletonConfig;
  nodes: Vec2[];
  prev: Vec2[];
  dir: Vec2;
  headPos: Vec2;
  headVel: Vec2;
  ribAnchors: Vec2[];
  ribTangents: Vec2[];
  spineAnchors: Vec2[];
  spineTangents: Vec2[];
  boneAnchors: Vec2[];
  boneTangents: Vec2[];
  drawAnchors: Vec2[];
  drawTangents: Vec2[];
};

type Boid = {
  p: Vec2;
  v: Vec2;
  a: Vec2;
  s: number;
  side: number;
  speedScale: number;
  anchorIdx?: number;
};

type WingConfig = {
  attractToRibs: number;
  followRibTangent: number;
  lateralBias: number;
  ribDist: number;
  trailBack?: number;
  leashMin?: number;
  leashMax?: number;
  jitter?: number;
};

type BoneConfig = {
  attractToSpine: number;
  followSpineVel: number;
  spineDist: number;
  nearest?: number;
  ribAttract?: number;
  ribFollow?: number;
  ribDist?: number;
  anchorAttract?: number;
  anchorFollow?: number;
  leashMin?: number;
  leashMax?: number;
  driftProb?: number;
};

type HeadConfig = {
  attractToHead: number;
  followHeadVel: number;
  headDist: number;
};

type SpeciesConfig = {
  id: "wing" | "bone" | "head" | "default";
  ratio: number;
  maxSpeedScale?: number;
  maxForceScale?: number;
  wAlignScale?: number;
  wCohScale?: number;
  wSepScale?: number;
  wMouseScale?: number;
  neighborDistScale?: number;
  wing?: WingConfig;
  bone?: BoneConfig;
  head?: HeadConfig;
  globalCohesion?: number;
  globalVelFollow?: number;
  globalMergeRadius?: number;
  spawnAtCenter?: boolean;
  spawnRadius?: number;
  opacity?: number;
  speedVarMin?: number;
  speedVarMax?: number;
};

type Preset = {
  maxSpeed: number;
  maxForce: number;
  neighborDist: number;
  desiredSeparation: number;
  wAlign: number;
  wCoh: number;
  wSep: number;
  wMouse: number;
  pixelSize: number;
  mouseRadius: number;
  mouseOuterFactor: number;
  mouseFleeMult: number;
  mouseBoost: number;
  seekAttractMult: number;
  seekBoost: number;
  seekDamping: number;
  mouseCoreFactor: number;
  mouseCoreRepelMult: number;
  sepBoostR1: number;
  localFlockDampen: number;
  homeWeight: number;
  species: SpeciesConfig[];
  skeleton: SkeletonConfig;
};

const LIFE_SIM_PRESET: Preset = {
  maxSpeed: 2.2,
  maxForce: 0.065,
  neighborDist: 70,
  desiredSeparation: 18,
  wAlign: 1.0,
  wCoh: 1.0,
  wSep: 1.0,
  wMouse: 0.6,
  pixelSize: 3,
  mouseRadius: 105,
  mouseOuterFactor: 1.2,
  mouseFleeMult: 6.5,
  mouseBoost: 0.55,
  seekAttractMult: 6.0,
  seekBoost: 0.55,
  seekDamping: 0.22,
  mouseCoreFactor: 0.1,
  mouseCoreRepelMult: 0.9,
  sepBoostR1: 1.6,
  localFlockDampen: 0.6,
  homeWeight: 0.1,

  species: [
    {
      id: "bone",
      ratio: 0.7,
      opacity: 1.0,
      maxSpeedScale: 1.25,
      maxForceScale: 1.2,
      wAlignScale: 0.3,
      wCohScale: 0.3,
      wSepScale: 0.3,
      neighborDistScale: 0.6,
      bone: {
        attractToSpine: 2.0,
        followSpineVel: 0.8,
        spineDist: 90,
        nearest: 2,
        ribAttract: 1.6,
        ribFollow: 0.5,
        ribDist: 110,
        anchorAttract: 4.5,
        anchorFollow: 1.2,
        leashMin: 8,
        leashMax: 28,
        driftProb: 0.01,
      },
      globalCohesion: 0,
      globalVelFollow: 0,
      globalMergeRadius: 0,
      spawnAtCenter: true,
      spawnRadius: 90,
      speedVarMin: 0.9,
      speedVarMax: 1.35,
    },
    {
      id: "head",
      ratio: 0.1,
      opacity: 0.9,
      maxSpeedScale: 1.15,
      maxForceScale: 1.1,
      wAlignScale: 0.9,
      wCohScale: 0.9,
      wSepScale: 1.5,
      neighborDistScale: 1,
      head: { attractToHead: 2.2, followHeadVel: 0.8, headDist: 220 },
      globalCohesion: 0,
      globalVelFollow: 0,
      globalMergeRadius: 0,
      spawnAtCenter: true,
      spawnRadius: 70,
      speedVarMin: 0.7,
      speedVarMax: 0.95,
    },
    {
      id: "wing",
      ratio: 0.2,
      opacity: 0.9,
      maxSpeedScale: 1.12,
      maxForceScale: 1.15,
      wAlignScale: 1.1,
      wCohScale: 0.35,
      wSepScale: 0.7,
      neighborDistScale: 0.9,
      wing: {
        attractToRibs: 2.2,
        followRibTangent: 1.8,
        lateralBias: 0.25,
        ribDist: 110,
        trailBack: 120,
        leashMin: 6,
        leashMax: 26,
        jitter: 1.5,
      },
      globalCohesion: 0,
      globalVelFollow: 0,
      globalMergeRadius: 0,
      spawnAtCenter: true,
      spawnRadius: 130,
      speedVarMin: 0.9,
      speedVarMax: 1.2,
    },
  ],

  skeleton: {
    enabled: true,
    visible: false,
    segments: 30,
    segmentLength: 30,
    spineBarFrac: 0.68,
    ribEvery: 3,
    ribLength: 200,
    ribTailCut: 0.18,
    ribHeadMinFrac: 0.18,
    ribPeakPos: 0.35,
    ribAngleMinDeg: 50,
    ribAngleMaxDeg: 65,
    ribCurveOutMin: 0.15,
    ribCurveOutMax: 0.55,
    ribCurveBackMin: 0.08,
    ribCurveBackMax: 0.22,
    ribCurvePow: 1.2,
    tailRibLength: 70,
    headSize: 30,
    headSpeed: 2.2,
    maxTurn: Math.PI / 90,
    avoidEdges: 2,
    centerBias: 0.012,
    color: "#fff",
  },
};

const COUNTS = [600, 1200, 2000, 2500, 3000] as const;

export default function Boids() {
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [countIndex, setCountIndex] = useState(1);

  const [mouseMode, setMouseMode] = useState<MouseMode>("seek");
  const mouseModeRef = useRef<MouseMode>("seek");
  mouseModeRef.current = mouseMode;

  const presetRef = useRef<Preset>(LIFE_SIM_PRESET);
  presetRef.current = LIFE_SIM_PRESET;

  const boidsRef = useRef<Boid[]>([]);
  const mouseRef = useRef<Vec2 | null>(null);
  const runningRef = useRef(true);
  const gridRef = useRef<Map<string, number[]>>(new Map());
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const skeletonRef = useRef<Skeleton | null>(null);

  const ENABLE_HORIZONTAL_BLUR = true;
  const ENABLE_ASCII = true;
  const ENABLE_CHROMATIC = false;

  const rand = (min: number, max: number) => Math.random() * (max - min) + min;

  const createShader = (
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
  
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "Shader compile failed");
    }
  
    return shader;
  };
  
  const createProgram = (
    gl: WebGLRenderingContext,
    vert: string,
    frag: string
  ) => {
    const vs = createShader(gl, gl.VERTEX_SHADER, vert);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, frag);
  
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
  
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(info || "Program link failed");
    }
  
    return program;
  };

  const speedToRgb = (speed: number, minSpeed: number, maxSpeed: number) => {
    const t = clamp((speed - minSpeed) / Math.max(1e-6, maxSpeed - minSpeed), 0, 1);
  
    const shaped = Math.pow(t, 3.8);
  
    let r: number;
    let g: number;
    let b: number;
  
    if (shaped < 0.5) {
      const u = shaped / 0.5;
      r = 0;
      g = Math.round(255 * u);
      b = 255;
    } else {
      const u = (shaped - 0.5) / 0.5;
      r = 255;
      g = Math.round(255 * (1 - u));
      b = Math.round(255 * (1 - u));
    }
  
    return { r, g, b };
  };

  const toroidalDelta = (from: Vec2, to: Vec2, W: number, H: number): Vec2 => {
    let dx = to.x - from.x;
    if (dx > W * 0.5) dx -= W;
    else if (dx < -W * 0.5) dx += W;

    let dy = to.y - from.y;
    if (dy > H * 0.5) dy -= H;
    else if (dy < -H * 0.5) dy += H;

    return { x: dx, y: dy };
  };

  const normalizeSpecies = (preset: Preset): SpeciesConfig[] => {
    const sum = preset.species.reduce((acc, s) => acc + s.ratio, 0) || 1;
    return preset.species.map((s) => ({ ...s, ratio: s.ratio / sum }));
  };

  const initSkeleton = () => {
    const p = presetRef.current;
    if (!p.skeleton.enabled) {
      skeletonRef.current = null;
      return;
    }

    const { w, h } = sizeRef.current;
    const cfg = p.skeleton;
    const nodes: Vec2[] = [];
    const prev: Vec2[] = [];
    const head: Vec2 = { x: w * 0.5, y: h * 0.5 };
    const dir: Vec2 = V.normNew({ x: 1, y: 0 });

    nodes.push({ x: head.x, y: head.y });
    prev.push({ x: head.x, y: head.y });

    for (let i = 1; i <= cfg.segments; i++) {
      const pt = {
        x: head.x - dir.x * cfg.segmentLength * i,
        y: head.y - dir.y * cfg.segmentLength * i,
      };
      nodes.push(pt);
      prev.push({ x: pt.x, y: pt.y });
    }

    skeletonRef.current = {
      cfg,
      nodes,
      prev,
      dir,
      headPos: { x: head.x, y: head.y },
      headVel: { x: 0, y: 0 },
      ribAnchors: [],
      ribTangents: [],
      spineAnchors: [],
      spineTangents: [],
      boneAnchors: [],
      boneTangents: [],
      drawAnchors: [],
      drawTangents: [],
    };
  };

  const rebuildGrid = (neighborDist: number) => {
    const grid = gridRef.current;
    grid.clear();

    const { w, h } = sizeRef.current;
    const cell = Math.max(8, neighborDist);

    boidsRef.current.forEach((b, idx) => {
      let x = b.p.x;
      let y = b.p.y;
      if (x < 0) x += w;
      if (x >= w) x -= w;
      if (y < 0) y += h;
      if (y >= h) y -= h;

      const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      const arr = grid.get(k);
      if (arr) arr.push(idx);
      else grid.set(k, [idx]);
    });

    return { cell };
  };

  const rebuildAnchors = (sk: Skeleton, W: number, H: number) => {
    const C = sk.cfg;

    const ribA: Vec2[] = [];
    const ribT: Vec2[] = [];
    const spineA: Vec2[] = [];
    const spineT: Vec2[] = [];
    const drawA: Vec2[] = [];
    const drawT: Vec2[] = [];

    const hs = C.headSize;
    const half = hs * 0.5;
    const hcx = sk.nodes[0].x;
    const hcy = sk.nodes[0].y;
    const headSamplesPerEdge = Math.max(6, Math.round(hs / 8));

    const pushHeadPoint = (x: number, y: number, tx: number, ty: number) => {
      drawA.push({ x, y });
      drawT.push({ x: tx, y: ty });
    };

    for (let i = 0; i < headSamplesPerEdge; i++) {
      const t = (i + 0.5) / headSamplesPerEdge;
      pushHeadPoint(hcx - half + t * hs, hcy - half, 1, 0);
    }
    for (let i = 0; i < headSamplesPerEdge; i++) {
      const t = (i + 0.5) / headSamplesPerEdge;
      pushHeadPoint(hcx + half, hcy - half + t * hs, 0, 1);
    }
    for (let i = 0; i < headSamplesPerEdge; i++) {
      const t = (i + 0.5) / headSamplesPerEdge;
      pushHeadPoint(hcx + half - t * hs, hcy + half, -1, 0);
    }
    for (let i = 0; i < headSamplesPerEdge; i++) {
      const t = (i + 0.5) / headSamplesPerEdge;
      pushHeadPoint(hcx - half, hcy + half - t * hs, 0, -1);
    }

    const barLen = C.segmentLength * C.spineBarFrac;
    const spineSamples = Math.max(2, Math.ceil(barLen / 8));

    for (let i = 1; i < sk.nodes.length - 1; i++) {
      const prev = sk.nodes[i - 1];
      const next = sk.nodes[i + 1];
      const mid = sk.nodes[i];
      const t = toroidalDelta(prev, next, W, H);
      const tm = V.mag(t) || 1e-6;
      const tx = t.x / tm;
      const ty = t.y / tm;

      for (let s = 0; s < spineSamples; s++) {
        const u = (s + 0.5) / spineSamples;
        const a = -0.5 * barLen + u * barLen;
        const px = mid.x + tx * a;
        const py = mid.y + ty * a;
        spineA.push({ x: px, y: py });
        spineT.push({ x: tx, y: ty });
        drawA.push({ x: px, y: py });
        drawT.push({ x: tx, y: ty });
      }
    }

    const lastRibIndexCut = Math.floor((1 - C.ribTailCut) * (sk.nodes.length - 1));
    const deg2rad = Math.PI / 180;
    let lastOriginalRibLen = Math.max(1, C.ribLength * 0.3);

    const ribIdxList: number[] = [];
    for (let i = 1; i < sk.nodes.length - 1; i++) {
      if (C.ribEvery > 1 && i % C.ribEvery !== 0) continue;
      if (i >= lastRibIndexCut) continue;
      ribIdxList.push(i);
    }

    const K = Math.min(3, ribIdxList.length);
    const tailScale = new Map<number, number>();
    const tapers = [0.6, 0.35, 0.12];
    for (let j = 0; j < K; j++) {
      const idx = ribIdxList[ribIdxList.length - K + j];
      tailScale.set(idx, tapers[j]);
    }

    for (const i of ribIdxList) {
      const prev = sk.nodes[i - 1];
      const next = sk.nodes[i + 1];
      const mid = sk.nodes[i];

      const tPos = i / (sk.nodes.length - 1);
      const headRise = smoothstep(0, C.ribPeakPos, tPos);
      const tailFall = 1 - smoothstep(1 - C.ribTailCut, 1, tPos);
      const peakBlend = Math.min(headRise, tailFall);
      let sizeFrac = clamp(C.ribHeadMinFrac + (1 - C.ribHeadMinFrac) * peakBlend, 0, 1);

      const extraTailScale = tailScale.get(i) ?? 1.0;
      sizeFrac *= extraTailScale;

      const L = C.ribLength * sizeFrac;
      if (L < 1) continue;

      if (i === ribIdxList[ribIdxList.length - 1]) {
        lastOriginalRibLen = L;
      }

      const tan = toroidalDelta(prev, next, W, H);
      const tmag = V.mag(tan) || 1e-6;
      const tx = tan.x / tmag;
      const ty = tan.y / tmag;
      const nx = -ty;
      const ny = tx;

      const phiDeg = C.ribAngleMinDeg + (C.ribAngleMaxDeg - C.ribAngleMinDeg) * (1 - sizeFrac);
      const phi = phiDeg * deg2rad;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      const dirL: Vec2 = { x: tx * cosP + nx * sinP, y: ty * cosP + ny * sinP };
      const dirR: Vec2 = { x: tx * cosP - nx * sinP, y: ty * cosP - ny * sinP };

      const endL: Vec2 = { x: mid.x + dirL.x * L, y: mid.y + dirL.y * L };
      const endR: Vec2 = { x: mid.x + dirR.x * L, y: mid.y + dirR.y * L };

      const curveT = Math.pow(1 - sizeFrac, sk.cfg.ribCurvePow ?? 1);
      const outMin = sk.cfg.ribCurveOutMin ?? 0.15;
      const outMax = sk.cfg.ribCurveOutMax ?? 0.55;
      const backMin = sk.cfg.ribCurveBackMin ?? 0.08;
      const backMax = sk.cfg.ribCurveBackMax ?? 0.22;
      const curveOut = lerp(outMin, outMax, curveT);
      const curveBack = lerp(backMin, backMax, curveT);

      const ctrlL: Vec2 = {
        x: mid.x + dirL.x * (L * 0.55) + nx * (curveOut * L) - tx * (curveBack * L),
        y: mid.y + dirL.y * (L * 0.55) + ny * (curveOut * L) - ty * (curveBack * L),
      };
      const ctrlR: Vec2 = {
        x: mid.x + dirR.x * (L * 0.55) - nx * (curveOut * L) - tx * (curveBack * L),
        y: mid.y + dirR.y * (L * 0.55) - ny * (curveOut * L) - ty * (curveBack * L),
      };

      const estL =
        (approxLen(mid, ctrlL) + approxLen(ctrlL, endL)) / 2 +
        (approxLen(mid, ctrlR) + approxLen(ctrlR, endR)) / 2;
      const samples = Math.max(3, Math.ceil(estL / 14));

      for (let s = 0; s < samples; s++) {
        const t = (s + 0.5) / samples;
        const u = 1 - t;
        const x = u * u * mid.x + 2 * u * t * ctrlL.x + t * t * endL.x;
        const y = u * u * mid.y + 2 * u * t * ctrlL.y + t * t * endL.y;
        let dx = 2 * u * (ctrlL.x - mid.x) + 2 * t * (endL.x - ctrlL.x);
        let dy = 2 * u * (ctrlL.y - mid.y) + 2 * t * (endL.y - ctrlL.y);
        const m = Math.hypot(dx, dy) || 1e-6;
        dx /= m;
        dy /= m;
        ribA.push({ x, y });
        ribT.push({ x: dx, y: dy });
        drawA.push({ x, y });
        drawT.push({ x: dx, y: dy });
      }

      for (let s = 0; s < samples; s++) {
        const t = (s + 0.5) / samples;
        const u = 1 - t;
        const x = u * u * mid.x + 2 * u * t * ctrlR.x + t * t * endR.x;
        const y = u * u * mid.y + 2 * u * t * ctrlR.y + t * t * endR.y;
        let dx = 2 * u * (ctrlR.x - mid.x) + 2 * t * (endR.x - ctrlR.x);
        let dy = 2 * u * (ctrlR.y - mid.y) + 2 * t * (endR.y - ctrlR.y);
        const m = Math.hypot(dx, dy) || 1e-6;
        dx /= m;
        dy /= m;
        ribA.push({ x, y });
        ribT.push({ x: dx, y: dy });
        drawA.push({ x, y });
        drawT.push({ x: dx, y: dy });
      }
    }

    {
      const N = sk.nodes.length;
      const candidates = [N - 4, N - 3, N - 2].filter((i) => i > 0 && i < N - 1);
      const ribSet = new Set(ribIdxList);
      const tailIdxs = candidates.filter((i) => !ribSet.has(i));

      if (tailIdxs.length > 0) {
        const tailFinalLen = C.tailRibLength ?? C.ribLength * 0.3;

        for (let k = 0; k < tailIdxs.length; k++) {
          const i = tailIdxs[k];
          const tBlend = (k + 1) / tailIdxs.length;
          const L = lerp(lastOriginalRibLen, tailFinalLen, tBlend);
          if (L < 1) continue;

          const prev = sk.nodes[i - 1];
          const next = sk.nodes[i + 1];
          const mid = sk.nodes[i];

          const sizeFrac = clamp(L / C.ribLength, 0, 1);

          const tan = toroidalDelta(prev, next, W, H);
          const tmag = V.mag(tan) || 1e-6;
          const tx = tan.x / tmag;
          const ty = tan.y / tmag;
          const nx = -ty;
          const ny = tx;

          const phiDeg = C.ribAngleMinDeg + (C.ribAngleMaxDeg - C.ribAngleMinDeg) * (1 - sizeFrac);
          const phi = deg2rad * phiDeg;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          const dirL: Vec2 = { x: tx * cosP + nx * sinP, y: ty * cosP + ny * sinP };
          const dirR: Vec2 = { x: tx * cosP - nx * sinP, y: ty * cosP - ny * sinP };

          const endL: Vec2 = { x: mid.x + dirL.x * L, y: mid.y + dirL.y * L };
          const endR: Vec2 = { x: mid.x + dirR.x * L, y: mid.y + dirR.y * L };

          const curveT = Math.pow(1 - sizeFrac, sk.cfg.ribCurvePow ?? 1);
          const outMin = sk.cfg.ribCurveOutMin ?? 0.15;
          const outMax = sk.cfg.ribCurveOutMax ?? 0.55;
          const backMin = sk.cfg.ribCurveBackMin ?? 0.08;
          const backMax = sk.cfg.ribCurveBackMax ?? 0.22;
          const curveOut = lerp(outMin, outMax, curveT);
          const curveBack = lerp(backMin, backMax, curveT);

          const ctrlL: Vec2 = {
            x: mid.x + dirL.x * (L * 0.55) + nx * (curveOut * L) - tx * (curveBack * L),
            y: mid.y + dirL.y * (L * 0.55) + ny * (curveOut * L) - ty * (curveBack * L),
          };
          const ctrlR: Vec2 = {
            x: mid.x + dirR.x * (L * 0.55) - nx * (curveOut * L) - tx * (curveBack * L),
            y: mid.y + dirR.y * (L * 0.55) - ny * (curveOut * L) - ty * (curveBack * L),
          };

          const estL =
            (approxLen(mid, ctrlL) + approxLen(ctrlL, endL)) / 2 +
            (approxLen(mid, ctrlR) + approxLen(ctrlR, endR)) / 2;
          const samples = Math.max(3, Math.ceil(estL / 14));

          for (let s = 0; s < samples; s++) {
            const t = (s + 0.5) / samples;
            const u = 1 - t;
            const x = u * u * mid.x + 2 * u * t * ctrlL.x + t * t * endL.x;
            const y = u * u * mid.y + 2 * u * t * ctrlL.y + t * t * endL.y;
            let dx = 2 * u * (ctrlL.x - mid.x) + 2 * t * (endL.x - ctrlL.x);
            let dy = 2 * u * (ctrlL.y - mid.y) + 2 * t * (endL.y - ctrlL.y);
            const m = Math.hypot(dx, dy) || 1e-6;
            dx /= m;
            dy /= m;
            ribA.push({ x, y });
            ribT.push({ x: dx, y: dy });
            drawA.push({ x, y });
            drawT.push({ x: dx, y: dy });
          }

          for (let s = 0; s < samples; s++) {
            const t = (s + 0.5) / samples;
            const u = 1 - t;
            const x = u * u * mid.x + 2 * u * t * ctrlR.x + t * t * endR.x;
            const y = u * u * mid.y + 2 * u * t * ctrlR.y + t * t * endR.y;
            let dx = 2 * u * (ctrlR.x - mid.x) + 2 * t * (endR.x - ctrlR.x);
            let dy = 2 * u * (ctrlR.y - mid.y) + 2 * t * (endR.y - ctrlR.y);
            const m = Math.hypot(dx, dy) || 1e-6;
            dx /= m;
            dy /= m;
            ribA.push({ x, y });
            ribT.push({ x: dx, y: dy });
            drawA.push({ x, y });
            drawT.push({ x: dx, y: dy });
          }
        }
      }
    }

    sk.ribAnchors = ribA;
    sk.ribTangents = ribT;
    sk.spineAnchors = spineA;
    sk.spineTangents = spineT;
    sk.boneAnchors = spineA.concat(ribA);
    sk.boneTangents = spineT.concat(ribT);
    sk.drawAnchors = drawA;
    sk.drawTangents = drawT;
  };

  const stepSkeleton = () => {
    const sk = skeletonRef.current;
    if (!sk) return;

    const { w, h } = sizeRef.current;
    const { cfg, nodes, prev } = sk;

    for (let i = 0; i < nodes.length; i++) {
      prev[i].x = nodes[i].x;
      prev[i].y = nodes[i].y;
    }

    const head = nodes[0];
    const center = { x: w * 0.5, y: h * 0.5 };
    const dTheta = rand(-cfg.maxTurn, cfg.maxTurn);

    let steer = { x: 0, y: 0 };
    const toCtr = V.subNew(center, head);
    V.setMag(toCtr, cfg.centerBias);
    steer.x += toCtr.x;
    steer.y += toCtr.y;

    const mode = mouseModeRef.current;
    const mouse = mouseRef.current;
    if (mode === "follow" && mouse) {
      const toMouse = toroidalDelta(head, mouse, w, h);
      const m = Math.hypot(toMouse.x, toMouse.y) || 1e-6;
      const ux = toMouse.x / m;
      const uy = toMouse.y / m;
      const followGain = cfg.centerBias * 6;
      steer.x += ux * followGain;
      steer.y += uy * followGain;
    }

    let dir = sk.dir;
    const cos = Math.cos(dTheta);
    const sin = Math.sin(dTheta);
    const rot = { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos };
    rot.x += steer.x;
    rot.y += steer.y;
    dir = V.normNew(rot);
    sk.dir = dir;

    head.x += dir.x * cfg.headSpeed;
    head.y += dir.y * cfg.headSpeed;

    if (head.x < 0) head.x += w;
    else if (head.x >= w) head.x -= w;
    if (head.y < 0) head.y += h;
    else if (head.y >= h) head.y -= h;

    for (let i = 1; i < nodes.length; i++) {
      const target = nodes[i - 1];
      const cur = nodes[i];
      const d = toroidalDelta(target, cur, w, h);
      const m = Math.hypot(d.x, d.y) || 1e-6;
      const u = { x: d.x / m, y: d.y / m };
      cur.x = target.x + u.x * cfg.segmentLength;
      cur.y = target.y + u.y * cfg.segmentLength;

      if (cur.x < 0) cur.x += w;
      else if (cur.x >= w) cur.x -= w;
      if (cur.y < 0) cur.y += h;
      else if (cur.y >= h) cur.y -= h;
    }

    const hv = toroidalDelta(sk.prev[0], sk.nodes[0], w, h);
    sk.headPos = { x: sk.nodes[0].x, y: sk.nodes[0].y };
    sk.headVel = { x: hv.x, y: hv.y };

    rebuildAnchors(sk, w, h);
  };

  const resetBoids = () => {
    const { w, h } = sizeRef.current;
    const total = COUNTS[countIndex];
    const speciesList = normalizeSpecies(presetRef.current);
    const sk = skeletonRef.current;

    const counts: number[] = [];
    let used = 0;
    for (let i = 0; i < speciesList.length; i++) {
      const c =
        i === speciesList.length - 1
          ? Math.max(0, total - used)
          : Math.round(total * speciesList[i].ratio);
      counts.push(c);
      used += c;
    }

    const cx = w * 0.5;
    const cy = h * 0.5;
    const arr: Boid[] = [];

    for (let s = 0; s < speciesList.length; s++) {
      const sc = speciesList[s];
      const centerSpawn = !!sc.spawnAtCenter;
      const rSpawn = sc.spawnRadius ?? 0;
      const svMin = sc.speedVarMin ?? 1.0;
      const svMax = sc.speedVarMax ?? 1.0;

      let anchorLen = 0;
      if (sc.id === "bone" && sk) anchorLen = sk.boneAnchors.length;
      if (sc.id === "wing" && sk) anchorLen = sk.ribAnchors.length;

      let step = 1;
      let nextAnchor = 0;
      if ((sc.id === "bone" || sc.id === "wing") && anchorLen > 0 && counts[s] > 0) {
        step = Math.max(1, Math.floor(anchorLen / counts[s]));
        nextAnchor = Math.floor(rand(0, step));
      }

      for (let i = 0; i < counts[s]; i++) {
        let x: number;
        let y: number;

        if (centerSpawn) {
          const ang = rand(0, Math.PI * 2);
          const r = Math.sqrt(rand(0, 1)) * rSpawn;
          x = cx + Math.cos(ang) * r;
          y = cy + Math.sin(ang) * r;
        } else {
          x = rand(0, w);
          y = rand(0, h);
        }

        const boid: Boid = {
          p: { x, y },
          v: { x: rand(-1, 1), y: rand(-1, 1) },
          a: { x: 0, y: 0 },
          s,
          side: Math.random() < 0.5 ? -1 : 1,
          speedScale: rand(svMin, svMax),
        };

        if ((sc.id === "bone" || sc.id === "wing") && anchorLen > 0) {
          boid.anchorIdx = (nextAnchor + Math.floor(rand(0, step))) % anchorLen;
          nextAnchor = (nextAnchor + step) % anchorLen;
        }

        arr.push(boid);
      }
    }

    boidsRef.current = arr;
  };

  const resize = () => {
    const simCanvas = simCanvasRef.current!;
    const glCanvas = glCanvasRef.current!;
  
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = glCanvas.getBoundingClientRect();
  
    sizeRef.current = {
      w: Math.floor(rect.width),
      h: Math.floor(rect.height),
      dpr,
    };
  
    simCanvas.width = Math.floor(rect.width * dpr);
    simCanvas.height = Math.floor(rect.height * dpr);
    simCanvas.style.width = `${rect.width}px`;
    simCanvas.style.height = `${rect.height}px`;
  
    glCanvas.width = Math.floor(rect.width * dpr);
    glCanvas.height = Math.floor(rect.height * dpr);
  };

  const stepBoids = () => {
    const { w, h } = sizeRef.current;
    const base = presetRef.current;
    const boids = boidsRef.current;

    const {
      neighborDist,
      desiredSeparation,
      maxSpeed,
      maxForce,
      wAlign,
      wCoh,
      wSep,
      wMouse,
      mouseRadius: R1,
      mouseOuterFactor,
      mouseFleeMult,
      mouseBoost,
      seekAttractMult,
      seekBoost,
      seekDamping,
      mouseCoreFactor,
      mouseCoreRepelMult,
      sepBoostR1,
      localFlockDampen,
      homeWeight,
    } = base;

    const speciesList = normalizeSpecies(base);
    const speciesCount = speciesList.length;
    const R0 = R1 * mouseCoreFactor;
    const R2 = R1 * mouseOuterFactor;
    const { cell } = rebuildGrid(neighborDist);

    const sumPos: Vec2[] = Array.from({ length: speciesCount }, () => ({ x: 0, y: 0 }));
    const sumVel: Vec2[] = Array.from({ length: speciesCount }, () => ({ x: 0, y: 0 }));
    const cnt: number[] = Array.from({ length: speciesCount }, () => 0);

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      sumPos[b.s].x += b.p.x;
      sumPos[b.s].y += b.p.y;
      sumVel[b.s].x += b.v.x;
      sumVel[b.s].y += b.v.y;
      cnt[b.s]++;
    }

    const COM: Vec2[] = sumPos.map((s, si) => ({
      x: cnt[si] ? s.x / cnt[si] : 0,
      y: cnt[si] ? s.y / cnt[si] : 0,
    }));

    const VEL: Vec2[] = sumVel.map((s, si) => {
      const c = cnt[si] || 1;
      const vx = s.x / c;
      const vy = s.y / c;
      const m = Math.hypot(vx, vy) || 1;
      return { x: vx / m, y: vy / m };
    });

    const mouse = mouseRef.current;
    const mode = mouseModeRef.current;
    const center: Vec2 = { x: w * 0.5, y: h * 0.5 };
    const grid = gridRef.current;
    const sk = skeletonRef.current;

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const sc = speciesList[b.s];
      const nScale = sc.neighborDistScale ?? 1;
      const neighR = neighborDist * nScale;
      const neighR2 = neighR * neighR;

      const maxSpeedEff = maxSpeed * (sc.maxSpeedScale ?? 1) * b.speedScale;
      const maxForceEff = maxForce * (sc.maxForceScale ?? 1);
      const wAlignEff = wAlign * (sc.wAlignScale ?? 1);
      const wCohEff = wCoh * (sc.wCohScale ?? 1);
      const wSepEff = wSep * (sc.wSepScale ?? 1);
      const wMouseEff = wMouse * (sc.wMouseScale ?? 1);

      b.a.x = 0;
      b.a.y = 0;

      let inR0 = false;
      let inR1 = false;
      let inR2 = false;
      let nx = 0;
      let ny = 0;
      let d = 0;
      let d2 = 0;

      if (mouse) {
        const dx = mouse.x - b.p.x;
        const dy = mouse.y - b.p.y;
        d2 = dx * dx + dy * dy;
        inR0 = d2 < R0 * R0;
        inR1 = !inR0 && d2 < R1 * R1;
        inR2 = !inR1 && d2 < R2 * R2;
        if (inR0 || inR1 || inR2) {
          d = Math.sqrt(d2) || 1e-6;
          nx = dx / d;
          ny = dy / d;
        }
      }

      const cx = Math.floor(b.p.x / cell);
      const cy = Math.floor(b.p.y / cell);

      let countSame = 0;
      const align: Vec2 = { x: 0, y: 0 };
      const coh: Vec2 = { x: 0, y: 0 };
      const sep: Vec2 = { x: 0, y: 0 };

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const k = `${cx + ox},${cy + oy}`;
          const list = grid.get(k);
          if (!list) continue;

          for (const idx of list) {
            if (idx === i) continue;
            const o = boids[idx];
            const dx = o.p.x - b.p.x;
            const dy = o.p.y - b.p.y;
            const dd2 = dx * dx + dy * dy;

            if (dd2 < neighR2) {
              if (dd2 > 0.0001) {
                const dd = Math.sqrt(dd2);
                const inv = 1 / dd;
                const push = Math.max(0, desiredSeparation - dd) * inv;
                sep.x -= dx * push;
                sep.y -= dy * push;
              }

              if (o.s === b.s) {
                countSame++;
                align.x += o.v.x;
                align.y += o.v.y;
                coh.x += o.p.x;
                coh.y += o.p.y;
              }
            }
          }
        }
      }

      if (countSame > 0) {
        const flockScale = inR1 || inR0 ? localFlockDampen : 1.0;
        const sepScale = inR1 || inR0 ? sepBoostR1 : 1.0;

        align.x /= countSame;
        align.y /= countSame;
        V.setMag(align, maxSpeedEff);
        align.x -= b.v.x;
        align.y -= b.v.y;
        V.limit(align, maxForceEff);
        align.x *= wAlignEff * flockScale;
        align.y *= wAlignEff * flockScale;

        coh.x /= countSame;
        coh.y /= countSame;
        const toCenter = V.subNew(coh, b.p);
        V.setMag(toCenter, maxSpeedEff);
        toCenter.x -= b.v.x;
        toCenter.y -= b.v.y;
        V.limit(toCenter, maxForceEff);
        toCenter.x *= wCohEff * flockScale;
        toCenter.y *= wCohEff * flockScale;

        V.limit(sep, maxForceEff);
        sep.x *= wSepEff * sepScale;
        sep.y *= wSepEff * sepScale;

        V.add(b.a, align);
        V.add(b.a, toCenter);
        V.add(b.a, sep);
      }

      if (sk) {
        if (sc.wing && sk.ribAnchors.length > 0) {
          const A = sk.ribAnchors.length;

          if (b.anchorIdx == null) b.anchorIdx = i % A;
          if (b.anchorIdx < 0 || b.anchorIdx >= A) b.anchorIdx = (b.anchorIdx % A + A) % A;

          const anchor = sk.ribAnchors[b.anchorIdx];
          const tanRaw = sk.ribTangents[b.anchorIdx];
          const tm = Math.hypot(tanRaw.x, tanRaw.y) || 1e-6;
          const tx = tanRaw.x / tm;
          const ty = tanRaw.y / tm;
          const px = -ty;
          const py = tx;

          const trail = sc.wing.trailBack ?? 40;
          const jitterAmp = sc.wing.jitter ?? 0;
          const tNow = performance.now() * 0.001;
          const jitter = jitterAmp * Math.sin(tNow * 1.5 + i * 0.7);

          const lateral = (sc.wing.lateralBias ?? 0) * 0.5 * b.side + jitter;
          const target = {
            x: anchor.x - tx * trail + px * lateral,
            y: anchor.y - ty * trail + py * lateral,
          };

          const leashMin = sc.wing.leashMin ?? 8;
          const leashMax = sc.wing.leashMax ?? 40;
          const dBA = toroidalDelta(b.p, anchor, w, h);
          const dist = Math.hypot(dBA.x, dBA.y);

          const toT = toroidalDelta(b.p, target, w, h);
          V.setMag(toT, sc.wing.attractToRibs);

          if (dist > leashMax) {
            const pullIn = { x: dBA.x, y: dBA.y };
            V.setMag(pullIn, 0.8 * sc.wing.attractToRibs * Math.min(2, (dist - leashMax) / leashMax + 1));
            toT.x += pullIn.x;
            toT.y += pullIn.y;
          } else if (dist < leashMin) {
            const pushOut = { x: -dBA.x, y: -dBA.y };
            V.setMag(pushOut, 0.4 * sc.wing.attractToRibs * (1 - dist / Math.max(1e-6, leashMin)));
            toT.x += pushOut.x;
            toT.y += pushOut.y;
          }

          toT.x += tx * (sc.wing.followRibTangent ?? 0);
          toT.y += ty * (sc.wing.followRibTangent ?? 0);

          V.setMag(toT, maxSpeedEff);
          toT.x -= b.v.x;
          toT.y -= b.v.y;
          V.limit(toT, maxForceEff);
          V.add(b.a, toT);
        }

        if (sc.id === "bone" && sc.bone && sk.boneAnchors.length > 0) {
          const anchors = sk.boneAnchors;
          const tangents = sk.boneTangents;
          const A = anchors.length;

          if (b.anchorIdx == null) b.anchorIdx = i % A;
          if (b.anchorIdx < 0 || b.anchorIdx >= A) b.anchorIdx = (b.anchorIdx % A + A) % A;

          const driftProb = sc.bone.driftProb ?? 0.0;
          if (driftProb > 0 && Math.random() < driftProb) {
            b.anchorIdx = (b.anchorIdx + (Math.random() < 0.5 ? -1 : 1) + A) % A;
          }

          const anchor = anchors[b.anchorIdx];
          const tan = tangents[b.anchorIdx];
          const dBA = toroidalDelta(b.p, anchor, w, h);
          const dist = Math.hypot(dBA.x, dBA.y);

          const leashMin = sc.bone.leashMin ?? 8;
          const leashMax = sc.bone.leashMax ?? 28;
          const anchorAttract = sc.bone.anchorAttract ?? 4.0;
          const anchorFollow = sc.bone.anchorFollow ?? 1.0;

          let radial = { x: dBA.x, y: dBA.y };
          let radialScale = anchorAttract;

          if (dist > leashMax) {
            radialScale *= 1.5 + (dist - leashMax) / leashMax;
          } else if (dist < leashMin) {
            radial.x = -radial.x;
            radial.y = -radial.y;
            radialScale *= 0.4 * (1 - dist / Math.max(1e-6, leashMin));
          }

          V.setMag(radial, radialScale);

          const tm = Math.hypot(tan.x, tan.y) || 1e-6;
          const tx = tan.x / tm;
          const ty = tan.y / tm;
          const tangentPull: Vec2 = { x: tx * anchorFollow, y: ty * anchorFollow };

          const desire = { x: radial.x + tangentPull.x, y: radial.y + tangentPull.y };
          V.setMag(desire, maxSpeedEff);
          desire.x -= b.v.x;
          desire.y -= b.v.y;
          V.limit(desire, maxForceEff);
          V.add(b.a, desire);
        }

        if (sc.head) {
          const dBH = toroidalDelta(b.p, sk.headPos, w, h);
          const d2h = dBH.x * dBH.x + dBH.y * dBH.y;
          if (d2h < sc.head.headDist * sc.head.headDist) {
            const vMag = Math.hypot(sk.headVel.x, sk.headVel.y) || 1e-6;
            const vx = sk.headVel.x / vMag;
            const vy = sk.headVel.y / vMag;

            const desire: Vec2 = { x: dBH.x, y: dBH.y };
            V.setMag(desire, sc.head.attractToHead);
            desire.x += vx * sc.head.followHeadVel;
            desire.y += vy * sc.head.followHeadVel;

            V.setMag(desire, maxSpeedEff);
            desire.x -= b.v.x;
            desire.y -= b.v.y;
            V.limit(desire, maxForceEff);
            V.add(b.a, desire);
          }
        }
      }

      if (mouse && (mode === "seek" || mode === "flee")) {
        if (mode === "seek") {
          if (inR0) {
            const invSq = Math.min(1, (R0 * R0) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * mouseCoreRepelMult * invSq;
            b.a.x -= nx * forceMag;
            b.a.y -= ny * forceMag;
          } else if (inR1) {
            const t = (d - R0) / Math.max(1e-6, R1 - R0);
            const invSq = Math.min(1, (R1 * R1) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * seekAttractMult * invSq * t;
            b.a.x += nx * forceMag;
            b.a.y += ny * forceMag;

            const impulse = seekBoost * t * (1 - (d - R0) / Math.max(1e-6, R1 - R0));
            b.v.x += nx * Math.max(0, impulse);
            b.v.y += ny * Math.max(0, impulse);

            const vr = b.v.x * nx + b.v.y * ny;
            b.a.x -= nx * vr * seekDamping;
            b.a.y -= ny * vr * seekDamping;
          } else if (inR2) {
            const t = (d - R1) / Math.max(1e-6, R2 - R1);
            const wLocal = (1 - t) * 0.5;
            const desired = { x: nx, y: ny };
            V.setMag(desired, maxSpeedEff);
            desired.x -= b.v.x;
            desired.y -= b.v.y;
            V.limit(desired, maxForceEff * 0.8);
            desired.x *= wMouseEff * wLocal;
            desired.y *= wMouseEff * wLocal;
            V.add(b.a, desired);
          }
        } else {
          if (inR1 || inR0) {
            const R = inR0 ? R0 : R1;
            const invSq = Math.min(1, (R * R) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * mouseFleeMult * invSq;
            b.a.x -= nx * forceMag;
            b.a.y -= ny * forceMag;

            const impulse = mouseBoost * (1 - d / R);
            b.v.x -= nx * Math.max(0, impulse);
            b.v.y -= ny * Math.max(0, impulse);
          } else if (inR2) {
            const t = (d - R1) / Math.max(1e-6, R2 - R1);
            const wLocal = (1 - t) * 0.4;
            const desired = { x: -nx, y: -ny };
            V.setMag(desired, maxSpeedEff);
            desired.x -= b.v.x;
            desired.y -= b.v.y;
            V.limit(desired, maxForceEff * 0.8);
            desired.x *= wMouseEff * wLocal;
            desired.y *= wMouseEff * wLocal;
            V.add(b.a, desired);
          }
        }
      }

      {
        const com = COM[b.s];
        const velN = VEL[b.s];
        const gc = sc.globalCohesion ?? 0;
        const gv = sc.globalVelFollow ?? 0;
        const mergeR = sc.globalMergeRadius ?? 0;

        if (gc > 0 || gv > 0) {
          const toCom = V.subNew(com, b.p);
          const distCom = V.mag(toCom);
          if (!mergeR || distCom > mergeR) {
            const outer = mergeR > 0 ? mergeR * 2 : Math.max(w, h);
            const tt = Math.min(1, Math.max(0, (distCom - mergeR) / Math.max(1e-6, outer - mergeR)));

            if (gc > 0) {
              const pull = { x: toCom.x, y: toCom.y };
              V.setMag(pull, maxSpeedEff * 0.5);
              pull.x -= b.v.x;
              pull.y -= b.v.y;
              V.limit(pull, maxForceEff);
              pull.x *= gc * tt;
              pull.y *= gc * tt;
              V.add(b.a, pull);
            }

            if (gv > 0) {
              const velPull = {
                x: velN.x * maxSpeedEff - b.v.x,
                y: velN.y * maxSpeedEff - b.v.y,
              };
              V.limit(velPull, maxForceEff * 0.6);
              velPull.x *= gv * tt;
              velPull.y *= gv * tt;
              V.add(b.a, velPull);
            }
          }
        }
      }

      {
        const toCtr = V.subNew(center, b.p);
        V.setMag(toCtr, maxSpeedEff * 0.15);
        toCtr.x -= b.v.x;
        toCtr.y -= b.v.y;
        V.limit(toCtr, maxForceEff * 0.6);
        toCtr.x *= homeWeight;
        toCtr.y *= homeWeight;
        V.add(b.a, toCtr);
      }

      b.v.x += b.a.x;
      b.v.y += b.a.y;
      V.limit(b.v, maxSpeedEff);

      b.p.x += b.v.x;
      b.p.y += b.v.y;

      if (b.p.x < 0) b.p.x += w;
      if (b.p.x >= w) b.p.x -= w;
      if (b.p.y < 0) b.p.y += h;
      if (b.p.y >= h) b.p.y -= h;
    }
  };

  const step = () => {
    stepSkeleton();
    stepBoids();
  };

  const draw = () => {
    const canvas = simCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = sizeRef.current;
    const base = presetRef.current;
    const pixel = base.pixelSize;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const sk = skeletonRef.current;
    if (sk?.cfg.visible) {
      const C = sk.cfg;
      ctx.fillStyle = C.color;

      const hs = Math.max(pixel, Math.round(C.headSize / pixel) * pixel);
      const hx = Math.round(sk.nodes[0].x / pixel) * pixel - Math.floor(hs / 2);
      const hy = Math.round(sk.nodes[0].y / pixel) * pixel - Math.floor(hs / 2);
      ctx.fillRect(hx, hy, hs, hs);

      ctx.fillStyle = "#444";
      for (let j = 0; j < sk.drawAnchors.length; j++) {
        const a = sk.drawAnchors[j];
        const rx = Math.round(a.x / pixel) * pixel;
        const ry = Math.round(a.y / pixel) * pixel;
        ctx.fillRect(rx, ry, pixel, pixel);
      }
    }

    const boids = boidsRef.current;
    const speciesList = normalizeSpecies(base);
    
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const sc = speciesList[b.s];
    
      const maxSpeedEff = base.maxSpeed * (sc.maxSpeedScale ?? 1) * b.speedScale;
      const minSpeedEff = maxSpeedEff * 0.1;
      const speed = Math.hypot(b.v.x, b.v.y);
    
      const { r, g, b: blue } = speedToRgb(speed, minSpeedEff, maxSpeedEff);
      const opacity = sc.opacity ?? 1.0;
    
      ctx.fillStyle = `rgba(${r}, ${g}, ${blue}, ${opacity})`;
    
      const sx = Math.round(b.p.x / pixel) * pixel;
      const sy = Math.round(b.p.y / pixel) * pixel;
      ctx.fillRect(sx, sy, pixel, pixel);
    }
  };

  useEffect(() => {
    resize();
    initSkeleton();
    resetBoids();
  
    const simCanvas = simCanvasRef.current!;
    const glCanvas = glCanvasRef.current!;
    const gl = glCanvas.getContext("webgl", { premultipliedAlpha: false });
  
    if (!gl) {
      throw new Error("WebGL not supported");
    }

    const copyProgram = createProgram(gl, copyVert, copyFrag);
  
    const chromaticProgram = createProgram(
      gl,
      temporalChromaticAberrationVert,
      temporalChromaticAberrationFrag
    );
  
    const asciiProgram = createProgram(
      gl,
      asciiPostVert,
      asciiPostFrag
    );

    const blurProgram = createProgram(
      gl,
      horizontalBlurVert,
      horizontalBlurFrag
    );
  
    const quadBuffer = gl.createBuffer()!;
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
  
    const bindFullscreenQuad = (program: WebGLProgram) => {
      const positionLoc = gl.getAttribLocation(program, "aPosition");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    };
  
    const sourceTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
    const passATexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, passATexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    const passAFramebuffer = gl.createFramebuffer()!;
    
    const passBTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, passBTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    const passBFramebuffer = gl.createFramebuffer()!;
  
    const allocPassTargets = () => {
      const { w, h, dpr } = sizeRef.current;
      const rw = Math.max(1, Math.floor(w * dpr));
      const rh = Math.max(1, Math.floor(h * dpr));
    
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
    
      let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`passA framebuffer incomplete: ${status}`);
      }
    
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
    
      status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`passB framebuffer incomplete: ${status}`);
      }
    
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
  
    allocPassTargets();

    const copyUniforms = {
      texture: gl.getUniformLocation(copyProgram, "uTexture"),
    };
  
    const chromaticUniforms = {
      texture: gl.getUniformLocation(chromaticProgram, "uTexture"),
      resolution: gl.getUniformLocation(chromaticProgram, "uResolution"),
      time: gl.getUniformLocation(chromaticProgram, "uTime"),
    };
  
    const asciiUniforms = {
      texture: gl.getUniformLocation(asciiProgram, "uTexture"),
      resolution: gl.getUniformLocation(asciiProgram, "uResolution"),
      mouse: gl.getUniformLocation(asciiProgram, "uMouse"),
      pixelation: gl.getUniformLocation(asciiProgram, "uPixelation"),
    };

    const blurUniforms = {
      texture: gl.getUniformLocation(blurProgram, "uTexture"),
      resolution: gl.getUniformLocation(blurProgram, "uResolution"),
      blurAmount: gl.getUniformLocation(blurProgram, "uBlurAmount"),
    };
  
    const renderPost = (timeMs: number) => {
      const { w, h, dpr } = sizeRef.current;
      const rw = Math.max(1, Math.floor(w * dpr));
      const rh = Math.max(1, Math.floor(h * dpr));
    
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        simCanvas
      );
    
      let currentTexture = sourceTexture;
      let writeToA = true;
    
      const renderPassToFbo = (
        program: WebGLProgram,
        uniforms: () => void,
        inputTexture: WebGLTexture
      ) => {
        const targetFramebuffer = writeToA ? passAFramebuffer : passBFramebuffer;
        const targetTexture = writeToA ? passATexture : passBTexture;
    
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
    
      if (ENABLE_HORIZONTAL_BLUR) {
        renderPassToFbo(
          blurProgram,
          () => {
            gl.uniform1i(blurUniforms.texture, 0);
            gl.uniform2f(blurUniforms.resolution, w, h);
            gl.uniform1f(blurUniforms.blurAmount, 6.0);
          },
          currentTexture
        );
      }
    
      if (ENABLE_ASCII) {
        renderPassToFbo(
          asciiProgram,
          () => {
            gl.uniform1i(asciiUniforms.texture, 0);
            gl.uniform2f(asciiUniforms.resolution, w, h);
    
            const mouse = mouseRef.current ?? { x: w * 0.5, y: 0 };
            gl.uniform2f(asciiUniforms.mouse, mouse.x, mouse.y);
            gl.uniform1f(asciiUniforms.pixelation, 0.5);
          },
          currentTexture
        );
      }
    
      if (ENABLE_CHROMATIC) {
        renderPassToFbo(
          chromaticProgram,
          () => {
            gl.uniform1i(chromaticUniforms.texture, 0);
            gl.uniform1f(chromaticUniforms.time, timeMs * 0.001);
            gl.uniform2f(chromaticUniforms.resolution, w, h);
          },
          currentTexture
        );
      }
    
      // Present final texture to screen with plain copy shader
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(copyProgram);
      bindFullscreenQuad(copyProgram);
    
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexture);
      gl.uniform1i(copyUniforms.texture, 0);
    
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
  
    const onMove = (e: MouseEvent) => {
      const rect = glCanvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
  
    const onLeave = () => {
      mouseRef.current = null;
    };
  
    const onResize = () => {
      resize();
      initSkeleton();
      resetBoids();
      allocPassTargets();
    };
  
    window.addEventListener("resize", onResize);
    glCanvas.addEventListener("mousemove", onMove);
    glCanvas.addEventListener("mouseleave", onLeave);
  
    runningRef.current = true;
    let raf = 0;
  
    const loop = (time: number) => {
      if (!runningRef.current) return;
      step();
      draw();
      renderPost(time);
      raf = requestAnimationFrame(loop);
    };
  
    raf = requestAnimationFrame(loop);
  
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(raf);
  
      window.removeEventListener("resize", onResize);
      glCanvas.removeEventListener("mousemove", onMove);
      glCanvas.removeEventListener("mouseleave", onLeave);
  
      gl.deleteFramebuffer(passAFramebuffer);
      gl.deleteFramebuffer(passBFramebuffer);
      gl.deleteTexture(passATexture);
      gl.deleteTexture(passBTexture);
      gl.deleteTexture(sourceTexture);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(asciiProgram);
      gl.deleteProgram(chromaticProgram);
    };
  }, []);

  useEffect(() => {
    initSkeleton();
    resetBoids();
  }, [countIndex]);

  const cycleMouseMode = () =>
    setMouseMode((m) =>
      m === "seek" ? "flee" : m === "flee" ? "follow" : m === "follow" ? "off" : "seek"
    );

  return (
    <div className="container">
      <div className="controls">
        <button
          className="button"
          onClick={cycleMouseMode}
          title="Cycle mouse interaction: Seek → Flee → Follow → Off"
        >
          {`Mouse: ${mouseMode.charAt(0).toUpperCase() + mouseMode.slice(1)}`}
        </button>

        <button
          className="button"
          onClick={() => setCountIndex((i) => (i + 1) % COUNTS.length)}
          title="Cycle boid count"
        >
          Boids: {COUNTS[countIndex]}
        </button>
      </div>

      <canvas ref={simCanvasRef} className="simCanvas" />
      <canvas ref={glCanvasRef} className="canvas" />

      <style jsx>{`
        .container { position: relative; width: 100%; height: 100%; }
        .canvas,
        .simCanvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }
        .simCanvas {
          visibility: hidden;
          pointer-events: none;
        }
        .controls {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 10;
          pointer-events: none;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .button {
          pointer-events: auto;
          background: #000;
          color: #fff;
          border: none;
          padding: 8px 12px;
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
          opacity: 0.9;
          transition: opacity 120ms ease, transform 80ms ease;
          border-radius: 8px;
        }
        .button:hover { opacity: 1; }
        .button:active { transform: scale(0.95); }
      `}</style>
    </div>
  );
}