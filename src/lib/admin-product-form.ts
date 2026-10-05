import type { ProductSpecification } from '../types/domain';

export function isValidUuid(value?: string | null): boolean {
  return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim());
}

export const MAX_PRODUCT_GALLERY_IMAGES = 10;
export const MAX_PRODUCT_TOTAL_IMAGES = MAX_PRODUCT_GALLERY_IMAGES + 1;

export function normalizeProductSizes(sizes: readonly string[]): string[] {
  return sizes.map((size) => size.trim()).filter(Boolean);
}

export function normalizeProductSpecifications(specifications: readonly ProductSpecification[]): ProductSpecification[] {
  return specifications.flatMap(({ name, value }) => {
    const normalizedName = name.trim();
    const normalizedValue = value.trim();
    return normalizedName || normalizedValue ? [{ name: normalizedName, value: normalizedValue }] : [];
  });
}

export async function submitAdminProductForm(
  save: () => Promise<unknown>,
  onSuccess: () => void,
): Promise<void> {
  await save();
  onSuccess();
}

function isPermanentImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateProductForm(form: {
  name?: string;
  brand?: string;
  sku?: string;
  price?: number | string;
  stock?: number | string;
  categoryId?: string | null;
  image?: string | null;
  images?: Array<string | { url?: string } | null> | null;
  pendingImageCount?: number;
  sizes?: readonly string[];
  specifications?: readonly ProductSpecification[];
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!String(form.name ?? '').trim()) {
    errors.name = 'El nombre es requerido';
  }

  if (!String(form.brand ?? '').trim()) {
    errors.brand = 'La marca es requerida';
  }

  if (!String(form.sku ?? '').trim()) {
    errors.sku = 'El SKU es requerido';
  }

  const price = Number(form.price ?? 0);
  if (!Number.isFinite(price) || price < 0) {
    errors.price = 'El precio debe ser un número mayor o igual a 0';
  }

  const stock = Number(form.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) {
    errors.stock = 'El stock debe ser un entero mayor o igual a 0';
  }

  if (!isValidUuid(form.categoryId)) {
    errors.category = 'Selecciona una categoría válida.';
  }

  const normalizedSizes = (form.sizes ?? []).map((size) => size.trim());
  const uniqueSizes = new Set(normalizedSizes.filter(Boolean).map((size) => size.toLowerCase()));
  if (uniqueSizes.size !== normalizedSizes.filter(Boolean).length) {
    errors.sizes = 'No se permiten tallas duplicadas.';
  }

  const seenSpecificationNames = new Set<string>();
  for (const specification of form.specifications ?? []) {
    const name = specification.name.trim();
    const value = specification.value.trim();
    if (!name && !value) continue;
    if (!name || !value) {
      errors.specifications = 'Completa el nombre y el valor de cada especificación.';
      break;
    }
    const normalizedName = name.toLowerCase();
    if (seenSpecificationNames.has(normalizedName)) {
      errors.specifications = 'No se permiten nombres de especificación duplicados.';
      break;
    }
    seenSpecificationNames.add(normalizedName);
  }

  const hasImage = Boolean(String(form.image ?? '').trim()) || (form.pendingImageCount ?? 0) > 0 || (Array.isArray(form.images) && form.images.some((entry) => {
    if (typeof entry === 'string') return entry.trim().length > 0;
    return typeof entry?.url === 'string' && entry.url.trim().length > 0;
  }));

  if (!hasImage) {
    errors.image = 'Al menos una imagen es requerida';
  }

  const mainImage = String(form.image ?? '').trim();
  if (mainImage && !isPermanentImageUrl(mainImage)) {
    errors.image = 'La imagen principal debe ser una URL HTTP o HTTPS permanente.';
  }

  const galleryImages = Array.isArray(form.images)
    ? form.images.map((entry) => typeof entry === 'string' ? entry : entry?.url ?? '').filter((entry) => entry.trim().length > 0)
    : [];
  if (galleryImages.some((image) => !isPermanentImageUrl(image.trim()))) {
    errors.gallery = 'Las imágenes de galería deben ser URLs HTTP o HTTPS permanentes.';
  }

  const pendingGalleryCount = Math.max(0, (form.pendingImageCount ?? 0) - (mainImage ? 0 : 1));
  if ((form.images?.length ?? 0) + pendingGalleryCount > MAX_PRODUCT_GALLERY_IMAGES) {
    errors.gallery = `La galería admite hasta ${MAX_PRODUCT_GALLERY_IMAGES} imágenes`;
  }

  return errors;
}
