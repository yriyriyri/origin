"use client";

import type { BoidsStudioSettings } from "@/lib/studioModes";
import { BOIDS_STUDIO_DENSITY_COUNTS } from "@/lib/studioModes";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";

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

import {
  radialGlowFrag,
  radialGlowVert,
} from "@/components/shaders/radialGlow";

import {
  vignetteFrag,
  vignetteVert,
} from "@/components/shaders/vignette";
import {
  DESKTOP_CANVAS_RUNTIME,
  type CanvasRuntimeProfile,
} from "@/lib/canvasRuntime";
import {
  isRuntimeProfilerEnabled,
  recordRuntimeMetric,
} from "@/lib/runtimeProfiler";

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

const CREATURE_BLUR_AMOUNT = 6.0;
const CREATURE_ASCII_PIXELATION = 0.7;
const CREATURE_CHROMATIC_STRENGTH = 0.003;
const CREATURE_GLOW_STRENGTH = 2.0;
const CREATURE_GLOW_RADIUS = 6.0;
const CREATURE_GLOW_RADIAL_STRENGTH = 2.0;
const CREATURE_GLOW_RADIAL_FALLOFF = 1.65;
const CREATURE_VIGNETTE_STRENGTH = 1.0;
const CREATURE_VIGNETTE_POWER = 1.1;
const CREATURE_VIGNETTE_ZOOM = 1.5;
const DEFAULT_SIMULATION_STEP_MS = 1000 / 60;
const DESKTOP_MAX_SIMULATION_STEPS_PER_FRAME = 3;
const THROTTLED_MAX_SIMULATION_STEPS_PER_FRAME = 2;
const MAX_VISIBLE_FRAME_DELTA_MS = 50;

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
const wrapCoord = (value: number, size: number) => {
  if (value < 0) return value + size;
  if (value >= size) return value - size;
  return value;
};
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
  prevP: Vec2;
  v: Vec2;
  a: Vec2;
  s: number;
  side: number;
  speedScale: number;
  smoothSpeed: number;
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

type SpeciesFrameBuffers = {
  centerOfMass: Vec2[];
  counts: number[];
  normalizedVelocity: Vec2[];
  sumPos: Vec2[];
  sumVel: Vec2[];
};

