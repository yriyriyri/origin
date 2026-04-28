export type StudioFxPresetId = "neutral" | "boids" | "cymatics";

export type PostFxPassConfig<TUniforms> = {
  enabled: boolean;
  uniforms: TUniforms;
};

export type BlurPassUniforms = {
  blurAmount: number;
};

export type AsciiPassUniforms = {
  pixelation: number;
};

export type ChromaticPassUniforms = {
  strength: number;
};

export type GlowPassUniforms = {
  glowRadius: number;
  glowStrength: number;
  radialFalloff: number;
  radialStrength: number;
};

export type VignettePassUniforms = {
  power: number;
  strength: number;
  zoom: number;
};

export type StudioFxSettings = {
  ascii: PostFxPassConfig<AsciiPassUniforms>;
  blur: PostFxPassConfig<BlurPassUniforms>;
  chromatic: PostFxPassConfig<ChromaticPassUniforms>;
  glow: PostFxPassConfig<GlowPassUniforms>;
  presetId: StudioFxPresetId;
  vignette: PostFxPassConfig<VignettePassUniforms>;
};

const PRESET_SETTINGS: Record<
  StudioFxPresetId,
  Omit<StudioFxSettings, "presetId">
> = {
  neutral: {
    blur: {
      enabled: false,
      uniforms: {
        blurAmount: 6,
      },
    },
    ascii: {
      enabled: false,
      uniforms: {
        pixelation: 1,
      },
    },
    chromatic: {
      enabled: false,
      uniforms: {
        strength: 0.003,
      },
    },
    glow: {
      enabled: false,
      uniforms: {
        glowStrength: 1.35,
        glowRadius: 6,
        radialStrength: 2,
        radialFalloff: 1.65,
      },
    },
    vignette: {
      enabled: false,
      uniforms: {
        strength: 1,
        power: 1.1,
        zoom: 1.5,
      },
    },
  },
  boids: {
    blur: {
      enabled: true,
      uniforms: {
        blurAmount: 6,
      },
    },
    ascii: {
      enabled: true,
      uniforms: {
        pixelation: 0.7,
      },
    },
    chromatic: {
      enabled: true,
      uniforms: {
        strength: 0.003,
      },
    },
    glow: {
      enabled: true,
      uniforms: {
        glowStrength: 2.0,
        glowRadius: 6,
        radialStrength: 2,
        radialFalloff: 1.65,
      },
    },
    vignette: {
      enabled: false,
      uniforms: {
        strength: 3,
        power: 1.1,
        zoom: 1.5,
      },
    },
  },
  cymatics: {
    blur: {
      enabled: true,
      uniforms: {
        blurAmount: 6,
      },
    },
    ascii: {
      enabled: true,
      uniforms: {
        pixelation: 0.5,
      },
    },
    chromatic: {
      enabled: true,
      uniforms: {
        strength: 0.003,
      },
    },
    glow: {
      enabled: true,
      uniforms: {
        glowStrength: 2.4,
        glowRadius: 7,
        radialStrength: 0.8,
        radialFalloff: 1.45,
      },
    },
    vignette: {
      enabled: false,
      uniforms: {
        strength: 3,
        power: 1.1,
        zoom: 1.5,
      },
    },
  },
};

export const STUDIO_FX_PRESET_LABELS: Record<StudioFxPresetId, string> = {
  neutral: "Neutral",
  boids: "Boids",
  cymatics: "Cymatics",
};

export const STUDIO_FX_PRESET_ORDER: StudioFxPresetId[] = [
  "neutral",
  "boids",
  "cymatics",
];

export const createStudioFxSettings = (
  presetId: StudioFxPresetId
): StudioFxSettings =>
  structuredClone({
    presetId,
    ...PRESET_SETTINGS[presetId],
  });

export const scaleStudioFxSettings = (
  settings: StudioFxSettings,
  effectScale: number
): StudioFxSettings => {
  const scaled = Math.max(1, effectScale);

  return {
    ...structuredClone(settings),
    blur: {
      ...settings.blur,
      uniforms: {
        blurAmount: settings.blur.uniforms.blurAmount * scaled,
      },
    },
    ascii: {
      ...settings.ascii,
      uniforms: {
        pixelation: settings.ascii.uniforms.pixelation * scaled,
      },
    },
    glow: {
      ...settings.glow,
      uniforms: {
        ...settings.glow.uniforms,
        glowRadius: settings.glow.uniforms.glowRadius * scaled,
      },
    },
  };
};
