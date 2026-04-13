"use client";

import { useEffect, useRef, useState } from "react";

type PixelatedTitleProps = {
  progress: number;
  text: string;
};

const PIXELATE_BLOCK_SIZES = [1.55, 2.1, 2.8, 3.7, 4.9] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parsePx = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function PixelatedTitle({
  progress,
  text,
}: PixelatedTitleProps) {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const crispRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const progressRef = useRef(progress);
  const textRef = useRef(text);
  const readyRef = useRef(false);

  const [ready, setReady] = useState(false);

  progressRef.current = progress;
  textRef.current = text;

  useEffect(() => {
    sourceCanvasRef.current = document.createElement("canvas");
    pixelCanvasRef.current = document.createElement("canvas");
  }, []);

  useEffect(() => {
    const measure = measureRef.current;
    const crisp = crispRef.current;
    const canvas = canvasRef.current;
    const sourceCanvas = sourceCanvasRef.current;
    const pixelCanvas = pixelCanvasRef.current;

    if (!measure || !crisp || !canvas || !sourceCanvas || !pixelCanvas) {
      return;
    }

    const draw = () => {
      const rect = measure.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      sourceCanvas.width = canvas.width;
      sourceCanvas.height = canvas.height;

      const sourceCtx = sourceCanvas.getContext("2d");
      const targetCtx = canvas.getContext("2d");
      const pixelCtx = pixelCanvas.getContext("2d");

      if (!sourceCtx || !targetCtx || !pixelCtx) {
        return;
      }

      const computed = window.getComputedStyle(crisp);
      const fontSize = parsePx(computed.fontSize, 72);
      const rawLetterSpacing = computed.letterSpacing;
      const letterSpacing =
        rawLetterSpacing === "normal"
          ? fontSize * 0.08
          : parsePx(rawLetterSpacing, fontSize * 0.08);

      const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      const value = textRef.current;

      sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sourceCtx.font = font;
      sourceCtx.fillStyle = computed.color || "#ffffff";
      sourceCtx.textBaseline = "alphabetic";
      sourceCtx.textAlign = "left";

      const letters = Array.from(value);
      const textMetrics = sourceCtx.measureText(value);
      const ascent = textMetrics.actualBoundingBoxAscent || fontSize * 0.76;
      const descent = textMetrics.actualBoundingBoxDescent || fontSize * 0.24;
      const baselineY = Math.round((height - (ascent + descent)) * 0.5 + ascent);

      let cursorX = 0;
      for (const letter of letters) {
        sourceCtx.fillText(letter, cursorX, baselineY);
        cursorX += sourceCtx.measureText(letter).width + letterSpacing;
      }

      const active = clamp01(progressRef.current);
      const levelIndex = Math.min(
        PIXELATE_BLOCK_SIZES.length - 1,
        Math.max(0, Math.ceil(active * PIXELATE_BLOCK_SIZES.length) - 1)
      );
      const blockSize = PIXELATE_BLOCK_SIZES[levelIndex];

      const pixelWidth = Math.max(
        1,
        Math.round(canvas.width / (blockSize * dpr))
      );
      const pixelHeight = Math.max(
        1,
        Math.round(canvas.height / (blockSize * dpr))
      );

      pixelCanvas.width = pixelWidth;
      pixelCanvas.height = pixelHeight;

      pixelCtx.clearRect(0, 0, pixelWidth, pixelHeight);
      pixelCtx.imageSmoothingEnabled = false;
      pixelCtx.drawImage(sourceCanvas, 0, 0, pixelWidth, pixelHeight);

      const imageData = pixelCtx.getImageData(0, 0, pixelWidth, pixelHeight);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 36) {
          data[i + 3] = 0;
          continue;
        }

        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      pixelCtx.putImageData(imageData, 0, 0);

      targetCtx.clearRect(0, 0, canvas.width, canvas.height);
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.drawImage(
        pixelCanvas,
        0,
        0,
        pixelWidth,
        pixelHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
    };

    let cancelled = false;

    const safeDraw = () => {
      if (!cancelled) draw();
    };

    const observer = new ResizeObserver(safeDraw);
    observer.observe(measure);

    window.addEventListener("resize", safeDraw);

    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) safeDraw();
      });
    }

    safeDraw();

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", safeDraw);
    };
  }, [text]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const measure = measureRef.current;
      const crisp = crispRef.current;
      const canvas = canvasRef.current;
      const sourceCanvas = sourceCanvasRef.current;
      const pixelCanvas = pixelCanvasRef.current;

      if (!measure || !crisp || !canvas || !sourceCanvas || !pixelCanvas) {
        return;
      }

      const rect = measure.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      const sourceCtx = sourceCanvas.getContext("2d");
      const targetCtx = canvas.getContext("2d");
      const pixelCtx = pixelCanvas.getContext("2d");

      if (!sourceCtx || !targetCtx || !pixelCtx) {
        return;
      }

      const computed = window.getComputedStyle(crisp);
      const fontSize = parsePx(computed.fontSize, 72);
      const rawLetterSpacing = computed.letterSpacing;
      const letterSpacing =
        rawLetterSpacing === "normal"
          ? fontSize * 0.08
          : parsePx(rawLetterSpacing, fontSize * 0.08);

      const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      const value = textRef.current;

      sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sourceCtx.font = font;
      sourceCtx.fillStyle = computed.color || "#ffffff";
      sourceCtx.textBaseline = "alphabetic";
      sourceCtx.textAlign = "left";

      const letters = Array.from(value);
      const textMetrics = sourceCtx.measureText(value);
      const ascent = textMetrics.actualBoundingBoxAscent || fontSize * 0.76;
      const descent = textMetrics.actualBoundingBoxDescent || fontSize * 0.24;
      const baselineY = Math.round((height - (ascent + descent)) * 0.5 + ascent);

      let cursorX = 0;
      for (const letter of letters) {
        sourceCtx.fillText(letter, cursorX, baselineY);
        cursorX += sourceCtx.measureText(letter).width + letterSpacing;
      }

      const active = clamp01(progressRef.current);
      const levelIndex = Math.min(
        PIXELATE_BLOCK_SIZES.length - 1,
        Math.max(0, Math.ceil(active * PIXELATE_BLOCK_SIZES.length) - 1)
      );
      const blockSize = PIXELATE_BLOCK_SIZES[levelIndex];

      const pixelWidth = Math.max(
        1,
        Math.round(canvas.width / (blockSize * dpr))
      );
      const pixelHeight = Math.max(
        1,
        Math.round(canvas.height / (blockSize * dpr))
      );

      pixelCanvas.width = pixelWidth;
      pixelCanvas.height = pixelHeight;

      pixelCtx.clearRect(0, 0, pixelWidth, pixelHeight);
      pixelCtx.imageSmoothingEnabled = false;
      pixelCtx.drawImage(sourceCanvas, 0, 0, pixelWidth, pixelHeight);

      const imageData = pixelCtx.getImageData(0, 0, pixelWidth, pixelHeight);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 36) {
          data[i + 3] = 0;
          continue;
        }

        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      pixelCtx.putImageData(imageData, 0, 0);

      targetCtx.clearRect(0, 0, canvas.width, canvas.height);
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.drawImage(
        pixelCanvas,
        0,
        0,
        pixelWidth,
        pixelHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    });

    return () => cancelAnimationFrame(raf);
  }, [progress, text]);

  const showPixelated = ready && clamp01(progress) > 0.001;

  return (
    <span className="root">
      <span aria-hidden="true" className="measure" ref={measureRef}>
        {text}
      </span>
      <span
        className="crisp"
        ref={crispRef}
        style={{ opacity: showPixelated ? 0 : 1 }}
      >
        {text}
      </span>
      <canvas
        aria-hidden="true"
        className="canvas"
        ref={canvasRef}
        style={{ opacity: showPixelated ? 1 : 0 }}
      />

      <style jsx>{`
        .root {
          display: inline-grid;
          position: relative;
          align-items: start;
          line-height: 1;
        }

        .root > * {
          grid-area: 1 / 1;
        }

        .measure,
        .crisp {
          white-space: pre;
          display: block;
        }

        .measure {
          visibility: hidden;
          pointer-events: none;
        }

        .crisp,
        .canvas {
          transition: opacity 90ms linear;
        }

        .canvas {
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}</style>
    </span>
  );
}