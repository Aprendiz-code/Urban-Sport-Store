export type ColorSuggestion = {
  primary: string;
  secondary?: string;
  confidence: 'high' | 'low';
  source: 'name' | 'image';
};

const NAMED_COLORS: Record<string, string> = {
  negro: '#111827', black: '#111827',
  blanco: '#FFFFFF', white: '#FFFFFF',
  gris: '#808080', gray: '#808080', grey: '#808080',
  plata: '#C0C0C0', plateado: '#C0C0C0', silver: '#C0C0C0',
  azul: '#2563EB', blue: '#2563EB',
  rojo: '#DC2626', red: '#DC2626',
  verde: '#16A34A', green: '#16A34A',
  amarillo: '#EAB308', yellow: '#EAB308',
  rosa: '#EC4899', rosado: '#EC4899', pink: '#EC4899',
  morado: '#9333EA', purple: '#9333EA',
  naranja: '#EA580C', orange: '#EA580C',
  beige: '#D6C7A1', crema: '#F5F0E4',
  cafe: '#854D0E', marron: '#854D0E', brown: '#854D0E',
};

export function suggestNamedColorHex(name: string): ColorSuggestion | null {
  const parts = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s*(?:\/|\+|\by\b)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const primary = parts.map((part) => NAMED_COLORS[part]).find(Boolean);
  if (!primary) return null;
  const secondary = parts.slice(1).map((part) => NAMED_COLORS[part]).find(Boolean);
  return {
    primary,
    ...(secondary && secondary !== primary ? { secondary } : {}),
    confidence: 'high',
    source: 'name',
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function colorDistance(a: number[], b: number[]) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

type ImageColorSource = File | Blob | string;

export async function suggestImageColors(source: ImageColorSource, knownColorName = ''): Promise<ColorSuggestion | null> {
  const namedSuggestion = suggestNamedColorHex(knownColorName);
  if (typeof document === 'undefined') return namedSuggestion;

  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  const imageUrl = typeof source === 'string' ? source : objectUrl!;
  try {
    const image = new Image();
    if (typeof source === 'string') image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = imageUrl;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return namedSuggestion;

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return namedSuggestion;

    // Center-crop to focus on the product and reduce background influence.
    const cropSize = Math.min(sourceWidth, sourceHeight);
    const cropX = (sourceWidth - cropSize) / 2;
    const cropY = (sourceHeight - cropSize) / 2;
    context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number; saturationSum: number }>();

    const marginX = 14;
    const marginTop = 10;
    const marginBottom = 10;

    for (let y = marginTop; y < canvas.height - marginBottom; y += 1) {
      for (let x = marginX; x < canvas.width - marginX; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha < 220) continue;

        const { saturation, lightness } = rgbToHsl(red, green, blue);
        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const channelSpread = maxChannel - minChannel;

        // Ignore likely background/border neutrals (white studio bg, black edges, gray shadows).
        const nearWhite = lightness > 0.9 && saturation < 0.18;
        const nearBlack = lightness < 0.12 && saturation < 0.2;
        const nearGray = channelSpread < 18 && saturation < 0.16;
        if (nearWhite || nearBlack || nearGray) continue;

        // Prefer chromatic/product pixels, but keep muted tones if needed.
        const chromaWeight = saturation < 0.12 && (lightness > 0.82 || lightness < 0.18) ? 0 : 1;
        if (chromaWeight === 0) continue;

        const step = saturation > 0.35 ? 16 : 24;
        const qr = Math.round(red / step) * step;
        const qg = Math.round(green / step) * step;
        const qb = Math.round(blue / step) * step;
        const key = `${qr},${qg},${qb}`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.count += 1;
          bucket.r += red;
          bucket.g += green;
          bucket.b += blue;
          bucket.saturationSum += saturation;
        } else {
          buckets.set(key, { count: 1, r: red, g: green, b: blue, saturationSum: saturation });
        }
      }
    }

    const ranked = [...buckets.values()]
      .map((bucket) => {
        const avgR = bucket.r / bucket.count;
        const avgG = bucket.g / bucket.count;
        const avgB = bucket.b / bucket.count;
        const avgSaturation = bucket.saturationSum / bucket.count;
        const { lightness } = rgbToHsl(avgR, avgG, avgB);
        // Favor frequent, reasonably saturated colors near product midtones.
        const lightnessPenalty = lightness > 0.92 || lightness < 0.08 ? 0.5 : 1;
        const score = bucket.count * (0.55 + avgSaturation) * lightnessPenalty;
        return { avgR, avgG, avgB, avgSaturation, count: bucket.count, score };
      })
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0];
    if (!primary) return namedSuggestion;

    const primaryHex = rgbToHex(primary.avgR, primary.avgG, primary.avgB);
    const secondary = ranked.find((bucket) => bucket !== primary
      && colorDistance([bucket.avgR, bucket.avgG, bucket.avgB], [primary.avgR, primary.avgG, primary.avgB]) > 55
      && bucket.count >= Math.max(8, primary.count * 0.18)
      && bucket.avgSaturation >= 0.12);

    return {
      primary: primaryHex,
      ...(secondary ? { secondary: rgbToHex(secondary.avgR, secondary.avgG, secondary.avgB) } : {}),
      confidence: primary.avgSaturation >= 0.22 ? 'high' : 'low',
      source: 'image',
    };
  } catch {
    return namedSuggestion;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function isKnownColorName(name: string): boolean {
  return Boolean(suggestNamedColorHex(name));
}
