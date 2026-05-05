export type RgbUnit = {
  b: number;
  g: number;
  r: number;
};

export type Rgb255 = {
  b: number;
  g: number;
  r: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const srgbToLinear = (value: number) =>
  value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);

const linearToSrgb = (value: number) =>
  value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

const rgbToOklab = ({ r, g, b }: RgbUnit) => {
  const lr = srgbToLinear(clamp01(r));
  const lg = srgbToLinear(clamp01(g));
  const lb = srgbToLinear(clamp01(b));

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
};

const oklabToRgb = ({
  l,
  a,
  b,
}: {
  a: number;
  b: number;
  l: number;
}): RgbUnit => {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;

  const lr = lRoot * lRoot * lRoot;
  const lg = mRoot * mRoot * mRoot;
  const lb = sRoot * sRoot * sRoot;

  return {
    r: clamp01(
      linearToSrgb(4.0767416621 * lr - 3.3077115913 * lg + 0.2309699292 * lb)
    ),
    g: clamp01(
      linearToSrgb(-1.2684380046 * lr + 2.6097574011 * lg - 0.3413193965 * lb)
    ),
    b: clamp01(
      linearToSrgb(-0.0041960863 * lr - 0.7034186147 * lg + 1.707614701 * lb)
    ),
  };
};

export const mixRgbPerceptual = (from: RgbUnit, to: RgbUnit, mix: number): RgbUnit => {
  const t = clamp01(mix);
  const fromLab = rgbToOklab(from);
  const toLab = rgbToOklab(to);

  return oklabToRgb({
    l: fromLab.l + (toLab.l - fromLab.l) * t,
    a: fromLab.a + (toLab.a - fromLab.a) * t,
    b: fromLab.b + (toLab.b - fromLab.b) * t,
  });
};

export const rgb255ToUnit = ({ r, g, b }: Rgb255): RgbUnit => ({
  r: clamp01(r / 255),
  g: clamp01(g / 255),
  b: clamp01(b / 255),
});

export const rgbUnitTo255 = ({ r, g, b }: RgbUnit): Rgb255 => ({
  r: Math.round(clamp01(r) * 255),
  g: Math.round(clamp01(g) * 255),
  b: Math.round(clamp01(b) * 255),
});
