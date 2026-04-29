"use client";

import {
  DESKTOP_CANVAS_RUNTIME,
  detectMobileCanvasRuntime,
  MOBILE_CANVAS_RUNTIME,
} from "@/lib/canvasRuntime";

export const useCanvasRuntimeProfile = () =>
  detectMobileCanvasRuntime() ? MOBILE_CANVAS_RUNTIME : DESKTOP_CANVAS_RUNTIME;