type SpeciesStepBuffers = {
  globalCohesion: number[];
  globalMergeRadius: number[];
  globalVelFollow: number[];
  maxForce: number[];
  maxSpeedBase: number[];
  neighborRadiusSq: number[];
  wAlign: number[];
  wCoh: number[];
  wMouse: number[];
  wSep: number[];
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
  pixelSize: 5,
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

const COUNTS = BOIDS_STUDIO_DENSITY_COUNTS;

type BoidsProps = {
  className?: string;
  disperse?: number;
  disperseValueRef?: MutableRefObject<number>;
  interactionTargetRef?: MutableRefObject<HTMLElement | null>;
  renderMode?: "full" | "source";
  runtimeProfile?: CanvasRuntimeProfile;
  sourceCanvasRef?: MutableRefObject<HTMLCanvasElement | null>;
  studioSettings?: BoidsStudioSettings;
  visibilityRefExternal?: MutableRefObject<number>;
};

const createEffectivePreset = (studioSettings?: BoidsStudioSettings): Preset => {
  if (!studioSettings) {
    return LIFE_SIM_PRESET;
  }

  const speed = studioSettings.speed;
  const flocking = studioSettings.flocking;
  const separation = studioSettings.separation;

  return {
    ...LIFE_SIM_PRESET,
    maxSpeed: LIFE_SIM_PRESET.maxSpeed * speed,
    desiredSeparation: LIFE_SIM_PRESET.desiredSeparation * separation,
    pixelSize: studioSettings.size,
    wAlign: LIFE_SIM_PRESET.wAlign * flocking,
    wCoh: LIFE_SIM_PRESET.wCoh * flocking,
    wSep: LIFE_SIM_PRESET.wSep * separation,
    skeleton: {
      ...LIFE_SIM_PRESET.skeleton,
      headSpeed: LIFE_SIM_PRESET.skeleton.headSpeed * speed,
    },
  };
};

const normalizeSpecies = (preset: Preset): SpeciesConfig[] => {
  const sum = preset.species.reduce((acc, species) => acc + species.ratio, 0) || 1;
  return preset.species.map((species) => ({
    ...species,
    ratio: species.ratio / sum,
  }));
};

export default function Boids({
  className,
  disperse = 0,
  disperseValueRef,
  interactionTargetRef,
  renderMode = "full",
  runtimeProfile = DESKTOP_CANVAS_RUNTIME,
  sourceCanvasRef,
  studioSettings,
  visibilityRefExternal,
}: BoidsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countIndex = studioSettings?.densityIndex ?? 1;

  const mouseModeRef = useRef<MouseMode>("off");
  const internalDisperseRef = useRef(disperse);
  internalDisperseRef.current = disperse;
  const effectiveDisperseRef = disperseValueRef ?? internalDisperseRef;
  const internalVisibilityRef = useRef(1);
  const effectiveVisibilityRef =
    visibilityRefExternal ?? internalVisibilityRef;

  const presetRef = useRef<Preset>(createEffectivePreset(studioSettings));
  presetRef.current = createEffectivePreset(studioSettings);
  const normalizedSpeciesRef = useRef<SpeciesConfig[]>(
    normalizeSpecies(presetRef.current)
  );
  normalizedSpeciesRef.current = normalizeSpecies(presetRef.current);

  const boidsRuntime = runtimeProfile.boids;

  const boidsRef = useRef<Boid[]>([]);
  const interactionBoundsRef = useRef({
    height: 1,
    left: 0,
    top: 0,
    width: 1,
  });
  const mouseRef = useRef<Vec2 | null>(null);
  const runningRef = useRef(true);
  const gridRef = useRef<Map<number, number[]>>(new Map());
  const gridActiveKeysRef = useRef<number[]>([]);
  const gridBucketPoolRef = useRef<number[][]>([]);
  const speciesFrameBuffersRef = useRef<SpeciesFrameBuffers>({
    centerOfMass: [],
    counts: [],
    normalizedVelocity: [],
    sumPos: [],
    sumVel: [],
  });
  const speciesStepBuffersRef = useRef<SpeciesStepBuffers>({
    globalCohesion: [],
    globalMergeRadius: [],
    globalVelFollow: [],
    maxForce: [],
    maxSpeedBase: [],
    neighborRadiusSq: [],
    wAlign: [],
    wCoh: [],
    wMouse: [],
    wSep: [],
  });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const skeletonRef = useRef<Skeleton | null>(null);

  const ENABLE_HORIZONTAL_BLUR = boidsRuntime.passes.blur;
  const ENABLE_ASCII = boidsRuntime.passes.ascii;
  const ENABLE_CHROMATIC = boidsRuntime.passes.chromatic;
  const ENABLE_RADIAL_GLOW = boidsRuntime.passes.glow;
  const ENABLE_VIGNETTE = boidsRuntime.passes.vignette;

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

  const toroidalDelta = (from: Vec2, to: Vec2, W: number, H: number): Vec2 => {
    let dx = to.x - from.x;
    if (dx > W * 0.5) dx -= W;
    else if (dx < -W * 0.5) dx += W;

    let dy = to.y - from.y;
    if (dy > H * 0.5) dy -= H;
    else if (dy < -H * 0.5) dy += H;

    return { x: dx, y: dy };
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

  const ensureSpeciesFrameBuffers = (speciesCount: number) => {
    const buffers = speciesFrameBuffersRef.current;
    const ensureVectorArray = (array: Vec2[]) => {
      while (array.length < speciesCount) {
        array.push({ x: 0, y: 0 });
      }
      array.length = speciesCount;
    };

    ensureVectorArray(buffers.centerOfMass);
    ensureVectorArray(buffers.normalizedVelocity);
    ensureVectorArray(buffers.sumPos);
    ensureVectorArray(buffers.sumVel);

    while (buffers.counts.length < speciesCount) {
      buffers.counts.push(0);
    }
    buffers.counts.length = speciesCount;
  };

  const ensureSpeciesStepBuffers = (speciesCount: number) => {
    const buffers = speciesStepBuffersRef.current;
    const ensureNumberArray = (array: number[]) => {
      while (array.length < speciesCount) {
        array.push(0);
      }
      array.length = speciesCount;
    };

    ensureNumberArray(buffers.globalCohesion);
    ensureNumberArray(buffers.globalMergeRadius);
    ensureNumberArray(buffers.globalVelFollow);
    ensureNumberArray(buffers.maxForce);
    ensureNumberArray(buffers.maxSpeedBase);
    ensureNumberArray(buffers.neighborRadiusSq);
    ensureNumberArray(buffers.wAlign);
    ensureNumberArray(buffers.wCoh);
    ensureNumberArray(buffers.wMouse);
    ensureNumberArray(buffers.wSep);
  };

  const rebuildGrid = (neighborDist: number) => {
    const grid = gridRef.current;
    const activeKeys = gridActiveKeysRef.current;
    const bucketPool = gridBucketPoolRef.current;
    for (let i = 0; i < activeKeys.length; i++) {
      const bucket = grid.get(activeKeys[i]);
      if (bucket) {
        bucket.length = 0;
        bucketPool.push(bucket);
      }
    }
    activeKeys.length = 0;
    grid.clear();

    const { w, h } = sizeRef.current;
    const cell = Math.max(8, neighborDist);
    const cols = Math.max(1, Math.ceil(w / cell));
    const rows = Math.max(1, Math.ceil(h / cell));
    const boids = boidsRef.current;

    for (let idx = 0; idx < boids.length; idx++) {
      const b = boids[idx];
      let x = b.p.x;
      let y = b.p.y;
      if (x < 0) x += w;
      if (x >= w) x -= w;
      if (y < 0) y += h;
      if (y >= h) y -= h;

      const cellX = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
      const cellY = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
      const key = cellX + cellY * cols;
      let bucket = grid.get(key);

      if (!bucket) {
        bucket = bucketPool.pop() ?? [];
        grid.set(key, bucket);
        activeKeys.push(key);
      }

      bucket.push(idx);
    }

    return { cell, cols, rows };
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
    const total = Math.max(
      120,
      Math.round(COUNTS[countIndex] * boidsRuntime.countMultiplier)
    );
    const speciesList = normalizedSpeciesRef.current;
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
          prevP: { x, y },
          v: { x: rand(-1, 1), y: rand(-1, 1) },
          a: { x: 0, y: 0 },
          s,
          side: Math.random() < 0.5 ? -1 : 1,
          speedScale: rand(svMin, svMax),
          smoothSpeed: 0,
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
    const glCanvas = glCanvasRef.current;
    const container = containerRef.current!;
    const dpr = Math.max(
      1,
      Math.min(boidsRuntime.dprCap, window.devicePixelRatio || 1)
    );
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    sizeRef.current = {
      w: Math.floor(width),
      h: Math.floor(height),
      dpr,
    };

    simCanvas.width = Math.floor(width * dpr);
    simCanvas.height = Math.floor(height * dpr);
    simCanvas.style.width = `${width}px`;
    simCanvas.style.height = `${height}px`;

    if (glCanvas) {
      glCanvas.width = Math.floor(width * dpr);
      glCanvas.height = Math.floor(height * dpr);
    }
  };

  const stepBoids = (profilerEnabled: boolean) => {
    const { w, h } = sizeRef.current;
    const base = presetRef.current;
    const boids = boidsRef.current;
    const disperseT = clamp(effectiveDisperseRef.current, 0, 1);
    const flockHold = lerp(1, 0.25, disperseT);
    const structureHold = lerp(1, 0.1, disperseT);
    const homeHold = lerp(1, 1.8, disperseT);
    const disperseNeighborBoost = lerp(1, 1.4, disperseT);
    const desiredSeparationBoost = lerp(1, 2.6, disperseT);
    const sepForceBoost = lerp(1, 4.5, disperseT);
    const sepWeightBoost = lerp(1, 6.0, disperseT);

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

    const speciesList = normalizedSpeciesRef.current;
    const speciesCount = speciesList.length;
    const centerX = w * 0.5;
    const centerY = h * 0.5;
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    const maxDimension = Math.max(w, h);
    const R0 = R1 * mouseCoreFactor;
    const R2 = R1 * mouseOuterFactor;
    const R0Sq = R0 * R0;
    const R1Sq = R1 * R1;
    const R2Sq = R2 * R2;
    const mouseR1SpanInv = 1 / Math.max(1e-6, R1 - R0);
    const mouseR2SpanInv = 1 / Math.max(1e-6, R2 - R1);
    const maxNeighborDist = neighborDist * disperseNeighborBoost;
    const desiredSeparationEff = desiredSeparation * desiredSeparationBoost;
    const desiredSeparationEffSq = desiredSeparationEff * desiredSeparationEff;
    const gridStartedAt = profilerEnabled ? performance.now() : 0;
    const { cell, cols, rows } = rebuildGrid(maxNeighborDist);
    const currentTimeSeconds = performance.now() * 0.001;
    if (profilerEnabled) {
      recordRuntimeMetric("boids.grid", performance.now() - gridStartedAt);
    }

    ensureSpeciesFrameBuffers(speciesCount);
    ensureSpeciesStepBuffers(speciesCount);
    const {
      centerOfMass,
      counts,
      normalizedVelocity,
      sumPos,
      sumVel,
    } = speciesFrameBuffersRef.current;
    const {
      globalCohesion,
      globalMergeRadius,
      globalVelFollow,
      maxForce: maxForceBySpecies,
      maxSpeedBase,
      neighborRadiusSq,
      wAlign: wAlignBySpecies,
      wCoh: wCohBySpecies,
      wMouse: wMouseBySpecies,
      wSep: wSepBySpecies,
    } = speciesStepBuffersRef.current;
    const aggregateStartedAt = profilerEnabled ? performance.now() : 0;

    for (let i = 0; i < speciesCount; i++) {
      sumPos[i].x = 0;
      sumPos[i].y = 0;
      sumVel[i].x = 0;
      sumVel[i].y = 0;
      counts[i] = 0;

      const sc = speciesList[i];
      const neighborRadius =
        neighborDist * (sc.neighborDistScale ?? 1) * disperseNeighborBoost;
      neighborRadiusSq[i] = neighborRadius * neighborRadius;
      maxSpeedBase[i] = maxSpeed * (sc.maxSpeedScale ?? 1);
      maxForceBySpecies[i] = maxForce * (sc.maxForceScale ?? 1);
      wAlignBySpecies[i] = wAlign * (sc.wAlignScale ?? 1);
      wCohBySpecies[i] = wCoh * (sc.wCohScale ?? 1);
      wSepBySpecies[i] = wSep * (sc.wSepScale ?? 1);
      wMouseBySpecies[i] = wMouse * (sc.wMouseScale ?? 1);
      globalCohesion[i] = sc.globalCohesion ?? 0;
      globalVelFollow[i] = sc.globalVelFollow ?? 0;
      globalMergeRadius[i] = sc.globalMergeRadius ?? 0;
    }

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      sumPos[b.s].x += b.p.x;
      sumPos[b.s].y += b.p.y;
      sumVel[b.s].x += b.v.x;
      sumVel[b.s].y += b.v.y;
      counts[b.s]++;
    }

    for (let i = 0; i < speciesCount; i++) {
      const count = counts[i];
      const com = centerOfMass[i];
      const vel = normalizedVelocity[i];

      if (count > 0) {
        com.x = sumPos[i].x / count;
        com.y = sumPos[i].y / count;
      } else {
        com.x = 0;
        com.y = 0;
      }

      const vx = sumVel[i].x / Math.max(1, count);
      const vy = sumVel[i].y / Math.max(1, count);
      const magnitude = Math.hypot(vx, vy) || 1;
      vel.x = vx / magnitude;
      vel.y = vy / magnitude;
    }
    if (profilerEnabled) {
      recordRuntimeMetric(
        "boids.aggregate",
        performance.now() - aggregateStartedAt
      );
    }

    const mouse = mouseRef.current;
    const mode = mouseModeRef.current;
    const grid = gridRef.current;
    const sk = skeletonRef.current;
    const flockStartedAt = profilerEnabled ? performance.now() : 0;

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const speciesIndex = b.s;
      const sc = speciesList[speciesIndex];
      const bp = b.p;
      const bpx = bp.x;
      const bpy = bp.y;
      let bvx = b.v.x;
      let bvy = b.v.y;
      let ax = 0;
      let ay = 0;

      const neighR2 = neighborRadiusSq[speciesIndex];
      const maxSpeedEff = maxSpeedBase[speciesIndex] * b.speedScale;
      const maxSpeedEffSq = maxSpeedEff * maxSpeedEff;
      const maxForceEff = maxForceBySpecies[speciesIndex];
      const maxForceEffSq = maxForceEff * maxForceEff;
      const wAlignEff = wAlignBySpecies[speciesIndex];
      const wCohEff = wCohBySpecies[speciesIndex];
      const wSepEff = wSepBySpecies[speciesIndex];
      const wMouseEff = wMouseBySpecies[speciesIndex];
      const sepLimit = maxForceEff * sepForceBoost;
      const sepLimitSq = sepLimit * sepLimit;

      let inR0 = false;
      let inR1 = false;
      let inR2 = false;
      let nx = 0;
      let ny = 0;
      let d = 0;
      let d2 = 0;

      if (mouse) {
        const dx = mouse.x - bpx;
        const dy = mouse.y - bpy;
        d2 = dx * dx + dy * dy;
        inR0 = d2 < R0Sq;
        inR1 = !inR0 && d2 < R1Sq;
        inR2 = !inR1 && d2 < R2Sq;
        if (inR0 || inR1 || inR2) {
          d = Math.sqrt(d2) || 1e-6;
          nx = dx / d;
          ny = dy / d;
        }
      }

      const cx = Math.floor(bpx / cell);
      const cy = Math.floor(bpy / cell);

      let countSame = 0;
      let countNearby = 0;
      let alignX = 0;
      let alignY = 0;
      let cohX = 0;
      let cohY = 0;
      let sepX = 0;
      let sepY = 0;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const gridX = cx + ox;
          const gridY = cy + oy;
          if (gridX < 0 || gridY < 0 || gridX >= cols || gridY >= rows) {
            continue;
          }
          const k = gridX + gridY * cols;
          const list = grid.get(k);
          if (!list) continue;

          for (let listIndex = 0; listIndex < list.length; listIndex++) {
            const idx = list[listIndex];
            if (idx === i) continue;
            const o = boids[idx];
            const dx = o.p.x - bpx;
            const dy = o.p.y - bpy;
            const dd2 = dx * dx + dy * dy;

            if (dd2 < neighR2) {
              countNearby++;

              if (dd2 > 0.0001 && dd2 < desiredSeparationEffSq) {
                const dd = Math.sqrt(dd2);
                const push = (desiredSeparationEff - dd) / dd;
                sepX -= dx * push;
                sepY -= dy * push;
              }

              if (o.s === speciesIndex) {
                countSame++;
                alignX += o.v.x;
                alignY += o.v.y;
                cohX += o.p.x;
                cohY += o.p.y;
              }
            }
          }
        }
      }

      if (countSame > 0) {
        const flockScale = inR1 || inR0 ? localFlockDampen : 1.0;
        const flockHoldEff = flockScale * flockHold;
        const invCountSame = 1 / countSame;

        let steerX = alignX * invCountSame;
        let steerY = alignY * invCountSame;
        let magSq = steerX * steerX + steerY * steerY;
        if (magSq > 1e-12) {
          const scale = maxSpeedEff / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        steerX -= bvx;
        steerY -= bvy;
        magSq = steerX * steerX + steerY * steerY;
        if (magSq > maxForceEffSq) {
          const scale = maxForceEff / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        ax += steerX * wAlignEff * flockHoldEff;
        ay += steerY * wAlignEff * flockHoldEff;

        steerX = cohX * invCountSame - bpx;
        steerY = cohY * invCountSame - bpy;
        magSq = steerX * steerX + steerY * steerY;
        if (magSq > 1e-12) {
          const scale = maxSpeedEff / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        steerX -= bvx;
        steerY -= bvy;
        magSq = steerX * steerX + steerY * steerY;
        if (magSq > maxForceEffSq) {
          const scale = maxForceEff / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        ax += steerX * wCohEff * flockHoldEff;
        ay += steerY * wCohEff * flockHoldEff;
      }

      if (countNearby > 0) {
        const sepScale = inR1 || inR0 ? sepBoostR1 : 1.0;
        const sepMagSq = sepX * sepX + sepY * sepY;
        if (sepMagSq > sepLimitSq) {
          const scale = sepLimit / Math.sqrt(sepMagSq);
          sepX *= scale;
          sepY *= scale;
        }
        ax += sepX * wSepEff * sepScale * sepWeightBoost;
        ay += sepY * wSepEff * sepScale * sepWeightBoost;
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
          const jitter = jitterAmp * Math.sin(currentTimeSeconds * 1.5 + i * 0.7);

          const lateral = (sc.wing.lateralBias ?? 0) * 0.5 * b.side + jitter;
          const targetX = anchor.x - tx * trail + px * lateral;
          const targetY = anchor.y - ty * trail + py * lateral;

          const leashMin = sc.wing.leashMin ?? 8;
          const leashMax = sc.wing.leashMax ?? 40;
          let dBAX = anchor.x - bpx;
          if (dBAX > halfW) dBAX -= w;
          else if (dBAX < -halfW) dBAX += w;
          let dBAY = anchor.y - bpy;
          if (dBAY > halfH) dBAY -= h;
          else if (dBAY < -halfH) dBAY += h;
          const dist = Math.hypot(dBAX, dBAY);

          let steerX = targetX - bpx;
          if (steerX > halfW) steerX -= w;
          else if (steerX < -halfW) steerX += w;
          let steerY = targetY - bpy;
          if (steerY > halfH) steerY -= h;
          else if (steerY < -halfH) steerY += h;
          let magSq = steerX * steerX + steerY * steerY;
          if (magSq > 1e-12) {
            const scale = sc.wing.attractToRibs / Math.sqrt(magSq);
            steerX *= scale;
            steerY *= scale;
          }

          if (dist > leashMax) {
            let pullX = dBAX;
            let pullY = dBAY;
            magSq = pullX * pullX + pullY * pullY;
            if (magSq > 1e-12) {
              const scale =
                (0.8 *
                  sc.wing.attractToRibs *
                  Math.min(2, (dist - leashMax) / leashMax + 1)) /
                Math.sqrt(magSq);
              pullX *= scale;
              pullY *= scale;
            } else {
              pullX = 0;
              pullY = 0;
            }
            steerX += pullX;
            steerY += pullY;
          } else if (dist < leashMin) {
            let pushX = -dBAX;
            let pushY = -dBAY;
            magSq = pushX * pushX + pushY * pushY;
            if (magSq > 1e-12) {
              const scale =
                (0.4 *
                  sc.wing.attractToRibs *
                  (1 - dist / Math.max(1e-6, leashMin))) /
                Math.sqrt(magSq);
              pushX *= scale;
              pushY *= scale;
            } else {
              pushX = 0;
              pushY = 0;
            }
            steerX += pushX;
            steerY += pushY;
          }

          steerX += tx * (sc.wing.followRibTangent ?? 0);
          steerY += ty * (sc.wing.followRibTangent ?? 0);

          magSq = steerX * steerX + steerY * steerY;
          if (magSq > 1e-12) {
            const scale = maxSpeedEff / Math.sqrt(magSq);
            steerX *= scale;
            steerY *= scale;
          }
          steerX -= bvx;
          steerY -= bvy;
          magSq = steerX * steerX + steerY * steerY;
          if (magSq > maxForceEffSq) {
            const scale = maxForceEff / Math.sqrt(magSq);
            steerX *= scale;
            steerY *= scale;
          }
          ax += steerX * structureHold;
          ay += steerY * structureHold;
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
          let dBAX = anchor.x - bpx;
          if (dBAX > halfW) dBAX -= w;
          else if (dBAX < -halfW) dBAX += w;
          let dBAY = anchor.y - bpy;
          if (dBAY > halfH) dBAY -= h;
          else if (dBAY < -halfH) dBAY += h;
          const dist = Math.hypot(dBAX, dBAY);

          const leashMin = sc.bone.leashMin ?? 8;
          const leashMax = sc.bone.leashMax ?? 28;
          const anchorAttract = sc.bone.anchorAttract ?? 4.0;
          const anchorFollow = sc.bone.anchorFollow ?? 1.0;

          let radialX = dBAX;
          let radialY = dBAY;
          let radialScale = anchorAttract;

          if (dist > leashMax) {
            radialScale *= 1.5 + (dist - leashMax) / leashMax;
          } else if (dist < leashMin) {
            radialX = -radialX;
            radialY = -radialY;
            radialScale *= 0.4 * (1 - dist / Math.max(1e-6, leashMin));
          }

          let magSq = radialX * radialX + radialY * radialY;
          if (magSq > 1e-12) {
            const scale = radialScale / Math.sqrt(magSq);
            radialX *= scale;
            radialY *= scale;
          } else {
            radialX = 0;
            radialY = 0;
          }

          const tm = Math.hypot(tan.x, tan.y) || 1e-6;
          const tx = tan.x / tm;
          const ty = tan.y / tm;
          let steerX = radialX + tx * anchorFollow;
          let steerY = radialY + ty * anchorFollow;

          magSq = steerX * steerX + steerY * steerY;
          if (magSq > 1e-12) {
            const scale = maxSpeedEff / Math.sqrt(magSq);
            steerX *= scale;
            steerY *= scale;
          }
          steerX -= bvx;
          steerY -= bvy;
          magSq = steerX * steerX + steerY * steerY;
          if (magSq > maxForceEffSq) {
            const scale = maxForceEff / Math.sqrt(magSq);
            steerX *= scale;
            steerY *= scale;
          }
          ax += steerX * structureHold;
          ay += steerY * structureHold;
        }

        if (sc.head) {
          let dBHX = sk.headPos.x - bpx;
          if (dBHX > halfW) dBHX -= w;
          else if (dBHX < -halfW) dBHX += w;
          let dBHY = sk.headPos.y - bpy;
          if (dBHY > halfH) dBHY -= h;
          else if (dBHY < -halfH) dBHY += h;
          const d2h = dBHX * dBHX + dBHY * dBHY;
          if (d2h < sc.head.headDist * sc.head.headDist) {
            const vMag = Math.hypot(sk.headVel.x, sk.headVel.y) || 1e-6;
            const vx = sk.headVel.x / vMag;
            const vy = sk.headVel.y / vMag;

            let steerX = dBHX;
            let steerY = dBHY;
            let magSq = steerX * steerX + steerY * steerY;
            if (magSq > 1e-12) {
              const scale = sc.head.attractToHead / Math.sqrt(magSq);
              steerX *= scale;
              steerY *= scale;
            }
            steerX += vx * sc.head.followHeadVel;
            steerY += vy * sc.head.followHeadVel;

            magSq = steerX * steerX + steerY * steerY;
            if (magSq > 1e-12) {
              const scale = maxSpeedEff / Math.sqrt(magSq);
              steerX *= scale;
              steerY *= scale;
            }
            steerX -= bvx;
            steerY -= bvy;
            magSq = steerX * steerX + steerY * steerY;
            if (magSq > maxForceEffSq) {
              const scale = maxForceEff / Math.sqrt(magSq);
              steerX *= scale;
              steerY *= scale;
            }
            ax += steerX * structureHold;
            ay += steerY * structureHold;
          }
        }
      }

      if (mouse && (mode === "seek" || mode === "flee")) {
        if (mode === "seek") {
          if (inR0) {
            const invSq = Math.min(1, (R0 * R0) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * mouseCoreRepelMult * invSq;
            ax -= nx * forceMag;
            ay -= ny * forceMag;
          } else if (inR1) {
            const t = (d - R0) * mouseR1SpanInv;
            const invSq = Math.min(1, (R1 * R1) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * seekAttractMult * invSq * t;
            ax += nx * forceMag;
            ay += ny * forceMag;

            const impulse = Math.max(0, seekBoost * t * (1 - t));
            bvx += nx * impulse;
            bvy += ny * impulse;

            const vr = bvx * nx + bvy * ny;
            ax -= nx * vr * seekDamping;
            ay -= ny * vr * seekDamping;
          } else if (inR2) {
            const t = (d - R1) * mouseR2SpanInv;
            const wLocal = (1 - t) * 0.5;
            let steerX = nx * maxSpeedEff - bvx;
            let steerY = ny * maxSpeedEff - bvy;
            const outerMaxForce = maxForceEff * 0.8;
            const outerMaxForceSq = outerMaxForce * outerMaxForce;
            const magSq = steerX * steerX + steerY * steerY;
            if (magSq > outerMaxForceSq) {
              const scale = outerMaxForce / Math.sqrt(magSq);
              steerX *= scale;
              steerY *= scale;
            }
            ax += steerX * wMouseEff * wLocal;
            ay += steerY * wMouseEff * wLocal;
          }
        } else {
          if (inR1 || inR0) {
            const R = inR0 ? R0 : R1;
            const invSq = Math.min(1, (R * R) / (d2 + 1));
            const forceMag = maxForceEff * wMouseEff * mouseFleeMult * invSq;
            ax -= nx * forceMag;
            ay -= ny * forceMag;

            const impulse = mouseBoost * (1 - d / R);
            const impulseClamped = Math.max(0, impulse);
            bvx -= nx * impulseClamped;
            bvy -= ny * impulseClamped;
          } else if (inR2) {
            const t = (d - R1) * mouseR2SpanInv;
            const wLocal = (1 - t) * 0.4;
            let steerX = -nx * maxSpeedEff - bvx;
            let steerY = -ny * maxSpeedEff - bvy;
            const outerMaxForce = maxForceEff * 0.8;
            const outerMaxForceSq = outerMaxForce * outerMaxForce;
            const magSq = steerX * steerX + steerY * steerY;
            if (magSq > outerMaxForceSq) {
              const scale = outerMaxForce / Math.sqrt(magSq);
              steerX *= scale;
              steerY *= scale;
            }
            ax += steerX * wMouseEff * wLocal;
            ay += steerY * wMouseEff * wLocal;
          }
        }
      }

      {
        const com = centerOfMass[speciesIndex];
        const velN = normalizedVelocity[speciesIndex];
        const gc = globalCohesion[speciesIndex] * flockHold;
        const gv = globalVelFollow[speciesIndex] * flockHold;
        const mergeR = globalMergeRadius[speciesIndex];

        if (gc > 0 || gv > 0) {
          const toComX = com.x - bpx;
          const toComY = com.y - bpy;
          const distCom = Math.hypot(toComX, toComY);
          if (!mergeR || distCom > mergeR) {
            const outer = mergeR > 0 ? mergeR * 2 : maxDimension;
            const tt = Math.min(1, Math.max(0, (distCom - mergeR) / Math.max(1e-6, outer - mergeR)));

            if (gc > 0) {
              let pullX = toComX;
              let pullY = toComY;
              let magSq = pullX * pullX + pullY * pullY;
              if (magSq > 1e-12) {
                const scale = (maxSpeedEff * 0.5) / Math.sqrt(magSq);
                pullX *= scale;
                pullY *= scale;
              }
              pullX -= bvx;
              pullY -= bvy;
              magSq = pullX * pullX + pullY * pullY;
              if (magSq > maxForceEffSq) {
                const scale = maxForceEff / Math.sqrt(magSq);
                pullX *= scale;
                pullY *= scale;
              }
              ax += pullX * gc * tt;
              ay += pullY * gc * tt;
            }

            if (gv > 0) {
              let pullX = velN.x * maxSpeedEff - bvx;
              let pullY = velN.y * maxSpeedEff - bvy;
              const velLimit = maxForceEff * 0.6;
              const velLimitSq = velLimit * velLimit;
              const magSq = pullX * pullX + pullY * pullY;
              if (magSq > velLimitSq) {
                const scale = velLimit / Math.sqrt(magSq);
                pullX *= scale;
                pullY *= scale;
              }
              ax += pullX * gv * tt;
              ay += pullY * gv * tt;
            }
          }
        }
      }

      {
        let steerX = centerX - bpx;
        let steerY = centerY - bpy;
        let magSq = steerX * steerX + steerY * steerY;
        if (magSq > 1e-12) {
          const scale = (maxSpeedEff * 0.15) / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        steerX -= bvx;
        steerY -= bvy;
        const homeLimit = maxForceEff * 0.6;
        const homeLimitSq = homeLimit * homeLimit;
        magSq = steerX * steerX + steerY * steerY;
        if (magSq > homeLimitSq) {
          const scale = homeLimit / Math.sqrt(magSq);
          steerX *= scale;
          steerY *= scale;
        }
        ax += steerX * homeWeight * homeHold;
        ay += steerY * homeWeight * homeHold;
      }

      b.a.x = ax;
      b.a.y = ay;
      bvx += ax;
      bvy += ay;
      const velocityMagSq = bvx * bvx + bvy * bvy;
      if (velocityMagSq > maxSpeedEffSq) {
        const scale = maxSpeedEff / Math.sqrt(velocityMagSq);
        bvx *= scale;
        bvy *= scale;
      }
      b.v.x = bvx;
      b.v.y = bvy;

      b.prevP.x = bpx;
      b.prevP.y = bpy;
      bp.x = bpx + bvx;
      bp.y = bpy + bvy;

      if (bp.x < 0) bp.x += w;
      if (bp.x >= w) bp.x -= w;
      if (bp.y < 0) bp.y += h;
      if (bp.y >= h) bp.y -= h;
    }
    if (profilerEnabled) {
      recordRuntimeMetric("boids.flock", performance.now() - flockStartedAt);
    }
  };

  const step = (profilerEnabled: boolean) => {
    if (profilerEnabled) {
      const skeletonStartedAt = performance.now();
      stepSkeleton();
      recordRuntimeMetric(
        "boids.skeleton",
        performance.now() - skeletonStartedAt
      );
      stepBoids(true);
      return;
    }

    stepSkeleton();
    stepBoids(false);
  };

  const draw = (ctx: CanvasRenderingContext2D, interpolationAlpha: number) => {
    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = sizeRef.current;
    const base = presetRef.current;
    const pixel = base.pixelSize;
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    const alpha = clamp(interpolationAlpha, 0, 1);

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
    const speciesList = normalizedSpeciesRef.current;
    
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const sc = speciesList[b.s];
      let interpDx = b.p.x - b.prevP.x;
      if (interpDx > halfW) interpDx -= w;
      else if (interpDx < -halfW) interpDx += w;
      let interpDy = b.p.y - b.prevP.y;
      if (interpDy > halfH) interpDy -= h;
      else if (interpDy < -halfH) interpDy += h;
      const renderX = wrapCoord(b.prevP.x + interpDx * alpha, w);
      const renderY = wrapCoord(b.prevP.y + interpDy * alpha, h);
    
      const maxSpeedEff = base.maxSpeed * (sc.maxSpeedScale ?? 1) * b.speedScale;
      const minSpeedEff = maxSpeedEff * 0.1;
      const speed = Math.hypot(b.v.x, b.v.y);
      b.smoothSpeed = lerp(b.smoothSpeed, speed, 0.01);
      const t = clamp(
        (b.smoothSpeed - minSpeedEff) /
          Math.max(1e-6, maxSpeedEff - minSpeedEff),
        0,
        1
      );
      const shaped = Math.pow(t, 3.8);
      let red = 0;
      let green = 0;
      let blue = 0;

      if (shaped < 0.5) {
        const u = shaped / 0.5;
        green = Math.round(255 * u);
        blue = 255;
      } else {
        const u = (shaped - 0.5) / 0.5;
        red = 255;
        green = Math.round(255 * (1 - u));
        blue = Math.round(255 * (1 - u));
      }
      const opacity = sc.opacity ?? 1.0;
    
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
    
      const sx = Math.round(renderX / pixel) * pixel;
      const sy = Math.round(renderY / pixel) * pixel;
      ctx.fillRect(sx, sy, pixel, pixel);
    }
  };

  useEffect(() => {
    resize();
    initSkeleton();
    resetBoids();

    const simCanvas = simCanvasRef.current;
    const glCanvas = glCanvasRef.current;
    const interactionTarget =
      interactionTargetRef?.current ?? (renderMode === "full" ? glCanvas : containerRef.current);

    if (!simCanvas || !interactionTarget) {
      return;
    }

    const simContext = simCanvas.getContext("2d");
    if (!simContext) {
      return;
    }

    let gl: WebGLRenderingContext | null = null;
    let copyProgram: WebGLProgram | null = null;
    let chromaticProgram: WebGLProgram | null = null;
    let asciiProgram: WebGLProgram | null = null;
    let blurProgram: WebGLProgram | null = null;
    let glowProgram: WebGLProgram | null = null;
    let vignetteProgram: WebGLProgram | null = null;
    let quadBuffer: WebGLBuffer | null = null;
    let sourceTexture: WebGLTexture | null = null;
    let passATexture: WebGLTexture | null = null;
    let passAFramebuffer: WebGLFramebuffer | null = null;
    let passBTexture: WebGLTexture | null = null;
    let passBFramebuffer: WebGLFramebuffer | null = null;
    let copyUniforms: { texture: WebGLUniformLocation | null } | null = null;
    let chromaticUniforms:
      | {
          texture: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          strength: WebGLUniformLocation | null;
          time: WebGLUniformLocation | null;
        }
      | null = null;
    let asciiUniforms:
      | {
          texture: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          mouse: WebGLUniformLocation | null;
          pixelation: WebGLUniformLocation | null;
        }
      | null = null;
    let blurUniforms:
      | {
          texture: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          blurAmount: WebGLUniformLocation | null;
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
    let vignetteUniforms:
      | {
          texture: WebGLUniformLocation | null;
          resolution: WebGLUniformLocation | null;
          strength: WebGLUniformLocation | null;
          power: WebGLUniformLocation | null;
          zoom: WebGLUniformLocation | null;
        }
      | null = null;

    const bindFullscreenQuad = (program: WebGLProgram) => {
      if (!gl || !quadBuffer) return;
      const positionLoc = gl.getAttribLocation(program, "aPosition");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    };

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

    const renderPost = (timeMs: number) => {
      if (
        !gl ||
        !copyProgram ||
        !chromaticProgram ||
        !asciiProgram ||
        !blurProgram ||
        !glowProgram ||
        !vignetteProgram ||
        !copyUniforms ||
        !chromaticUniforms ||
        !asciiUniforms ||
        !blurUniforms ||
        !glowUniforms ||
        !vignetteUniforms ||
        !sourceTexture ||
        !passATexture ||
        !passAFramebuffer ||
        !passBTexture ||
        !passBFramebuffer
      ) {
        return;
      }

      const { w, h, dpr } = sizeRef.current;
      const rw = Math.max(1, Math.floor(w * dpr));
      const rh = Math.max(1, Math.floor(h * dpr));

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
        const targetFramebuffer = writeToA ? passAFramebuffer! : passBFramebuffer!;
        const targetTexture = writeToA ? passATexture! : passBTexture!;

        gl!.bindFramebuffer(gl!.FRAMEBUFFER, targetFramebuffer);
        gl!.viewport(0, 0, rw, rh);
        gl!.useProgram(program);
        bindFullscreenQuad(program);

        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, inputTexture);
        uniforms();

        gl!.drawArrays(gl!.TRIANGLES, 0, 6);

        currentTexture = targetTexture;
        writeToA = !writeToA;
      };

      if (ENABLE_HORIZONTAL_BLUR) {
        renderPassToFbo(
          blurProgram,
          () => {
            gl!.uniform1i(blurUniforms!.texture, 0);
            gl!.uniform2f(blurUniforms!.resolution, w, h);
            gl!.uniform1f(blurUniforms!.blurAmount, CREATURE_BLUR_AMOUNT);
          },
          currentTexture
        );
      }

      if (ENABLE_ASCII) {
        renderPassToFbo(
          asciiProgram,
          () => {
            gl!.uniform1i(asciiUniforms!.texture, 0);
            gl!.uniform2f(asciiUniforms!.resolution, w, h);

            const mouse = mouseRef.current ?? { x: w * 0.5, y: 0 };
            gl!.uniform2f(asciiUniforms!.mouse, mouse.x, mouse.y);
            gl!.uniform1f(
              asciiUniforms!.pixelation,
              CREATURE_ASCII_PIXELATION
            );
          },
          currentTexture
        );
      }

      if (ENABLE_CHROMATIC) {
        renderPassToFbo(
          chromaticProgram,
          () => {
            gl!.uniform1i(chromaticUniforms!.texture, 0);
            gl!.uniform1f(chromaticUniforms!.time, 0);
            gl!.uniform2f(chromaticUniforms!.resolution, w, h);
            gl!.uniform1f(
              chromaticUniforms!.strength,
              CREATURE_CHROMATIC_STRENGTH
            );
          },
          currentTexture
        );
      }

      if (ENABLE_RADIAL_GLOW) {
        renderPassToFbo(
          glowProgram,
          () => {
            gl!.uniform1i(glowUniforms!.texture, 0);
            gl!.uniform2f(glowUniforms!.resolution, w, h);
            gl!.uniform1f(glowUniforms!.glowStrength, CREATURE_GLOW_STRENGTH);
            gl!.uniform1f(glowUniforms!.glowRadius, CREATURE_GLOW_RADIUS);
            gl!.uniform1f(
              glowUniforms!.radialStrength,
              CREATURE_GLOW_RADIAL_STRENGTH
            );
            gl!.uniform1f(
              glowUniforms!.radialFalloff,
              CREATURE_GLOW_RADIAL_FALLOFF
            );
          },
          currentTexture
        );
      }

      if (ENABLE_VIGNETTE) {
        renderPassToFbo(
          vignetteProgram,
          () => {
            gl!.uniform1i(vignetteUniforms!.texture, 0);
            gl!.uniform2f(vignetteUniforms!.resolution, w, h);
            gl!.uniform1f(vignetteUniforms!.strength, CREATURE_VIGNETTE_STRENGTH);
            gl!.uniform1f(vignetteUniforms!.power, CREATURE_VIGNETTE_POWER);
            gl!.uniform1f(vignetteUniforms!.zoom, CREATURE_VIGNETTE_ZOOM);
          },
          currentTexture
        );
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(copyProgram);
      bindFullscreenQuad(copyProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexture);
      gl.uniform1i(copyUniforms.texture, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    if (renderMode === "full") {
      if (!glCanvas) {
        return;
      }

      gl = glCanvas.getContext("webgl", {
        premultipliedAlpha: false,
        powerPreference: boidsRuntime.powerPreference,
      });
      if (!gl) {
        throw new Error("WebGL not supported");
      }

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

      copyProgram = createProgram(gl, copyVert, copyFrag);
      chromaticProgram = createProgram(
        gl,
        temporalChromaticAberrationVert,
        temporalChromaticAberrationFrag
      );
      asciiProgram = createProgram(gl, asciiPostVert, asciiPostFrag);
      blurProgram = createProgram(gl, horizontalBlurVert, horizontalBlurFrag);
      glowProgram = createProgram(gl, radialGlowVert, radialGlowFrag);
      vignetteProgram = createProgram(gl, vignetteVert, vignetteFrag);

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

      allocPassTargets();

      copyUniforms = {
        texture: gl.getUniformLocation(copyProgram, "uTexture"),
      };
      chromaticUniforms = {
        texture: gl.getUniformLocation(chromaticProgram, "uTexture"),
        resolution: gl.getUniformLocation(chromaticProgram, "uResolution"),
        strength: gl.getUniformLocation(chromaticProgram, "uStrength"),
        time: gl.getUniformLocation(chromaticProgram, "uTime"),
      };
      asciiUniforms = {
        texture: gl.getUniformLocation(asciiProgram, "uTexture"),
        resolution: gl.getUniformLocation(asciiProgram, "uResolution"),
        mouse: gl.getUniformLocation(asciiProgram, "uMouse"),
        pixelation: gl.getUniformLocation(asciiProgram, "uPixelation"),
      };
      blurUniforms = {
        texture: gl.getUniformLocation(blurProgram, "uTexture"),
        resolution: gl.getUniformLocation(blurProgram, "uResolution"),
        blurAmount: gl.getUniformLocation(blurProgram, "uBlurAmount"),
      };
      glowUniforms = {
        texture: gl.getUniformLocation(glowProgram, "uTexture"),
        resolution: gl.getUniformLocation(glowProgram, "uResolution"),
        glowStrength: gl.getUniformLocation(glowProgram, "uGlowStrength"),
        glowRadius: gl.getUniformLocation(glowProgram, "uGlowRadius"),
        radialStrength: gl.getUniformLocation(glowProgram, "uRadialStrength"),
        radialFalloff: gl.getUniformLocation(glowProgram, "uRadialFalloff"),
      };
      vignetteUniforms = {
        texture: gl.getUniformLocation(vignetteProgram, "uTexture"),
        resolution: gl.getUniformLocation(vignetteProgram, "uResolution"),
        strength: gl.getUniformLocation(vignetteProgram, "uStrength"),
        power: gl.getUniformLocation(vignetteProgram, "uPower"),
        zoom: gl.getUniformLocation(vignetteProgram, "uZoom"),
      };
    }

    const updateInteractionBounds = () => {
      const rect = interactionTarget.getBoundingClientRect();
      interactionBoundsRef.current = {
        height: Math.max(1, rect.height),
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
      };
    };

    const onMove = (event: MouseEvent) => {
      const rect = interactionBoundsRef.current;
      const xNorm = clamp(
        (event.clientX - rect.left) / rect.width,
        0,
        1
      );
      const yNorm = clamp(
        (event.clientY - rect.top) / rect.height,
        0,
        1
      );
      const { w, h } = sizeRef.current;
      mouseRef.current = { x: xNorm * w, y: yNorm * h };
    };

    const onLeave = () => {
      mouseRef.current = null;
      mouseModeRef.current = "off";
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) {
        mouseModeRef.current = "flee";
      } else if (event.button === 2) {
        mouseModeRef.current = "seek";
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0 && mouseModeRef.current === "flee") {
        mouseModeRef.current = "off";
      } else if (event.button === 2 && mouseModeRef.current === "seek") {
        mouseModeRef.current = "off";
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onResize = () => {
      resize();
      initSkeleton();
      resetBoids();
      allocPassTargets();
      updateInteractionBounds();
    };

    updateInteractionBounds();
    window.addEventListener("resize", onResize);
    interactionTarget.addEventListener("mousemove", onMove);
    interactionTarget.addEventListener("mouseleave", onLeave);
    interactionTarget.addEventListener("mousedown", onMouseDown);
    interactionTarget.addEventListener("mouseup", onMouseUp);
    interactionTarget.addEventListener("contextmenu", onContextMenu);

	    runningRef.current = true;
	    let raf = 0;
	    let accumulatorMs = 0;
	    let lastRafTime = 0;

	    const loop = (time: number) => {
	      if (!runningRef.current) return;
	      const isHidden =
	        effectiveVisibilityRef.current <= 0.02 ||
	        (typeof document !== "undefined" && document.hidden);

	      if (lastRafTime <= 0) {
	        lastRafTime = time;
	      }

	      let rafDeltaMs = time - lastRafTime;
	      lastRafTime = time;

	      if (isHidden) {
	        accumulatorMs = 0;
	        raf = requestAnimationFrame(loop);
	        return;
	      }

	      const simulationStepMs =
	        boidsRuntime.frameIntervalMs > 0
	          ? boidsRuntime.frameIntervalMs
	          : DEFAULT_SIMULATION_STEP_MS;
	      const maxSimulationStepsPerFrame =
	        boidsRuntime.frameIntervalMs > 0
	          ? THROTTLED_MAX_SIMULATION_STEPS_PER_FRAME
	          : DESKTOP_MAX_SIMULATION_STEPS_PER_FRAME;
	      const clampedFrameDeltaMs = clamp(
	        Number.isFinite(rafDeltaMs) && rafDeltaMs > 0
	          ? rafDeltaMs
	          : simulationStepMs,
	        0,
	        Math.min(
	          MAX_VISIBLE_FRAME_DELTA_MS,
	          simulationStepMs * maxSimulationStepsPerFrame
	        )
	      );
	      accumulatorMs = Math.min(
	        accumulatorMs + clampedFrameDeltaMs,
	        simulationStepMs * maxSimulationStepsPerFrame
	      );

	      const profilerEnabled = isRuntimeProfilerEnabled();
	      const frameStartedAt = profilerEnabled ? performance.now() : 0;
	      let simStepsThisFrame = 0;

	      if (profilerEnabled) {
	        const simulationStartedAt = performance.now();
	        while (
	          accumulatorMs >= simulationStepMs &&
	          simStepsThisFrame < maxSimulationStepsPerFrame
	        ) {
	          step(true);
	          accumulatorMs -= simulationStepMs;
	          simStepsThisFrame++;
	        }
	        recordRuntimeMetric("boids.sim", performance.now() - simulationStartedAt);
	        recordRuntimeMetric("boids.rafDelta", clampedFrameDeltaMs);
	        recordRuntimeMetric(
	          "boids.rafJitter",
	          Math.abs(clampedFrameDeltaMs - simulationStepMs)
	        );
	        recordRuntimeMetric("boids.simBacklogMs", accumulatorMs);
	        recordRuntimeMetric("boids.simStepMs", simulationStepMs);
	        recordRuntimeMetric("boids.simStepsPerFrame", simStepsThisFrame);

	        const drawStartedAt = performance.now();
	        draw(
	          simContext,
	          simulationStepMs > 0 ? accumulatorMs / simulationStepMs : 1
	        );
	        recordRuntimeMetric("boids.draw", performance.now() - drawStartedAt);

	        if (renderMode === "full") {
          const postStartedAt = performance.now();
          renderPost(time);
          recordRuntimeMetric("boids.post", performance.now() - postStartedAt);
        }

	        recordRuntimeMetric("boids.frame", performance.now() - frameStartedAt);
	      } else {
	        while (
	          accumulatorMs >= simulationStepMs &&
	          simStepsThisFrame < maxSimulationStepsPerFrame
	        ) {
	          step(false);
	          accumulatorMs -= simulationStepMs;
	          simStepsThisFrame++;
	        }
	        draw(
	          simContext,
	          simulationStepMs > 0 ? accumulatorMs / simulationStepMs : 1
	        );
	        if (renderMode === "full") {
	          renderPost(time);
	        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(raf);

      window.removeEventListener("resize", onResize);
      interactionTarget.removeEventListener("mousemove", onMove);
      interactionTarget.removeEventListener("mouseleave", onLeave);
      interactionTarget.removeEventListener("mousedown", onMouseDown);
      interactionTarget.removeEventListener("mouseup", onMouseUp);
      interactionTarget.removeEventListener("contextmenu", onContextMenu);

      if (sourceCanvasRef) {
        sourceCanvasRef.current = null;
      }

      if (!gl) {
        return;
      }

      if (passAFramebuffer) gl.deleteFramebuffer(passAFramebuffer);
      if (passBFramebuffer) gl.deleteFramebuffer(passBFramebuffer);
      if (passATexture) gl.deleteTexture(passATexture);
      if (passBTexture) gl.deleteTexture(passBTexture);
      if (sourceTexture) gl.deleteTexture(sourceTexture);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (blurProgram) gl.deleteProgram(blurProgram);
      if (asciiProgram) gl.deleteProgram(asciiProgram);
      if (chromaticProgram) gl.deleteProgram(chromaticProgram);
      if (glowProgram) gl.deleteProgram(glowProgram);
      if (vignetteProgram) gl.deleteProgram(vignetteProgram);
      if (copyProgram) gl.deleteProgram(copyProgram);
    };
  }, [boidsRuntime, interactionTargetRef, renderMode, sourceCanvasRef]);

  useEffect(() => {
    initSkeleton();
    resetBoids();
  }, [boidsRuntime.countMultiplier, countIndex]);

  return (
    <div
      ref={containerRef}
      className={`container ${className ?? ""} ${
        renderMode === "source" ? "containerSource" : ""
      }`}
    >
      <canvas
        ref={(node) => {
          simCanvasRef.current = node;
          if (sourceCanvasRef) {
            sourceCanvasRef.current = node;
          }
        }}
        className="simCanvas"
      />
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
          visibility: ${renderMode === "source" ? "visible" : "hidden"};
          pointer-events: none;
        }
        .containerSource .canvas {
          display: none;
        }
      `}</style>
    </div>
  );
}
