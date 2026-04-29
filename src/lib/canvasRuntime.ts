export type CanvasRuntimeTier = "desktop" | "mobile";

export type BoidsPassConfig = {
  ascii: boolean;
  blur: boolean;
  chromatic: boolean;
  glow: boolean;
  vignette: boolean;
};

export type CymaticsPassConfig = {
  ascii: boolean;
  blur: boolean;
  chromatic: boolean;
  glow: boolean;
  vignette: boolean;
};

export type CanvasRuntimeProfile = {
  boids: {
    countMultiplier: number;
    dprCap: number;
    frameIntervalMs: number;
    passes: BoidsPassConfig;
    powerPreference: WebGLPowerPreference;
  };
  cymatics: {
    densityMultiplier: number;
    dprCap: number;
    frameIntervalMs: number;
    glowOverscan: number;
    nodeProjectionSteps: number;
    particleMax: number;
    particleMin: number;
    passes: CymaticsPassConfig;
    powerPreference: WebGLPowerPreference;
  };
  isMobile: boolean;
  tier: CanvasRuntimeTier;
};

export const DESKTOP_CANVAS_RUNTIME: CanvasRuntimeProfile = {
  tier: "desktop",
  isMobile: false,
  boids: {
    dprCap: 2,
    countMultiplier: 1,
    frameIntervalMs: 0,
    powerPreference: "high-performance",
    passes: {
      blur: true,
      ascii: true,
      chromatic: true,
      glow: true,
      vignette: false,
    },
  },
  cymatics: {
    dprCap: 2,
    densityMultiplier: 1,
    frameIntervalMs: 0,
    glowOverscan: 0.12,
    nodeProjectionSteps: 2,
    particleMin: 500,
    particleMax: 4400,
    powerPreference: "high-performance",
    passes: {
      blur: true,
      ascii: true,
      chromatic: true,
      glow: true,
      vignette: true,
    },
  },
};

export const MOBILE_CANVAS_RUNTIME: CanvasRuntimeProfile = {
  tier: "mobile",
  isMobile: true,
  boids: {
    dprCap: 1,
    countMultiplier: 0.55,
    frameIntervalMs: 33,
    powerPreference: "low-power",
    passes: {
      blur: true,
      ascii: true,
      chromatic: false,
      glow: false,
      vignette: false,
    },
  },
  cymatics: {
    dprCap: 1,
    densityMultiplier: 0.6,
    frameIntervalMs: 33,
    glowOverscan: 0.06,
    nodeProjectionSteps: 1,
    particleMin: 240,
    particleMax: 1600,
    powerPreference: "low-power",
    passes: {
      blur: true,
      ascii: true,
      chromatic: false,
      glow: true,
      vignette: true,
    },
  },
};

const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export const detectMobileCanvasRuntime = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean;
    };
  };
  const uaDataMobile = navigatorWithUAData.userAgentData?.mobile;

  if (typeof uaDataMobile === "boolean") {
    return uaDataMobile;
  }

  const iPadLikeDesktop =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return iPadLikeDesktop || MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);
};
