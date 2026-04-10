"use client";

import Boids from "@/components/Boids";
import SmoothScroll from "@/components/SmoothScroll";
import { useCallback, useRef, useState } from "react";

export default function Home() {
  const [aboutProgress, setAboutProgress] = useState(0);
  const [exitProgress, setExitProgress] = useState(0);
  const placeholderRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((scroll: number) => {
    const vh = window.innerHeight;

    // 0→1 over the first viewport: about text fades in
    const about = Math.min(1, Math.max(0, scroll / vh));
    setAboutProgress(about);

    // 0→1 over the second viewport: ORIGIN+about fade out, boids disperse to black
    const exit = Math.min(1, Math.max(0, (scroll - vh) / vh));
    setExitProgress(exit);
  }, []);

  // About text: fades in over first 100vh, fades out over second 100vh
  const aboutIn = aboutProgress;
  const aboutOut = 1 - exitProgress;
  const aboutOpacity = Math.min(aboutIn, aboutOut);
  const aboutBlur = aboutIn < 1
    ? 16 * (1 - aboutIn)       // blurring in
    : 16 * exitProgress;        // blurring out
  const aboutTranslateY = aboutIn < 1
    ? 24 * (1 - aboutIn)
    : 0;

  // ORIGIN title: fully visible until exit starts, then fades out
  const titleOpacity = 1 - exitProgress;
  const titleBlur = 12 * exitProgress;

  // Boids: disperse and fade to black
  const boidsOverlayOpacity = exitProgress;
  const disperseAmount = exitProgress;

  // Scroll hint: fades out quickly as about fades in
  const hintOpacity = Math.max(0, 1 - aboutProgress * 3);

  return (
    <>
      <SmoothScroll onScroll={handleScroll} />

      <main>
        {/* Fixed boids background */}
        <div className="boids-bg">
          <Boids disperse={disperseAmount} />
          {/* Black overlay that fades in to cover boids */}
          <div
            className="boids-fade"
            style={{ opacity: boidsOverlayOpacity }}
          />
        </div>

        {/* Fixed overlay: ORIGIN title + about text */}
        <div className="fixed-overlay">
          <h1
            className="title"
            style={{
              opacity: titleOpacity,
              filter: `blur(${titleBlur}px)`,
            }}
          >
            ORIGIN
          </h1>

          <div
            className="about-body"
            style={{
              filter: `blur(${aboutBlur}px)`,
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

        {/* Scroll spacer: 2x viewport for hero fade-in + about-to-black transition */}
        <div className="scroll-spacer" />

        {/* Placeholder section — sits on solid black after boids have dispersed */}
        <section className="placeholder-section" ref={placeholderRef}>
          <div className="placeholder-body">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
            <p>
              Ut enim ad minim veniam, quis nostrud exercitation ullamco
              laboris nisi ut aliquip ex ea commodo consequat.
            </p>
            <p>
              Duis aute irure dolor in reprehenderit in voluptate velit esse
              cillum dolore eu fugiat nulla pariatur.
            </p>
          </div>
        </section>
      </main>

      <style jsx>{`
        main {
          position: relative;
          width: 100%;
        }

        /* ── Boids: fixed fullscreen background ── */
        .boids-bg {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 0;
        }

        .boids-fade {
          position: absolute;
          inset: 0;
          background: #000000;
          pointer-events: none;
          will-change: opacity;
        }

        /* ── Fixed overlay: ORIGIN + about text ── */
        .fixed-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          z-index: 2;
          pointer-events: none;
          padding: 40px 48px;
        }

        .title {
          font-family: var(--font-gt-america);
          font-size: clamp(32px, 5vw, 72px);
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.08em;
          user-select: none;
          text-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
          margin-bottom: 40px;
          will-change: filter, opacity;
        }

        .about-body {
          max-width: 680px;
          will-change: filter, opacity, transform;
        }

        .about-body p {
          font-family: var(--font-gt-america);
          font-size: clamp(15px, 1.8vw, 20px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.85);
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

        /* ── Scroll spacer: consumes 2x viewport ── */
        .scroll-spacer {
          height: 200vh;
          pointer-events: none;
        }

        /* ── Placeholder section: transparent — sits on the boids fade-to-black ── */
        .placeholder-section {
          position: relative;
          z-index: 3;
          min-height: 100vh;
          display: flex;
          align-items: center;
          padding: 120px 48px 160px;
        }

        .placeholder-body {
          max-width: 680px;
        }

        .placeholder-body p {
          font-family: var(--font-gt-america);
          font-size: clamp(15px, 1.8vw, 20px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.85);
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
