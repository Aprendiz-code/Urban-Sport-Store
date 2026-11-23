export type ColorSuggestion = {
  primary: string;
  secondary?: string;
};

const toHex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const colorDistance = (a: number[], b: number[]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

export async function suggestImageColors(file: File): Promise<ColorSuggestion | null> {
  if (typeof document === 'undefined') return null;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map<string, { count: number; rgb: number[] }>();

    for (let index = 0; index < pixels.length; index += 16) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha < 200) continue;

      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      if (saturation < 16 && (brightness > 238 || brightness < 18)) continue;

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
    if (!primary) return null;

    const primaryHex = toHex(...primary.rgb.map(Math.round) as [number, number, number]);
    const secondary = ranked.find((bucket) => bucket !== primary && colorDistance(bucket.rgb, primary.rgb) > 70);

    return {
      primary: primaryHex,
      ...(secondary ? { secondary: toHex(...secondary.rgb.map(Math.round) as [number, number, number]) } : {}),
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
