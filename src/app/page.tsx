"use client";

import Boids from "@/components/Boids";
import CymaticVisualizer, {
  type CymaticAgentVariant,
  type CymaticSharedPreset,
} from "@/components/CymaticVisualizer";
import GlassOrb from "@/components/GlassOrb";
import SmoothScroll from "@/components/SmoothScroll";
import { useCanvasRuntimeProfile } from "@/hooks/useCanvasRuntimeProfile";
import {
  desaturateRgbPerceptual,
  getTransitionSaturation,
  mixRgbPerceptual,
  rgbUnitTo255,
  type Rgb255,
} from "@/lib/colorMix";
import {
  isRuntimeProfilerEnabled,
  recordRuntimeMetric,
} from "@/lib/runtimeProfiler";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type PlaceholderCardVisual = {
  opacity: number;
  pixelate: number;
  translateY: number;
};

type ScrollVisualSnapshot = {
  aboutOpacity: number;
  aboutPixelate: number;
  aboutTranslateY: number;
  boidsOverlayOpacity: number;
  disperseAmount: number;
  hintOpacity: number;
  placeholderCards: PlaceholderCardVisual[];
  scrollProgress: number;
  titleOpacity: number;
  titlePixelate: number;
  visualizerOpacity: number;
  visualizerValue: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const TEXT_BLUR_MAX_PX = 14;
const BOIDS_SCALE = 1.5;
const HERO_ABOUT_IN_END = 0.58;
const HERO_TITLE_RETURN_END = 0.26;
const HERO_CONTENT_OFFSET = HERO_TITLE_RETURN_END;
const HERO_ABOUT_OUT_START = 1.28;
const HERO_ABOUT_OUT_DURATION = 0.56;
const HERO_EXIT_START = 1.12;
const HERO_EXIT_DURATION = 0.88;
const HERO_TITLE_FOCUS_EXTENSION = 0.34;
const HERO_ABOUT_FOCUS_EXTENSION = 0.56;
const HERO_ABOUT_IN_START =
  HERO_CONTENT_OFFSET + HERO_TITLE_FOCUS_EXTENSION;
const HERO_TITLE_OUT_START =
  HERO_TITLE_RETURN_END + HERO_TITLE_FOCUS_EXTENSION;
const HERO_ABOUT_OUT_START_SCROLL =
  HERO_CONTENT_OFFSET +
  HERO_ABOUT_OUT_START +
  HERO_TITLE_FOCUS_EXTENSION +
  HERO_ABOUT_FOCUS_EXTENSION;
const HERO_EXIT_START_SCROLL =
  HERO_CONTENT_OFFSET +
  HERO_EXIT_START +
  HERO_TITLE_FOCUS_EXTENSION +
  HERO_ABOUT_FOCUS_EXTENSION;
const HOMEPAGE_CYMATIC_SHARED_PRESET: CymaticSharedPreset = {
  sourceSettings: {
    hueShift: 0,
    nodePull: 1,
    particleDensity: 2.42,
    particleSize: 1.92,
  },
  fxSettings: {
    presetId: "cymatics",
    blur: {
      enabled: true,
      uniforms: {
        blurAmount: 0.5,
      },
    },
    ascii: {
      enabled: true,
      uniforms: {
        pixelation: 0.5,
        saturation: 1.7,
      },
    },
    chromatic: {
      enabled: false,
      uniforms: {
        strength: 0.002,
      },
    },
    glow: {
      enabled: true,
      uniforms: {
        glowStrength: 2.15,
        glowRadius: 5.0,
        radialStrength: 2.4,
        radialFalloff: 1.45,
      },
    },
    vignette: {
      enabled: false,
      uniforms: {
        strength: 1.3,
        power: 0.8,
        zoom: 1.3,
      },
    },
  },
};
const HOMEPAGE_CYMATIC_AGENT_VARIANTS: CymaticAgentVariant[] = [
  {
    baseBlue: 255,
    baseGreen: 255,
    baseRed: 255,
    harmonicM: 4,
    harmonicN: 5,
  },
  {
    baseBlue: 184,
    baseGreen: 206,
    baseRed: 168,
    harmonicM: 4,
    harmonicN: 1,
  },
  {
    baseBlue: 0,
    baseGreen: 0,
    baseRed: 255,
    harmonicM: 5,
    harmonicN: 1,
  },
  {
    baseBlue: 255,
    baseGreen: 112,
    baseRed: 0,
    harmonicM: 7,
    harmonicN: 2,
  },
];
const DEFAULT_ORB_TINTS: readonly Rgb255[] = [
  { r: 255, g: 255, b: 255 },
  { r: 168, g: 206, b: 184 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 112, b: 255 },
] as const;
const HERO_SCROLL_SPACER_VH =
  2 + HERO_TITLE_FOCUS_EXTENSION + HERO_ABOUT_FOCUS_EXTENSION;
const PLACEHOLDER_FADE_IN = 0.24;
const PLACEHOLDER_HOLD = 0.62;
const PLACEHOLDER_FADE_OUT = 1 - PLACEHOLDER_HOLD;
const PLACEHOLDER_FOCUS_EXTENSION = 0.44;
const PLACEHOLDER_ACTIVE_HOLD =
  PLACEHOLDER_HOLD + PLACEHOLDER_FOCUS_EXTENSION;
const PLACEHOLDER_STEP = PLACEHOLDER_ACTIVE_HOLD + PLACEHOLDER_FADE_OUT;

const getAgentCardVisibility = (phase: number, isLast: boolean) => {
  let visibility = 0;

  if (phase >= -PLACEHOLDER_FADE_IN && phase < 0) {
    visibility = ease((phase + PLACEHOLDER_FADE_IN) / PLACEHOLDER_FADE_IN);
  } else if (phase >= 0 && phase <= PLACEHOLDER_ACTIVE_HOLD) {
    visibility = 1;
  } else if (phase > PLACEHOLDER_ACTIVE_HOLD) {
    visibility = isLast
      ? 1
      : 1 - ease((phase - PLACEHOLDER_ACTIVE_HOLD) / PLACEHOLDER_FADE_OUT);
  }

  return clamp01(visibility);
};

const getAgentDisplayValue = (timeline: number, total: number) => {
  const lastStart = (total - 1) * PLACEHOLDER_STEP;
  const capped = Math.min(
    Math.max(0, timeline),
    lastStart + PLACEHOLDER_ACTIVE_HOLD
  );
  const index = Math.min(total - 1, Math.floor(capped / PLACEHOLDER_STEP));
  const phase = capped - index * PLACEHOLDER_STEP;

  if (index === total - 1 || phase <= PLACEHOLDER_ACTIVE_HOLD) {
    return index + 1;
  }

  return (
    index +
    1 +
    clamp01((phase - PLACEHOLDER_ACTIVE_HOLD) / PLACEHOLDER_FADE_OUT)
  );
};

const getTextBlurFilter = (progress: number) => {
  const active = clamp01(progress);
  if (active <= 0.001) {
    return "none";
  }

  return `blur(${(ease(active) * TEXT_BLUR_MAX_PX).toFixed(2)}px)`;
};

const getVisualizerShellOpacity = (visibility: number) => {
  const active = clamp01(visibility);
  if (active <= 0.001) {
    return 0;
  }

  return ease(active);
};

const getDefaultOrbTint = (index: number): Rgb255 =>
  DEFAULT_ORB_TINTS[
    Math.min(DEFAULT_ORB_TINTS.length - 1, Math.max(0, index))
  ];

const getOrbTint = (
  value: number,
  variants: readonly CymaticAgentVariant[]
): Rgb255 => {
  const count = Math.max(DEFAULT_ORB_TINTS.length, variants.length);
  const clamped = Math.min(Math.max(value, 1), count);
  const baseIndex = Math.min(count - 1, Math.max(0, Math.floor(clamped) - 1));
  const nextIndex = Math.min(count - 1, baseIndex + 1);
  const mix = nextIndex === baseIndex ? 0 : clamped - (baseIndex + 1);
  const from = variants[baseIndex]
    ? {
        r: variants[baseIndex].baseRed,
        g: variants[baseIndex].baseGreen,
        b: variants[baseIndex].baseBlue,
      }
    : getDefaultOrbTint(baseIndex);
  const to = variants[nextIndex]
    ? {
        r: variants[nextIndex].baseRed,
        g: variants[nextIndex].baseGreen,
        b: variants[nextIndex].baseBlue,
      }
    : getDefaultOrbTint(nextIndex);

  return rgbUnitTo255(
    desaturateRgbPerceptual(
      mixRgbPerceptual(
        {
          r: from.r / 255,
          g: from.g / 255,
          b: from.b / 255,
        },
        {
          r: to.r / 255,
          g: to.g / 255,
          b: to.b / 255,
        },
        mix
      ),
      getTransitionSaturation(mix)
    )
  );
};

const getScrollVisualSnapshot = (
  scroll: number,
  vh: number,
  maxScroll: number,
  placeholderProgress: number
): ScrollVisualSnapshot => {
  const aboutProgress = clamp01(
    (scroll - vh * HERO_ABOUT_IN_START) / (vh * HERO_ABOUT_IN_END)
  );
  const titleProgress = clamp01(
    (scroll - vh * HERO_TITLE_OUT_START) /
      (vh * Math.max(0.001, HERO_ABOUT_IN_END - HERO_TITLE_RETURN_END))
  );
  const aboutFadeProgress = clamp01(
    (scroll - vh * HERO_ABOUT_OUT_START_SCROLL) / (vh * HERO_ABOUT_OUT_DURATION)
  );
  const exitProgress = clamp01(
    (scroll - vh * HERO_EXIT_START_SCROLL) / (vh * HERO_EXIT_DURATION)
  );

  const aboutIn = aboutProgress;
  const aboutOut = 1 - aboutFadeProgress;
  const aboutPixelate = Math.max(1 - aboutIn, aboutFadeProgress);
  const aboutOpacity = Math.min(aboutIn, aboutOut);
  const aboutTranslateY =
    aboutIn < 1 ? 24 * (1 - aboutIn) : -14 * aboutFadeProgress;

  const titlePixelate = titleProgress;
  const titleOpacity = 1 - titleProgress;

  const hintOpacity = Math.max(0, 1 - aboutProgress * 3);
  const placeholderTotalSpan =
    (PLACEHOLDER_PAIRS.length - 1) * PLACEHOLDER_STEP + PLACEHOLDER_FADE_IN;
  const placeholderTimeline =
    -PLACEHOLDER_FADE_IN + placeholderProgress * placeholderTotalSpan;
  const innatePhase = placeholderTimeline;
  const boidsOverlayOpacity = clamp01(
    (innatePhase + PLACEHOLDER_FADE_IN) / PLACEHOLDER_FADE_IN
  );
  const disperseAmount = exitProgress * (1 - boidsOverlayOpacity * 0.85);

  const placeholderCards = PLACEHOLDER_PAIRS.map((_, index) => {
    const phase = placeholderTimeline - index * PLACEHOLDER_STEP;
    const visibility = getAgentCardVisibility(
      phase,
      index === PLACEHOLDER_PAIRS.length - 1
    );
    const pixelate = 1 - visibility;

    return {
      opacity: Math.pow(visibility, 1.15),
      pixelate,
      translateY:
        phase < 0 ? 28 * (1 - visibility) : -18 * (1 - visibility),
    };
  });

  const visualizerOpacity = PLACEHOLDER_PAIRS.reduce((maxVisibility, _, index) => {
    const phase = placeholderTimeline - index * PLACEHOLDER_STEP;
    const visibility = getAgentCardVisibility(
      phase,
      index === PLACEHOLDER_PAIRS.length - 1
    );
    return Math.max(maxVisibility, visibility);
  }, 0);

  return {
    aboutOpacity,
    aboutPixelate,
    aboutTranslateY,
    boidsOverlayOpacity,
    disperseAmount,
    hintOpacity,
    placeholderCards,
    scrollProgress: clamp01(scroll / maxScroll),
    titleOpacity,
    titlePixelate,
    visualizerOpacity,
    visualizerValue: getAgentDisplayValue(
      placeholderTimeline,
      PLACEHOLDER_PAIRS.length
    ),
  };
};

const PLACEHOLDER_PAIRS = [
  {
    title: "innate",
    body: "innate is the core intelligence engine. the foundation layer that learns the shape of your organization and compounds with every decision it touches.",
  },
  {
    title: "atlas",
    body: "content ontology platform. maps the entire landscape of audio content into navigable, queryable intelligence.",
  },
  {
    title: "pulse",
    body: "social listening and sentiment. surfaces what matters from the noise — real-time cultural pulse for entertainment organizations.",
  },
  {
    title: "daisy",
    body: "artist development ai. identifies, tracks, and models the trajectory of emerging talent before the market catches on.",
  },
] as const;

const INITIAL_SCROLL_VISUALS = getScrollVisualSnapshot(0, 1, 1, 0);

export default function Home() {
  const {
    isMobile: isMobileRuntime,
    isReady: runtimeReady,
    profile: canvasRuntimeProfile,
  } = useCanvasRuntimeProfile();
  const mainRef = useRef<HTMLElement | null>(null);
  const boidsFadeRef = useRef<HTMLDivElement | null>(null);
  const heroIntroRef = useRef<HTMLDivElement | null>(null);
  const aboutCopyRef = useRef<HTMLDivElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);
  const placeholderVisualizerShellRef = useRef<HTMLDivElement | null>(null);
  const placeholderCardRefs = useRef<Array<HTMLElement | null>>([]);
  const placeholderSectionRef = useRef<HTMLElement | null>(null);
  const placeholderMetricsRef = useRef({
    maxScroll: 1,
    sectionTop: 0,
    stickyTravel: 1,
    vh: 1,
  });
  const scrollOverlayTimeoutRef = useRef<number | null>(null);
  const boidsDisperseRef = useRef(INITIAL_SCROLL_VISUALS.disperseAmount);
  const boidsVisibilityRef = useRef(
    1 - INITIAL_SCROLL_VISUALS.boidsOverlayOpacity
  );
  const visualizerValueRef = useRef(INITIAL_SCROLL_VISUALS.visualizerValue);
  const visualizerOpacityRef = useRef(INITIAL_SCROLL_VISUALS.visualizerOpacity);
  const [siteInvert, setSiteInvert] = useState(false);

  const applyScrollVisuals = useCallback((visuals: ScrollVisualSnapshot) => {
    const main = mainRef.current;
    if (main) {
      main.style.setProperty("--scroll-progress", `${visuals.scrollProgress}`);
    }

    boidsDisperseRef.current = visuals.disperseAmount;
    boidsVisibilityRef.current = 1 - visuals.boidsOverlayOpacity;
    visualizerValueRef.current = visuals.visualizerValue;
    visualizerOpacityRef.current = visuals.visualizerOpacity;

    if (boidsFadeRef.current) {
      boidsFadeRef.current.style.opacity = `${1 - visuals.boidsOverlayOpacity}`;
    }

    if (heroIntroRef.current) {
      heroIntroRef.current.style.opacity = `${visuals.titleOpacity}`;
      heroIntroRef.current.style.filter = getTextBlurFilter(visuals.titlePixelate);
    }

    if (aboutCopyRef.current) {
      aboutCopyRef.current.style.opacity = `${visuals.aboutOpacity}`;
      aboutCopyRef.current.style.filter = getTextBlurFilter(
        visuals.aboutPixelate
      );
      aboutCopyRef.current.style.transform = `translateY(${visuals.aboutTranslateY}px)`;
    }

    if (scrollHintRef.current) {
      scrollHintRef.current.style.opacity = `${visuals.hintOpacity}`;
    }

    if (placeholderVisualizerShellRef.current) {
      placeholderVisualizerShellRef.current.style.opacity = `${getVisualizerShellOpacity(
        visuals.visualizerOpacity
      )}`;
      const orbTint = getOrbTint(
        visuals.visualizerValue,
        HOMEPAGE_CYMATIC_AGENT_VARIANTS
      );
      placeholderVisualizerShellRef.current.style.setProperty(
        "--orb-tint-r",
        `${Math.round(orbTint.r)}`
      );
      placeholderVisualizerShellRef.current.style.setProperty(
        "--orb-tint-g",
        `${Math.round(orbTint.g)}`
      );
      placeholderVisualizerShellRef.current.style.setProperty(
        "--orb-tint-b",
        `${Math.round(orbTint.b)}`
      );
    }

    visuals.placeholderCards.forEach((card, index) => {
      const node = placeholderCardRefs.current[index];
      if (!node) {
        return;
      }

      node.style.opacity = `${card.opacity}`;
      node.style.filter = getTextBlurFilter(card.pixelate);
      node.style.transform = `translateY(${card.translateY}px)`;
    });
  }, []);

  const updatePlaceholderMetrics = useCallback(() => {
    const vh = window.innerHeight;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const placeholderSection = placeholderSectionRef.current;

    if (!placeholderSection) {
      placeholderMetricsRef.current = {
        maxScroll,
        sectionTop: 0,
        stickyTravel: 1,
        vh,
      };
      return;
    }

    const rect = placeholderSection.getBoundingClientRect();
    placeholderMetricsRef.current = {
      maxScroll,
      sectionTop: window.scrollY + rect.top,
      stickyTravel: Math.max(1, placeholderSection.offsetHeight - vh),
      vh,
    };
  }, []);

  const setScrollOverlayVisible = useCallback((visible: boolean) => {
    const main = mainRef.current;
    if (!main) {
      return;
    }

    main.style.setProperty("--scroll-overlay-opacity", visible ? "1" : "0");
    main.style.setProperty(
      "--scroll-overlay-translate",
      visible ? "0px" : "12px"
    );
  }, []);

  const handleScroll = useCallback((scroll: number, showIndicator = true) => {
    const { maxScroll, sectionTop, stickyTravel, vh } = placeholderMetricsRef.current;
    const placeholderProgress = clamp01((scroll - sectionTop) / stickyTravel);
    const profilerEnabled = isRuntimeProfilerEnabled();
    const startedAt = profilerEnabled ? performance.now() : 0;

    applyScrollVisuals(
      getScrollVisualSnapshot(scroll, vh, maxScroll, placeholderProgress)
    );

    if (profilerEnabled) {
      recordRuntimeMetric("scroll.apply", performance.now() - startedAt);
    }

    if (showIndicator) {
      setScrollOverlayVisible(true);

      if (scrollOverlayTimeoutRef.current !== null) {
        window.clearTimeout(scrollOverlayTimeoutRef.current);
      }

      scrollOverlayTimeoutRef.current = window.setTimeout(() => {
        setScrollOverlayVisible(false);
        scrollOverlayTimeoutRef.current = null;
      }, 160);
    }
  }, [applyScrollVisuals, setScrollOverlayVisible]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
  
      const isTypingTarget =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;
  
      if (isTypingTarget) return;
  
      if (e.code === "Space") {
        e.preventDefault();
        setSiteInvert((v) => !v);
      }
    };
  
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const syncScrollState = () => {
      updatePlaceholderMetrics();
      handleScroll(window.scrollY, false);
    };

    syncScrollState();
    window.addEventListener("resize", syncScrollState);
    const placeholderSection = placeholderSectionRef.current;
    const observer = placeholderSection
      ? new ResizeObserver(syncScrollState)
      : null;
    if (placeholderSection && observer) {
      observer.observe(placeholderSection);
    }

    return () => {
      window.removeEventListener("resize", syncScrollState);
      observer?.disconnect();
    };
  }, [handleScroll, updatePlaceholderMetrics]);

  useLayoutEffect(() => {
    updatePlaceholderMetrics();
    handleScroll(window.scrollY, false);
  }, [handleScroll, updatePlaceholderMetrics]);

  useEffect(() => {
    return () => {
      if (scrollOverlayTimeoutRef.current !== null) {
        window.clearTimeout(scrollOverlayTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <SmoothScroll
        onScroll={handleScroll}
      />

      <main
        ref={mainRef}
        data-mobile-runtime={isMobileRuntime ? "true" : "false"}
        style={
          {
            "--scroll-overlay-opacity": "0",
            "--scroll-overlay-translate": "12px",
            "--scroll-progress": "0",
            "--site-filter": siteInvert
              ? "invert(1) grayscale(1)"
              : "none",
          } as CSSProperties
        }
      >
        <div className="boids-bg">
          {runtimeReady && !isMobileRuntime ? (
            <div
              ref={boidsFadeRef}
              className="boids-canvas-wrapper"
              style={{ opacity: 1 - INITIAL_SCROLL_VISUALS.boidsOverlayOpacity }}
            >
              <Boids
                disperse={INITIAL_SCROLL_VISUALS.disperseAmount}
                disperseValueRef={boidsDisperseRef}
                runtimeProfile={canvasRuntimeProfile!}
                visibilityRefExternal={boidsVisibilityRef}
              />
            </div>
          ) : null}
        </div>

        <div className="scroll-progress-overlay">
          <div className="scroll-progress-indicator" />
        </div>

        <div className="fixed-overlay">
          <div
            ref={heroIntroRef}
            className="hero-intro"
            style={{
              opacity: INITIAL_SCROLL_VISUALS.titleOpacity,
              filter: getTextBlurFilter(INITIAL_SCROLL_VISUALS.titlePixelate),
            }}
          >
            <span className="hero-intro-word">origin</span>
            <span className="hero-intro-copy">| intelligence infrastructure</span>
          </div>

          <div
            ref={aboutCopyRef}
            className="about-copy"
            style={{
              filter: getTextBlurFilter(INITIAL_SCROLL_VISUALS.aboutPixelate),
              opacity: INITIAL_SCROLL_VISUALS.aboutOpacity,
              transform: `translateY(${INITIAL_SCROLL_VISUALS.aboutTranslateY}px)`,
            }}
          >
            <div className="about-kicker about-left">about</div>

            <div className="about-body">
              <p>
                origin partners with labels, live entertainment companies, and
                catalog managers to build intelligence systems that form the
                instincts behind every decision.
              </p>
            </div>
          </div>

          <div
            ref={scrollHintRef}
            className="scroll-hint"
            style={{ opacity: INITIAL_SCROLL_VISUALS.hintOpacity }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
            </svg>
          </div>
        </div>

        <div className="placeholder-overlay">
          <div className="placeholder-copy">
            {PLACEHOLDER_PAIRS.map((pair, index) => (
              <article
                key={pair.title}
                ref={(node) => {
                  placeholderCardRefs.current[index] = node;
                }}
                className="placeholder-card"
                style={{
                  opacity: INITIAL_SCROLL_VISUALS.placeholderCards[index].opacity,
                  filter: getTextBlurFilter(
                    INITIAL_SCROLL_VISUALS.placeholderCards[index].pixelate
                  ),
                  transform: `translateY(${INITIAL_SCROLL_VISUALS.placeholderCards[index].translateY}px)`,
                }}
              >
                <h2 className="placeholder-title">{pair.title}</h2>
                <div className="placeholder-body">
                  {pair.body.split("\n").map((line) => (
                    <p key={`${pair.title}-${line}`}>{line}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div
            ref={placeholderVisualizerShellRef}
            className="placeholder-visualizer"
            style={{
              opacity: getVisualizerShellOpacity(
                INITIAL_SCROLL_VISUALS.visualizerOpacity
              ),
              "--orb-tint-r": `${Math.round(
                getOrbTint(
                  INITIAL_SCROLL_VISUALS.visualizerValue,
                  HOMEPAGE_CYMATIC_AGENT_VARIANTS
                ).r
              )}`,
              "--orb-tint-g": `${Math.round(
                getOrbTint(
                  INITIAL_SCROLL_VISUALS.visualizerValue,
                  HOMEPAGE_CYMATIC_AGENT_VARIANTS
                ).g
              )}`,
              "--orb-tint-b": `${Math.round(
                getOrbTint(
                  INITIAL_SCROLL_VISUALS.visualizerValue,
                  HOMEPAGE_CYMATIC_AGENT_VARIANTS
                ).b
              )}`,
            } as CSSProperties}
          >
            <GlassOrb
              className="placeholder-visualizer-orb"
              contentClassName="placeholder-visualizer-inner"
              tint={getOrbTint(
                INITIAL_SCROLL_VISUALS.visualizerValue,
                HOMEPAGE_CYMATIC_AGENT_VARIANTS
              )}
            >
              {runtimeReady && !isMobileRuntime ? (
                <CymaticVisualizer
                  agentVariants={HOMEPAGE_CYMATIC_AGENT_VARIANTS}
                  sharedPreset={HOMEPAGE_CYMATIC_SHARED_PRESET}
                  value={INITIAL_SCROLL_VISUALS.visualizerValue}
                  opacity={1}
                  opacityRefExternal={visualizerOpacityRef}
                  runtimeProfile={canvasRuntimeProfile!}
                  valueRefExternal={visualizerValueRef}
                />
              ) : null}
            </GlassOrb>
          </div>
        </div>

        <div className="scroll-spacer" />

        <section className="placeholder-section" ref={placeholderSectionRef} />
      </main>

      <style jsx>{`
        main {
          position: relative;
          width: 100%;
        }

        .boids-bg {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 0;
          filter: var(--site-filter);
          transform: scale(${BOIDS_SCALE});
          transform-origin: center center;
          will-change: transform;
        }

        .boids-canvas-wrapper {
          position: absolute;
          inset: 0;
          will-change: opacity;
        }

        .fixed-overlay {
          --about-left-offset: 56px;
          --section-header-top-offset: 80px;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          z-index: 2;
          pointer-events: none;
          padding: 40px 48px;
          filter: var(--site-filter);
        }

        .scroll-progress-overlay {
          position: fixed;
          top: 28px;
          right: 0;
          width: 72px;
          height: calc(100vh - 56px);
          z-index: 4;
          pointer-events: none;
          filter: var(--site-filter);
          opacity: calc(0.72 * var(--scroll-overlay-opacity));
          transform: translateX(var(--scroll-overlay-translate));
          transition:
            opacity 180ms ease,
            transform 180ms ease;
        }

        .scroll-progress-indicator {
          position: absolute;
          right: 28px;
          top: 0;
          width: 4px;
          height: 100%;
          background: rgba(255, 255, 255, 0.1);
        }

        .scroll-progress-indicator::after {
          content: "";
          position: absolute;
          inset: 0 auto auto 0;
          width: 100%;
          height: calc(var(--scroll-progress) * 100%);
          background: #ffffff;
        }

        .placeholder-overlay {
          --about-left-offset: 56px;
          --section-header-top-offset: 80px;
          --overlay-content-width: calc(100vw - 96px);
          --text-column-width: min(770px, calc(100vw - 124px));
          --text-column-right: calc(
            var(--about-left-offset) + var(--text-column-width)
          );
          --visualizer-area-width: calc(
            var(--overlay-content-width) - var(--text-column-right)
          );
          position: fixed;
          inset: 0;
          z-index: 3;
          padding: 40px 48px;
          pointer-events: none;
          filter: var(--site-filter);
        }

        .placeholder-copy {
          position: absolute;
          inset: 0;
        }

        .placeholder-visualizer {
          position: absolute;
          top: 50%;
          left: calc(
            var(--text-column-right) +
              (var(--overlay-content-width) - var(--text-column-right)) / 2
          );
          transform: translate(-50%, -50%);
          width: min(520px, calc(var(--visualizer-area-width) + 64px), 46vw);
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .placeholder-visualizer-orb {
          width: 100%;
        }

        .placeholder-visualizer-inner :global(.root) {
          width: 100%;
          height: 100%;
        }

        .placeholder-visualizer-inner {
          width: 100%;
          height: 100%;
        }

        .placeholder-visualizer-inner :global(.root) {
          width: 100%;
          height: 100%;
        }

        .placeholder-visualizer-inner :global(.square) {
          width: 100%;
          height: 100%;
        }

        .hero-intro {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: inline-flex;
          align-items: baseline;
          justify-content: center;
          gap: clamp(36px, 4.2vw, 72px);
          width: max-content;
          max-width: calc(100% - 96px);
          font-family: var(--font-space-grotesk);
          font-size: clamp(21px, 2.5vw, 33px);
          font-weight: 500;
          line-height: 1.2;
          letter-spacing: 0.08em;
          user-select: none;
          color: #ffffff;
          text-align: center;
          text-transform: lowercase;
          text-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
          will-change: filter, opacity;
        }

        .hero-intro-word,
        .hero-intro-copy {
          display: inline-block;
          white-space: nowrap;
        }

        .about-copy {
          position: absolute;
          inset: 0;
          will-change: filter, opacity, transform;
        }

        .about-left {
          position: absolute;
          top: var(--section-header-top-offset);
          left: var(--about-left-offset);
        }

        .about-body {
          position: absolute;
          top: 50%;
          left: var(--about-left-offset);
          width: min(770px, calc(100vw - 124px));
          max-width: 770px;
          transform: translateY(-50%);
        }

        .about-kicker,
        .placeholder-title {
          font-family: var(--font-space-grotesk);
          font-size: clamp(18px, 2.55vw, 31px);
          font-weight: 400;
          line-height: 1.1;
          letter-spacing: 0.03em;
          text-transform: lowercase;
          color: #ffffff;
          text-shadow: 0 0 28px rgba(0, 0, 0, 0.45);
        }

        .about-kicker {
          margin-bottom: 28px;
        }

        .placeholder-title {
          position: absolute;
          top: var(--section-header-top-offset);
          left: var(--about-left-offset);
          margin: 0;
        }

        .about-body p,
        .placeholder-body p {
          font-family: var(--font-space-grotesk);
          font-size: clamp(18px, 2.55vw, 31px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 1.6em;
          letter-spacing: 0.01em;
        }

        .about-body p:last-child {
          margin-bottom: 0;
        }

        .scroll-hint {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255, 255, 255, 0.4);
          animation: bounce 2.4s ease-in-out infinite;
          will-change: opacity;
        }

        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }

        .scroll-spacer {
          height: ${HERO_SCROLL_SPACER_VH * 100}vh;
          pointer-events: none;
        }

        .placeholder-section {
          position: relative;
          height: ${(1 + (PLACEHOLDER_PAIRS.length - 1) * PLACEHOLDER_STEP + PLACEHOLDER_FADE_IN) * 100}vh;
        }

        .placeholder-card {
          position: absolute;
          inset: 0;
          will-change: opacity, filter, transform;
        }

        main[data-mobile-runtime="true"] .scroll-progress-overlay {
          display: none;
        }

        main[data-mobile-runtime="true"] .placeholder-overlay {
          --about-left-offset: 24px;
          --section-header-top-offset: 0px;
          --overlay-content-width: calc(100vw - 48px);
          --text-column-width: calc(100vw - 48px);
          --text-column-right: calc(var(--about-left-offset) + var(--text-column-width));
          padding: 20px 24px 36px;
        }

        main[data-mobile-runtime="true"] .placeholder-copy {
          position: absolute;
          inset: auto 0 0 0;
          height: 46vh;
        }

        main[data-mobile-runtime="true"] .placeholder-card {
          inset: auto 0 0 0;
          height: 46vh;
          padding: 0 24px 36px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        main[data-mobile-runtime="true"] .placeholder-title {
          position: static;
          margin: 0;
        }

        main[data-mobile-runtime="true"] .placeholder-body {
          position: static;
          top: auto;
          left: auto;
          width: 100%;
          max-width: none;
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          transform: none;
        }

        main[data-mobile-runtime="true"] .placeholder-visualizer {
          top: 25vh;
          left: 50%;
          bottom: auto;
          width: min(78vw, 384px);
          transform: translate(-50%, -50%);
        }

        main[data-mobile-runtime="true"] .about-copy {
          inset: auto 24px 36px;
          height: 46vh;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        main[data-mobile-runtime="true"] .about-left {
          position: static;
          margin: 0;
        }

        main[data-mobile-runtime="true"] .about-body {
          position: static;
          top: auto;
          left: auto;
          width: 100%;
          max-width: none;
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          transform: none;
        }

        .placeholder-body {
          position: absolute;
          top: 50%;
          left: var(--about-left-offset);
          width: var(--text-column-width);
          max-width: var(--text-column-width);
          transform: translateY(-50%);
        }

        .placeholder-body p:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </>
  );
}
