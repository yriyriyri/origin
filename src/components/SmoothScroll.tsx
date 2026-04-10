"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type Props = {
  onScroll?: (scroll: number) => void;
  snapStops?: number[];
  snapThreshold?: number;
  snapReleaseThreshold?: number;
  snapCooldownMs?: number;
};

export default function SmoothScroll({
  onScroll,
  snapStops = [],
  snapThreshold = 80,
  snapReleaseThreshold = 140,
  snapCooldownMs = 500,
}: Props) {
  const onScrollRef = useRef(onScroll);
  const snapStopsRef = useRef<number[]>(snapStops);

  const lockedStopRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  onScrollRef.current = onScroll;
  snapStopsRef.current = snapStops;

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    const findNearestStop = (scroll: number) => {
      const stops = snapStopsRef.current;
      if (!stops.length) return null;

      let nearest = stops[0];
      let nearestDist = Math.abs(scroll - nearest);

      for (let i = 1; i < stops.length; i++) {
        const dist = Math.abs(scroll - stops[i]);
        if (dist < nearestDist) {
          nearest = stops[i];
          nearestDist = dist;
        }
      }

      return { stop: nearest, dist: nearestDist };
    };

    lenis.on("scroll", (e: { scroll: number }) => {
      const now = performance.now();
      const scroll = e.scroll;

      onScrollRef.current?.(scroll);

      if (now < cooldownUntilRef.current) {
        return;
      }

      if (lockedStopRef.current !== null) {
        const distFromLock = Math.abs(scroll - lockedStopRef.current);
        if (distFromLock <= snapReleaseThreshold) {
          return;
        }
        lockedStopRef.current = null;
      }

      const nearest = findNearestStop(scroll);
      if (!nearest) return;

      if (nearest.dist <= snapThreshold) {
        lockedStopRef.current = nearest.stop;
        cooldownUntilRef.current = now + snapCooldownMs;

        lenis.scrollTo(nearest.stop, {
          duration: 0.55,
          lock: true,
          force: true,
        });
      }
    });

    const raf = (time: number) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    };

    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      lenis.destroy();
    };
  }, [snapThreshold, snapReleaseThreshold, snapCooldownMs]);

  return null;
}