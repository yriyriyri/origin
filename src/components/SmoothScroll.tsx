"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type Props = {
  onScroll?: (scroll: number) => void;
  snapStops?: number[];
  snapThreshold?: number;
  snapReleaseThreshold?: number;
  snapCooldownMs?: number;
  snapVelocityThreshold?: number;
};

export default function SmoothScroll({
  onScroll,
  snapStops = [],
  snapThreshold = 42,
  snapReleaseThreshold = 18,
  snapCooldownMs = 140,
  snapVelocityThreshold = 0.2,
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
      duration: 0.68,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.1,
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

    lenis.on("scroll", (e: Lenis) => {
      const now = performance.now();
      const scroll = e.scroll;
      const velocity = Math.abs(e.velocity);
      const direction = e.direction;

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

      const deltaToStop = nearest.stop - scroll;
      const movingTowardStop =
        direction === 0 ||
        deltaToStop === 0 ||
        Math.sign(deltaToStop) === direction;

      if (
        nearest.dist <= snapThreshold &&
        movingTowardStop &&
        velocity <= snapVelocityThreshold
      ) {
        lockedStopRef.current = nearest.stop;
        cooldownUntilRef.current = now + snapCooldownMs;

        lenis.scrollTo(nearest.stop, {
          duration: 0.18,
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
  }, [
    snapThreshold,
    snapReleaseThreshold,
    snapCooldownMs,
    snapVelocityThreshold,
  ]);

  return null;
}
