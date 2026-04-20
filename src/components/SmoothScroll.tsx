"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type Props = {
  onScroll?: (scroll: number) => void;
};

export default function SmoothScroll({ onScroll }: Props) {
  const onScrollRef = useRef(onScroll);
  const rafRef = useRef<number | null>(null);

  onScrollRef.current = onScroll;

  useEffect(() => {
    const lenis = new Lenis({
      duration: 0.28,
      easing: (t: number) => 1 - Math.pow(1 - t, 2.2),
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    lenis.on("scroll", (e: Lenis) => {
      onScrollRef.current?.(e.scroll);
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
  }, []);

  return null;
}
