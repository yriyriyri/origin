"use client";

import Boids from "@/components/Boids";
import CymaticVisualizer from "@/components/CymaticVisualizer";
import PixelatedTitle from "@/components/PixelatedTitle";
import SmoothScroll from "@/components/SmoothScroll";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type PixelateLevel = {
  cell: number;
  dilate: number;
  tile: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const PIXELATE_LEVELS: readonly PixelateLevel[] = [
  { cell: 1.0, dilate: 0.2, tile: 2.6 },
  { cell: 1.5, dilate: 0.6, tile: 4.3 },
  { cell: 1.75, dilate: 0.8, tile: 5.15 },
  { cell: 2.0, dilate: 1.0, tile: 6.0 },
  { cell: 2.25, dilate: 1.2, tile: 6.85 },
] as const;
const PIXELATE_OPACITY_DROP = 0.24;
const PIXELATE_OPACITY_RAMP = 0.14;
const BOIDS_SCALE = 1.5;
const HERO_ABOUT_IN_END = 0.58;
const HERO_ABOUT_OUT_START = 1.28;
const HERO_ABOUT_OUT_DURATION = 0.56;
const HERO_EXIT_START = 1.12;
const HERO_EXIT_DURATION = 0.88;
const PLACEHOLDER_FADE_IN = 0.24;
const PLACEHOLDER_HOLD = 0.62;
const PLACEHOLDER_FADE_OUT = 1 - PLACEHOLDER_HOLD;

const getAgentCardVisibility = (phase: number, isLast: boolean) => {
  let visibility = 0;

  if (phase >= -PLACEHOLDER_FADE_IN && phase < 0) {
    visibility = ease((phase + PLACEHOLDER_FADE_IN) / PLACEHOLDER_FADE_IN);
  } else if (phase >= 0 && phase <= PLACEHOLDER_HOLD) {
    visibility = 1;
  } else if (phase > PLACEHOLDER_HOLD) {
    visibility = isLast
      ? 1
      : 1 - ease((phase - PLACEHOLDER_HOLD) / PLACEHOLDER_FADE_OUT);
  }

  return clamp01(visibility);
};

const getAgentDisplayValue = (timeline: number, total: number) => {
  if (timeline <= 0) return 1;

  const capped = Math.min(timeline, total - 1 + PLACEHOLDER_HOLD);
  const index = Math.min(total - 1, Math.floor(capped));
  const phase = capped - index;

  if (index === total - 1 || phase <= PLACEHOLDER_HOLD) {
    return index + 1;
  }

  return index + 1 + clamp01((phase - PLACEHOLDER_HOLD) / PLACEHOLDER_FADE_OUT);
};

const getPixelateFilter = (progress: number) => {
  const active = clamp01(progress);
  if (active <= 0.001) {
    return "none";
  }

  const level = Math.min(
    PIXELATE_LEVELS.length,
    Math.max(1, Math.ceil(active * PIXELATE_LEVELS.length))
  );

  return `url(#pixelate-${level})`;
};

const getPixelateOpacity = (progress: number) => {
  const active = clamp01(progress);
  if (active <= 0.001) {
    return 1;
  }

  const ramp = ease(Math.min(1, active / PIXELATE_OPACITY_RAMP));
  return 1 - PIXELATE_OPACITY_DROP * ramp;
};

// const getTitleIntroScale = (progress: number) => {
//   const active = clamp01(progress);
//   if (active < 0.25) return 1.16;
//   if (active < 0.5) return 1.1;
//   if (active < 0.75) return 1.05;
//   return 1;
// };

const getTitleIntroScale = () => 1;

const PLACEHOLDER_PAIRS = [
  {
    title: "Innate",
    body: "Core intelligence engine\nThe foundation layer that learns the shape of your organization and compounds with every decision it touches.",
  },
  {
    title: "Atlas",
    body: "Content ontology platform\nMaps the entire landscape of audio content into navigable, queryable intelligence.",
  },
  {
    title: "Pulse",
    body: "Social listening and sentiment\nSurfaces what matters from the noise — real-time cultural pulse for entertainment organizations.",
  },
  {
    title: "Daisy",
    body: "Artist development AI\nIdentifies, tracks, and models the trajectory of emerging talent before the market catches on.",
  },
] as const;

export default function Home() {
  const [aboutProgress, setAboutProgress] = useState(0);
  const [aboutFadeProgress, setAboutFadeProgress] = useState(0);
  const [exitProgress, setExitProgress] = useState(0);
  const [placeholderProgress, setPlaceholderProgress] = useState(0);
  const placeholderSectionRef = useRef<HTMLElement | null>(null);
  const [siteInvert, setSiteInvert] = useState(false);

  const handleScroll = useCallback((scroll: number) => {
    const vh = window.innerHeight;

    const about = clamp01(scroll / (vh * HERO_ABOUT_IN_END));
    setAboutProgress(about);

    const aboutFade = clamp01(
      (scroll - vh * HERO_ABOUT_OUT_START) / (vh * HERO_ABOUT_OUT_DURATION)
    );
    setAboutFadeProgress(aboutFade);

    const exit = clamp01(
      (scroll - vh * HERO_EXIT_START) / (vh * HERO_EXIT_DURATION)
    );
    setExitProgress(exit);

    const placeholderSection = placeholderSectionRef.current;
    if (!placeholderSection) {
      setPlaceholderProgress(0);
      return;
    }

    const rect = placeholderSection.getBoundingClientRect();
    const sectionTop = scroll + rect.top;
    const stickyTravel = Math.max(1, placeholderSection.offsetHeight - vh);
    const localProgress = clamp01((scroll - sectionTop) / stickyTravel);
    setPlaceholderProgress(localProgress);
  }, []);

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
      handleScroll(window.scrollY);
    };

    syncScrollState();
    window.addEventListener("resize", syncScrollState);

    return () => {
      window.removeEventListener("resize", syncScrollState);
    };
  }, [handleScroll]);

  const aboutIn = aboutProgress;
  const aboutOut = 1 - aboutFadeProgress;
  const aboutPixelate = Math.max(1 - aboutIn, aboutFadeProgress);
  const aboutOpacity =
    Math.min(aboutIn, aboutOut) * getPixelateOpacity(aboutPixelate);
  const aboutTranslateY = aboutIn < 1
    ? 24 * (1 - aboutIn)
    : -14 * aboutFadeProgress;

  const titleIntroScale = getTitleIntroScale();
  const titlePixelate = exitProgress;
  const titleOpacity = (1 - exitProgress) * getPixelateOpacity(titlePixelate);

  const hintOpacity = Math.max(0, 1 - aboutProgress * 3);
  const placeholderTimeline =
    -PLACEHOLDER_FADE_IN +
    placeholderProgress *
      (PLACEHOLDER_PAIRS.length - 1 + PLACEHOLDER_FADE_IN + PLACEHOLDER_HOLD);

  // Boids fade to black as Innate (card 0) fades in — complete the moment Innate is fully visible
  const innatePhase = placeholderTimeline;
  const boidsOverlayOpacity = clamp01(
    (innatePhase + PLACEHOLDER_FADE_IN) / PLACEHOLDER_FADE_IN
  );

  // Explode on exit, then pull back in as the black overlay covers the boids
  const disperseAmount = exitProgress * (1 - boidsOverlayOpacity * 0.85);

  const placeholderOverlayOpacity = PLACEHOLDER_PAIRS.reduce((maxVisibility, _, index) => {
    const phase = placeholderTimeline - index;
    const visibility = getAgentCardVisibility(
      phase,
      index === PLACEHOLDER_PAIRS.length - 1
    );
    return Math.max(maxVisibility, visibility);
  }, 0);
  const visualizerValue = getAgentDisplayValue(
    placeholderTimeline,
    PLACEHOLDER_PAIRS.length
  );

  return (
    <>
      <svg
        aria-hidden="true"
        className="pixelate-defs"
        width="0"
        height="0"
        style={{ position: "fixed" }}
      >
        <defs>
          {PIXELATE_LEVELS.map((level, index) => (
            <filter
              id={`pixelate-${index + 1}`}
              key={`pixelate-${index + 1}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feFlood
                x="0"
                y="0"
                width={level.cell}
                height={level.cell}
              />
              <feComposite width={level.tile} height={level.tile} />
              <feTile result="pixelateMask" />
              <feComposite in="SourceGraphic" in2="pixelateMask" operator="in" />
              <feMorphology operator="dilate" radius={level.dilate} />
            </filter>
          ))}
        </defs>
      </svg>

      <SmoothScroll onScroll={handleScroll} />

      <main
        style={
          {
            "--site-filter": siteInvert ? "invert(1)" : "none",
          } as CSSProperties
        }
      >
        <div className="boids-bg">
          <Boids disperse={disperseAmount} />
          <div
            className="boids-fade"
            style={{ opacity: boidsOverlayOpacity }}
          />
        </div>

        <div className="fixed-overlay">
          <h1
            className="title"
            style={{
              opacity: titleOpacity,
              transform: `scale(${titleIntroScale})`,
            }}
          >
            <PixelatedTitle progress={titlePixelate} text="ORIGIN" />
          </h1>

          <div
            className="about-body"
            style={{
              filter: getPixelateFilter(aboutPixelate),
              opacity: aboutOpacity,
              transform: `translateY(${aboutTranslateY}px)`,
            }}
          >
            <p>
              We build bespoke intelligence systems that embed into music
              organizations and fundamentally change how decisions get made.
            </p>
            <p>
              Origin Studios is not a tool you add. It&apos;s an upgrade to how
              you think. We partner with labels, live entertainment companies,
              and catalog managers to build custom AI infrastructure that
              becomes indispensable.
            </p>
            <p>
              The invisible engine. The beautiful instrument on top. Technology
              that compounds with every decision it touches.
            </p>
          </div>

          <div
            className="scroll-hint"
            style={{ opacity: hintOpacity }}
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
            {PLACEHOLDER_PAIRS.map((pair, index) => {
              const phase = placeholderTimeline - index;
              const visibility = getAgentCardVisibility(
                phase,
                index === PLACEHOLDER_PAIRS.length - 1
              );
              const pixelate = 1 - visibility;
              const opacity =
                Math.pow(visibility, 1.15) * getPixelateOpacity(pixelate);
              const translateY = phase < 0
                ? 28 * (1 - visibility)
                : -18 * (1 - visibility);

              return (
                <article
                  key={pair.title}
                  className="placeholder-card"
                  style={{
                    opacity,
                    filter: getPixelateFilter(pixelate),
                    transform: `translateY(${translateY}px)`,
                  }}
                >
                  <h2 className="placeholder-title">{pair.title}</h2>
                  <div className="placeholder-body">
                    {pair.body.split("\n").map((line) => (
                      <p key={`${pair.title}-${line}`}>{line}</p>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="placeholder-visualizer">
            <CymaticVisualizer
              value={visualizerValue}
              opacity={placeholderOverlayOpacity}
            />
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

        .boids-fade {
          position: absolute;
          inset: 0;
          background: #000000;
          pointer-events: none;
          will-change: opacity;
        }

        .fixed-overlay {
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

        .placeholder-overlay {
          position: fixed;
          inset: 0;
          z-index: 3;
          display: grid;
          grid-template-columns: minmax(320px, 520px) minmax(340px, 560px);
          align-items: center;
          justify-content: center;
          gap: clamp(28px, 4vw, 56px);
          padding: 120px 48px 160px;
          pointer-events: none;
          filter: var(--site-filter);
        }

        .placeholder-copy {
          position: relative;
          min-height: 320px;
          width: min(100%, 520px);
        }

        .placeholder-visualizer {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .title {
          display: inline-block;
          font-family: var(--font-gt-america);
          font-size: clamp(32px, 5vw, 72px);
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.08em;
          user-select: none;
          color: #ffffff;
          text-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
          margin-bottom: 40px;
          transform-origin: left top;
          will-change: filter, opacity, transform;
        }

        .about-body {
          max-width: 680px;
          will-change: filter, opacity, transform;
        }

        .about-body p {
          font-family: var(--font-gt-america);
          font-size: clamp(10px, 1.2vw, 13px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.7);
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
          height: 200vh;
          pointer-events: none;
        }

        .placeholder-section {
          position: relative;
          height: ${(PLACEHOLDER_PAIRS.length + 1) * 100}vh;
        }

        .placeholder-card {
          position: absolute;
          inset: 0 auto auto 0;
          width: 100%;
          will-change: opacity, filter, transform;
        }

        .placeholder-title {
          font-family: var(--font-gt-america);
          font-size: clamp(20px, 2.6vw, 34px);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: 0.03em;
          color: #ffffff;
          text-shadow: 0 0 28px rgba(0, 0, 0, 0.45);
          margin-bottom: 28px;
        }

        @media (max-width: 900px) {
          .placeholder-overlay {
            grid-template-columns: 1fr;
            align-content: center;
            gap: 32px;
          }

          .placeholder-copy {
            min-height: 280px;
            max-width: 100%;
          }

          .placeholder-visualizer {
            justify-content: center;
          }
        }

        .placeholder-body {
          max-width: 520px;
        }

        .placeholder-body p {
          font-family: var(--font-gt-america);
          font-size: clamp(13px, 1.45vw, 17px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 1.6em;
          letter-spacing: 0.01em;
        }

        .placeholder-body p:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </>
  );
}
