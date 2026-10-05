export interface ProductImageUrls {
  mainImage: string;
  gallery: string[];
}

export interface ProductImageSelection<TFile> {
  id: string;
  src: string;
  permanentUrl?: string;
  file?: TFile;
  previewUrl?: string;
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

export async function uploadSelectedProductImages<TFile>(
  selectedImages: readonly ProductImageSelection<TFile>[],
  primaryImageId: string | null,
  upload: (file: TFile) => Promise<{ path: string }>,
  resolvePublicUrl: (path: string) => string,
  onUploaded?: (images: ProductImageSelection<TFile>[], completed: number, total: number, uploadedImage: ProductImageSelection<TFile>) => void,
): Promise<{ mainImage: string; images: string[] }> {
  const images = selectedImages.map((image) => ({ ...image }));
  const totalUploads = images.filter((image) => image.file !== undefined).length;
  let completedUploads = 0;

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (image.file === undefined) continue;

    const uploaded = await upload(image.file);
    const permanentUrl = resolveProductPublicImageUrl(uploaded.path, resolvePublicUrl);
    if (!permanentUrl) throw new Error('Storage no devolvió una referencia permanente para la imagen.');

    images[index] = { id: image.id, src: permanentUrl, permanentUrl };
    completedUploads += 1;
    onUploaded?.(images.map((entry) => ({ ...entry })), completedUploads, totalUploads, image);
  }

  const primaryImage = images.find((image) => image.id === primaryImageId) ?? images[0];
  const mainImage = resolveProductPublicImageUrl(primaryImage?.permanentUrl ?? primaryImage?.src, resolvePublicUrl);
  if (!mainImage) throw new Error('Selecciona al menos una imagen principal válida.');

  const galleryImages = images
    .filter((image) => image.id !== primaryImage.id)
    .map((image) => resolveProductPublicImageUrl(image.permanentUrl ?? image.src, resolvePublicUrl));
  if (galleryImages.some((image) => !image)) throw new Error('No se pudieron preparar todas las imágenes seleccionadas.');

  return { mainImage, images: galleryImages as string[] };
}