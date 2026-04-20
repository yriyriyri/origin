import type { StudioFxPresetId } from "@/lib/studioFx";

export type StudioMode = "image" | "boids" | "cymatics";

export type BoidsStudioSettings = {
  densityIndex: number;
  flocking: number;
  separation: number;
  size: number;
  speed: number;
};

export type CymaticsStudioSettings = {
  harmonicM: number;
  harmonicN: number;
  mainHue: number;
  hueShift: number;
  nodePull: number;
  particleDensity: number;
};

export const BOIDS_STUDIO_DENSITY_COUNTS = [
  2000,
  1200,
  600,
] as const;

export const STUDIO_MODE_LABELS: Record<StudioMode, string> = {
  image: "Image",
  boids: "Creature",
  cymatics: "Cymatics",
};

export const STUDIO_MODE_DEFAULT_PRESETS: Record<
  StudioMode,
  StudioFxPresetId
> = {
  image: "boids",
  boids: "boids",
  cymatics: "cymatics",
};

export const createDefaultBoidsStudioSettings = (): BoidsStudioSettings => ({
  densityIndex: 0,
  flocking: 1,
  separation: 1,
  size: 5,
  speed: 1,
});

export const createDefaultCymaticsStudioSettings =
  (): CymaticsStudioSettings => ({
    harmonicM: 2,
    harmonicN: 5,
    mainHue: 235,
    hueShift: 0.17,
    nodePull: 1,
    particleDensity: 2.3,
  });
