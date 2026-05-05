"use client";

import type { CSSProperties, ReactNode } from "react";

type GlassOrbProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  contentInset?: string;
  tint: {
    b: number;
    g: number;
    r: number;
  };
};

const clampChannel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

export default function GlassOrb({
  children,
  className,
  contentClassName,
  contentInset = "9%",
  tint,
}: GlassOrbProps) {
  const shellInsetPercent = 18;
  const shellScale = 1 + (shellInsetPercent * 2) / 100;
  // Wider inner band — fades in smoothly from innerBandFadeStart instead of a hard step
  const innerBandFadeStart = 58;   // where the smooth ramp begins (was no pre-fade)
  const innerBandStart = 70;       // was 84 — wider band
  const innerBandMid = 82;         // was 90.5 — peak reaches sooner
  const innerBandWidth = 100 - innerBandStart;
  const innerBandMidOffset = 100 - innerBandMid;
  const outerBandEdge = 100 / shellScale;
  const outerBandScale = 0.7;                                            // scale all outer offsets — thinner ring, same gradient shape
  const outerBandMid = outerBandEdge + (innerBandMidOffset / shellScale) * outerBandScale;
  const outerBandEnd = outerBandEdge + (innerBandWidth / shellScale) * outerBandScale;
  const outerBandTail = outerBandEdge + ((innerBandWidth + 0.8) / shellScale) * outerBandScale;
  // Soft mask edges — scale these too so proportions stay consistent
  const outerBandSoftStart = outerBandEdge - 6 * outerBandScale;
  const outerBandSoftEnd = Math.min(100, outerBandTail + 4.5 * outerBandScale);

  const orbStyle = {
    "--orb-content-inset": contentInset,
    "--orb-inner-band-fade-start": `${innerBandFadeStart.toFixed(3)}%`,
    "--orb-inner-band-mid": `${innerBandMid.toFixed(3)}%`,
    "--orb-inner-band-start": `${innerBandStart.toFixed(3)}%`,
    "--orb-outer-band-edge": `${outerBandEdge.toFixed(3)}%`,
    "--orb-outer-band-end": `${outerBandEnd.toFixed(3)}%`,
    "--orb-outer-band-mid": `${outerBandMid.toFixed(3)}%`,
    "--orb-outer-band-soft-end": `${outerBandSoftEnd.toFixed(3)}%`,
    "--orb-outer-band-soft-start": `${outerBandSoftStart.toFixed(3)}%`,
    "--orb-outer-band-tail": `${outerBandTail.toFixed(3)}%`,
    "--orb-tint-r-default": String(clampChannel(tint.r)),
    "--orb-tint-g-default": String(clampChannel(tint.g)),
    "--orb-tint-b-default": String(clampChannel(tint.b)),
  } as CSSProperties;

  return (
    <div className={`orbWrap ${className ?? ""}`} style={orbStyle}>
      <div className="shellExtension">
        <div className="shellExtensionBase" />
        <div className="shellExtensionTint" />
      </div>

      <div className="orb">
        <div className={`content ${contentClassName ?? ""}`}>{children}</div>
        <div className="tintLayer" />
        <div className="highlightLayer" />
        <div className="innerStroke" />
      </div>

      <style jsx>{`
        .orbWrap {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: visible;
        }

        .orb {
          position: absolute;
          inset: 0;
          z-index: 1;
          border-radius: 50%;
          overflow: hidden;
          isolation: isolate;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            radial-gradient(
              circle closest-side at 50% 50%,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0)
                var(--orb-inner-band-fade-start),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.012
              )
                var(--orb-inner-band-start),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.06
              )
                var(--orb-inner-band-mid),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.2
              )
                100%
            ),
            rgba(255, 255, 255, 0.015);
          box-shadow:
            0 26px 80px rgba(0, 0, 0, 0.36),
            inset 0 1px 0 rgba(255, 255, 255, 0.14),
            inset 0 -28px 52px rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .shellExtension {
          position: absolute;
          inset: -18%;
          z-index: 0;
          border-radius: 50%;
          pointer-events: none;
          isolation: isolate;
          -webkit-mask-image: radial-gradient(
            circle closest-side at 50% 50%,
            transparent 0%,
            transparent var(--orb-outer-band-soft-start),
            #000 var(--orb-outer-band-edge),
            #000 var(--orb-outer-band-end),
            transparent var(--orb-outer-band-soft-end)
          );
          mask-image: radial-gradient(
            circle closest-side at 50% 50%,
            transparent 0%,
            transparent var(--orb-outer-band-soft-start),
            #000 var(--orb-outer-band-edge),
            #000 var(--orb-outer-band-end),
            transparent var(--orb-outer-band-soft-end)
          );
        }

        .shellExtensionBase,
        .shellExtensionTint {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
        }

        .shellExtensionBase {
          background:
            radial-gradient(
              circle closest-side at 50% 50%,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0)
                var(--orb-outer-band-soft-start),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.2
              )
                var(--orb-outer-band-edge),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.06
              )
                var(--orb-outer-band-mid),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.012
              )
                var(--orb-outer-band-end),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0
              )
                var(--orb-outer-band-tail)
            ),
            rgba(255, 255, 255, 0.015);
          opacity: calc(0.44 * var(--orb-glass-opacity, 1));
        }

        .shellExtensionTint {
          background: radial-gradient(
            circle closest-side at 50% 50%,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0)
              var(--orb-outer-band-soft-start),
            rgba(
              var(--orb-tint-r, var(--orb-tint-r-default)),
              var(--orb-tint-g, var(--orb-tint-g-default)),
              var(--orb-tint-b, var(--orb-tint-b-default)),
              0.28
            )
              var(--orb-outer-band-edge),
            rgba(
              var(--orb-tint-r, var(--orb-tint-r-default)),
              var(--orb-tint-g, var(--orb-tint-g-default)),
              var(--orb-tint-b, var(--orb-tint-b-default)),
              0.16
            )
              var(--orb-outer-band-mid),
            rgba(
              var(--orb-tint-r, var(--orb-tint-r-default)),
              var(--orb-tint-g, var(--orb-tint-g-default)),
              var(--orb-tint-b, var(--orb-tint-b-default)),
              0.04
            )
              var(--orb-outer-band-end),
            rgba(
              var(--orb-tint-r, var(--orb-tint-r-default)),
              var(--orb-tint-g, var(--orb-tint-g-default)),
              var(--orb-tint-b, var(--orb-tint-b-default)),
              0
            )
              var(--orb-outer-band-tail)
          );
          mix-blend-mode: screen;
          opacity: calc(0.42 * var(--orb-glass-opacity, 1));
        }

        .content {
          position: absolute;
          inset: var(--orb-content-inset);
          z-index: 1;
        }

        .tintLayer,
        .highlightLayer,
        .innerStroke {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
        }

        .tintLayer {
          z-index: 2;
          background:
            radial-gradient(
              circle closest-side at 50% 50%,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0)
                var(--orb-inner-band-fade-start),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.06
              )
                var(--orb-inner-band-start),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.16
              )
                var(--orb-inner-band-mid),
              rgba(
                var(--orb-tint-r, var(--orb-tint-r-default)),
                var(--orb-tint-g, var(--orb-tint-g-default)),
                var(--orb-tint-b, var(--orb-tint-b-default)),
                0.28
              )
                100%
            );
          mix-blend-mode: screen;
          opacity: calc(0.42 * var(--orb-glass-opacity, 1));
        }

        .highlightLayer {
          z-index: 3;
          background:
            radial-gradient(
              circle at 34% 26%,
              rgba(255, 255, 255, 0.18) 0,
              rgba(255, 255, 255, 0.08) 20%,
              rgba(255, 255, 255, 0.015) 42%,
              rgba(255, 255, 255, 0) 62%
            ),
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.08) 0%,
              rgba(255, 255, 255, 0.025) 34%,
              rgba(255, 255, 255, 0) 72%
            );
          opacity: 0.36;
        }

        .innerStroke {
          inset: 1px;
          z-index: 4;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            inset 0 0 36px rgba(255, 255, 255, 0.035),
            inset 0 -36px 60px rgba(0, 0, 0, 0.14);
          opacity: 0.34;
        }
      `}</style>
    </div>
  );
}
