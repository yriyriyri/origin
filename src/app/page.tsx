"use client";

import Boids from "@/components/Boids";
import CymaticVisualizer from "@/components/CymaticVisualizer";
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

export default function Home() {
  const [aboutProgress, setAboutProgress] = useState(0);
  const [titleProgress, setTitleProgress] = useState(0);
  const [aboutFadeProgress, setAboutFadeProgress] = useState(0);
  const [exitProgress, setExitProgress] = useState(0);
  const [placeholderProgress, setPlaceholderProgress] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollProgress, setShowScrollProgress] = useState(false);
  const placeholderSectionRef = useRef<HTMLElement | null>(null);
  const scrollOverlayTimeoutRef = useRef<number | null>(null);
  const [siteInvert, setSiteInvert] = useState(false);

  const handleScroll = useCallback((scroll: number, showIndicator = true) => {
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const maxScroll = Math.max(1, doc.scrollHeight - vh);

    setScrollProgress(clamp01(scroll / maxScroll));
    if (showIndicator) {
      setShowScrollProgress(true);

      if (scrollOverlayTimeoutRef.current !== null) {
        window.clearTimeout(scrollOverlayTimeoutRef.current);
      }

      scrollOverlayTimeoutRef.current = window.setTimeout(() => {
        setShowScrollProgress(false);
        scrollOverlayTimeoutRef.current = null;
      }, 160);
    }

    const about = clamp01(
      (scroll - vh * HERO_ABOUT_IN_START) / (vh * HERO_ABOUT_IN_END)
    );
    setAboutProgress(about);

    const title = clamp01(
      (scroll - vh * HERO_TITLE_OUT_START) /
        (vh * Math.max(0.001, HERO_ABOUT_IN_END - HERO_TITLE_RETURN_END))
    );
    setTitleProgress(title);

    const aboutFade = clamp01(
      (scroll - vh * HERO_ABOUT_OUT_START_SCROLL) /
        (vh * HERO_ABOUT_OUT_DURATION)
    );
    setAboutFadeProgress(aboutFade);

    const exit = clamp01(
      (scroll - vh * HERO_EXIT_START_SCROLL) /
        (vh * HERO_EXIT_DURATION)
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
      handleScroll(window.scrollY, false);
    };

    syncScrollState();
    window.addEventListener("resize", syncScrollState);

    return () => {
      window.removeEventListener("resize", syncScrollState);
    };
  }, [handleScroll]);

  useEffect(() => {
    return () => {
      if (scrollOverlayTimeoutRef.current !== null) {
        window.clearTimeout(scrollOverlayTimeoutRef.current);
      }
    };
  }, []);

  const aboutIn = aboutProgress;
  const aboutOut = 1 - aboutFadeProgress;
  const aboutPixelate = Math.max(1 - aboutIn, aboutFadeProgress);
  const aboutOpacity =
    Math.min(aboutIn, aboutOut) * getPixelateOpacity(aboutPixelate);
  const aboutTranslateY = aboutIn < 1
    ? 24 * (1 - aboutIn)
    : -14 * aboutFadeProgress;

  const titlePixelate = titleProgress;
  const titleOpacity = (1 - titleProgress) * getPixelateOpacity(titlePixelate);

  const hintOpacity = Math.max(0, 1 - aboutProgress * 3);
  const placeholderTotalSpan =
    (PLACEHOLDER_PAIRS.length - 1) * PLACEHOLDER_STEP + PLACEHOLDER_FADE_IN;
  const placeholderTimeline =
    -PLACEHOLDER_FADE_IN +
    placeholderProgress * placeholderTotalSpan;

  const innatePhase = placeholderTimeline;
  const boidsOverlayOpacity = clamp01(
    (innatePhase + PLACEHOLDER_FADE_IN) / PLACEHOLDER_FADE_IN
  );

  const disperseAmount = exitProgress * (1 - boidsOverlayOpacity * 0.85);

  const placeholderOverlayOpacity = PLACEHOLDER_PAIRS.reduce((maxVisibility, _, index) => {
    const phase = placeholderTimeline - index * PLACEHOLDER_STEP;
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

      <SmoothScroll
        onScroll={handleScroll}
      />

      <main
        style={
          {
            "--scroll-overlay-opacity": showScrollProgress ? "1" : "0",
            "--scroll-overlay-translate": showScrollProgress ? "0px" : "12px",
            "--scroll-progress": scrollProgress.toString(),
            "--site-filter": siteInvert
              ? "invert(1) grayscale(1)"
              : "none",
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

        <div className="scroll-progress-overlay">
          <div className="scroll-progress-indicator" />
        </div>

        <div className="fixed-overlay">
          <div
            className="hero-intro"
            style={{
              opacity: titleOpacity,
              filter: getPixelateFilter(titlePixelate),
            }}
          >
            <span className="hero-intro-word">origin</span>
            <span className="hero-intro-copy">| intelligence infrastructure</span>
          </div>

          <div
            className="about-kicker about-left"
            style={{
              filter: getPixelateFilter(aboutPixelate),
              opacity: aboutOpacity,
              transform: `translateY(${aboutTranslateY}px)`,
            }}
          >
            about
          </div>

          <div
            className="about-body"
            style={{
              filter: getPixelateFilter(aboutPixelate),
              opacity: aboutOpacity,
              transform: `translateY(calc(-50% + ${aboutTranslateY}px))`,
            }}
          >
            <p>
              origin partners with labels, live entertainment companies, and
              catalog managers to build intelligence systems that form the
              instincts behind every decision.
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
              const phase = placeholderTimeline - index * PLACEHOLDER_STEP;
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
          opacity: calc(0.6 * var(--scroll-overlay-opacity));
          transform: translateX(var(--scroll-overlay-translate));
          transition:
            opacity 180ms ease,
            transform 180ms ease;
        }

        .scroll-progress-indicator {
          position: absolute;
          right: 28px;
          top: 0;
          width: 2px;
          height: 100%;
          background: rgba(255, 255, 255, 0.22);
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
          width: min(560px, calc(var(--visualizer-area-width) + 96px), 50vw);
          display: flex;
          justify-content: center;
          align-items: center;
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
          will-change: filter, opacity, transform;
        }

        .about-kicker,
        .placeholder-title {
          font-family: var(--font-space-grotesk);
          font-size: clamp(16px, 2.3vw, 28px);
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
          font-size: clamp(16px, 2.3vw, 28px);
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

        @media (max-width: 900px) {
          .scroll-progress-overlay {
            top: 20px;
            width: 52px;
            height: calc(100vh - 40px);
          }

          .scroll-progress-indicator {
            right: 20px;
            width: 2px;
          }

          .placeholder-overlay {
            padding: 40px 24px 120px;
          }

          .placeholder-visualizer {
            top: auto;
            right: auto;
            bottom: 24px;
            left: 50%;
            width: min(420px, calc(100vw - 48px));
            transform: translateX(-50%);
          }
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
