"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type Props = {
  onScroll?: (scroll: number) => void;
};

export default function SmoothScroll({ onScroll }: Props) {
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on("scroll", (e: { scroll: number }) => {
      onScrollRef.current?.(e.scroll);
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  return null;
}
