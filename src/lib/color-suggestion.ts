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

const toHex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const colorDistance = (a: number[], b: number[]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

type ImageColorSource = File | Blob | string;

function isNamedColorSource(name: string): boolean {
  return Boolean(suggestNamedColorHex(name));
}

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

    const cropSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (!cropSize) return namedSuggestion;
    const cropX = ((image.naturalWidth || image.width) - cropSize) / 2;
    const cropY = ((image.naturalHeight || image.height) - cropSize) / 2;
    context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map<string, { count: number; rgb: number[] }>();

    for (let pixelIndex = 0; pixelIndex < pixels.length / 4; pixelIndex += 4) {
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      if (x < 10 || x >= canvas.width - 10 || y < 8 || y >= 72) continue;
      const index = pixelIndex * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha < 200) continue;

      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      if (saturation < 14 && (brightness > 246 || brightness < 24)) continue;

      const quantized = [
        Math.round(red / 24) * 24,
        Math.round(green / 24) * 24,
        Math.round(blue / 24) * 24,
      ].map((value) => Math.min(255, value));
      const key = quantized.join(',');
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.rgb = bucket.rgb.map((value, position) => (value + quantized[position]) / 2);
      } else {
        buckets.set(key, { count: 1, rgb: quantized });
      }
    }

    const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
    const primary = ranked[0];
    if (!primary) return namedSuggestion;

    const primaryHex = toHex(...(primary.rgb.map(Math.round) as [number, number, number]));
    const secondaryBucket = ranked.find((bucket) => bucket !== primary
      && colorDistance(bucket.rgb, primary.rgb) > 70
      && bucket.count >= primary.count * 0.2);
    const secondaryHex = secondaryBucket
      ? toHex(...(secondaryBucket.rgb.map(Math.round) as [number, number, number]))
      : namedSuggestion?.secondary;

    return {
      primary: primaryHex,
      ...(secondaryHex && secondaryHex !== primaryHex ? { secondary: secondaryHex } : {}),
      confidence: 'low',
      source: 'image',
    };
  } catch {
    return namedSuggestion;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function isKnownColorName(name: string): boolean {
  return isNamedColorSource(name);
}
