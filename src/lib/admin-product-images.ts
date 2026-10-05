export interface ProductImageUrls {
  mainImage: string;
  gallery: string[];
}

export function resolveProductPublicImageUrl(
  value: string | null | undefined,
  resolvePublicUrl?: (path: string) => string,
): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';

  const lower = candidate.toLowerCase();
  if (lower.startsWith('blob:') || lower.startsWith('data:')) return '';
  if (lower.startsWith('http://') || lower.startsWith('https://')) return candidate;
  if (candidate.startsWith('/') || candidate.startsWith('./') || candidate.startsWith('../')) return '';

  if (resolvePublicUrl && candidate.startsWith('products/')) {
    return resolvePublicUrl(candidate);
  }

  if (candidate.includes('/storage/v1/object/public/')) {
    const publicPrefix = '/storage/v1/object/public/';
    const storagePath = candidate.slice(candidate.indexOf(publicPrefix) + publicPrefix.length);
    if (storagePath.startsWith('products/')) {
      return resolvePublicUrl ? resolvePublicUrl(storagePath) : candidate;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return candidate;
  } catch {
    // invalid relative or local paths are rejected intentionally
  }

  return '';
}

export function normalizeProductImageList(
  mainImage: string | null | undefined,
  gallery: Array<string | null | undefined> = [],
  resolvePublicUrl?: (path: string) => string,
): { mainImage: string; gallery: string[] } {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const value of [mainImage, ...gallery]) {
    const resolved = resolveProductPublicImageUrl(value, resolvePublicUrl);
    if (!resolved) continue;

    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    ordered.push(resolved);
  }

  if (!ordered.length) {
    return { mainImage: '', gallery: [] };
  }

  return {
    mainImage: ordered[0],
    gallery: ordered.slice(1),
  };
}

export function buildImageGalleryState(
  mainImage: string | null | undefined,
  gallery: Array<string | null | undefined> = [],
  resolvePublicUrl?: (path: string) => string,
): { mainImage: string; gallery: string[]; hasImages: boolean } {
  const state = normalizeProductImageList(mainImage, gallery, resolvePublicUrl);
  return {
    ...state,
    hasImages: Boolean(state.mainImage || state.gallery.length > 0),
  };
}

export function getAdjacentImageIndex(currentIndex: number, totalImages: number, direction: 'next' | 'previous'): number {
  if (totalImages <= 1) return 0;

  if (direction === 'next') {
    return Math.min(totalImages - 1, currentIndex + 1);
  }

  return Math.max(0, currentIndex - 1);
}

export async function uploadQueuedProductImages<TFile>(
  files: readonly TFile[],
  initialUrls: ProductImageUrls,
  upload: (file: TFile) => Promise<{ path: string }>,
  getPublicUrl: (path: string) => string,
  onUploaded?: (file: TFile, urls: ProductImageUrls) => void,
): Promise<ProductImageUrls> {
  const urls: ProductImageUrls = {
    mainImage: initialUrls.mainImage,
    gallery: [...initialUrls.gallery],
  };

  for (const file of files) {
    const uploaded = await upload(file);
    if (!uploaded.path) throw new Error('Storage no devolvió la ruta de la imagen subida.');

    const publicUrl = getPublicUrl(uploaded.path);
    if (!urls.mainImage) {
      urls.mainImage = publicUrl;
    } else {
      urls.gallery.push(publicUrl);
    }
    onUploaded?.(file, { mainImage: urls.mainImage, gallery: [...urls.gallery] });
  }

  return urls;
}