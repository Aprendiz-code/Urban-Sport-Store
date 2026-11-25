export type ColorSuggestion = {
  primary: string;
  secondary?: string;
  confidence: 'high' | 'low';
  source: 'image';
};

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

export async function suggestImageColors(source: ImageColorSource): Promise<ColorSuggestion | null> {
  if (typeof document === 'undefined') return null;

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
    if (!context) return null;

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return null;

    const cropSize = Math.min(sourceWidth, sourceHeight);
    const cropX = (sourceWidth - cropSize) / 2;
    const cropY = (sourceHeight - cropSize) / 2;
    context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);

    const collectBuckets = (strict: boolean) => {
      const buckets = new Map<string, { count: number; weight: number; r: number; g: number; b: number; saturationSum: number }>();
      const margin = strict ? 6 : 2;
      for (let y = margin; y < canvas.height - margin; y += 1) {
        for (let x = margin; x < canvas.width - margin; x += 1) {
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

          const nearWhite = lightness > 0.94 && saturation < 0.14;
          const nearBlack = lightness < 0.08 && saturation < 0.18;
          const nearGray = channelSpread < 14 && saturation < 0.12;
          if (nearWhite || nearBlack || nearGray) continue;

          if (strict && saturation < 0.06 && (lightness > 0.9 || lightness < 0.1)) continue;
          if (!strict && saturation < 0.03 && (lightness > 0.97 || lightness < 0.03)) continue;

          const cx = (x - canvas.width / 2) / (canvas.width / 2);
          const cy = (y - canvas.height / 2) / (canvas.height / 2);
          const distance = Math.sqrt(cx * cx + cy * cy);
          const centerWeight = 1 - Math.min(1, distance) * (strict ? 0.5 : 0.25);
          const chromaWeight = 0.45 + saturation * 1.1 + Math.min(channelSpread / 255, 1) * 0.35;
          const lightnessWeight = 1 - Math.abs(lightness - 0.52) * 0.25;
          const sampleWeight = Math.max(0.15, centerWeight * chromaWeight * lightnessWeight);

          const step = saturation > 0.35 ? 12 : saturation > 0.18 ? 16 : 20;
          const qr = Math.round(red / step) * step;
          const qg = Math.round(green / step) * step;
          const qb = Math.round(blue / step) * step;
          const key = `${qr},${qg},${qb}`;
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.count += 1;
            bucket.weight += sampleWeight;
            bucket.r += red * sampleWeight;
            bucket.g += green * sampleWeight;
            bucket.b += blue * sampleWeight;
            bucket.saturationSum += saturation * sampleWeight;
          } else {
            buckets.set(key, {
              count: 1,
              weight: sampleWeight,
              r: red * sampleWeight,
              g: green * sampleWeight,
              b: blue * sampleWeight,
              saturationSum: saturation * sampleWeight,
            });
          }
        }
      }
      return [...buckets.values()]
        .filter((bucket) => bucket.count >= (strict ? 2 : 1))
        .sort((left, right) => {
          const leftSat = left.saturationSum / Math.max(1, left.weight);
          const rightSat = right.saturationSum / Math.max(1, right.weight);
          const leftScore = left.weight * (0.7 + leftSat * 1.0 + Math.min(left.count, 40) / 120);
          const rightScore = right.weight * (0.7 + rightSat * 1.0 + Math.min(right.count, 40) / 120);
          return rightScore - leftScore;
        });
    };

    let sortedBuckets = collectBuckets(true);
    if (sortedBuckets.length === 0) sortedBuckets = collectBuckets(false);
    if (sortedBuckets.length === 0) return null;

    const topBuckets = sortedBuckets.slice(0, 12);
    const best = topBuckets[0];
    const primary = rgbToHex(best.r / best.weight, best.g / best.weight, best.b / best.weight);

    let secondary: string | undefined;
    for (const candidate of topBuckets.slice(1)) {
      if (candidate.weight < best.weight * 0.16) continue;
      const candidateHex = rgbToHex(candidate.r / candidate.weight, candidate.g / candidate.weight, candidate.b / candidate.weight);
      const dist = colorDistance(
        [best.r / best.weight, best.g / best.weight, best.b / best.weight],
        [candidate.r / candidate.weight, candidate.g / candidate.weight, candidate.b / candidate.weight],
      );
      if (dist >= 48 && candidateHex !== primary) {
        secondary = candidateHex;
        break;
      }
    }

    const bestSaturation = best.saturationSum / Math.max(1, best.weight);
    const confidence: 'high' | 'low' = best.weight >= 70 || bestSaturation >= 0.16 ? 'high' : 'low';

    return {
      primary,
      ...(secondary ? { secondary } : {}),
      confidence,
      source: 'image',
    };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
