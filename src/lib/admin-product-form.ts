export function isValidUuid(value?: string | null): boolean {
  return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim());
}

export const MAX_PRODUCT_GALLERY_IMAGES = 10;

export function validateProductForm(form: {
  name?: string;
  brand?: string;
  sku?: string;
  price?: number | string;
  stock?: number | string;
  categoryId?: string | null;
  image?: string | null;
  images?: Array<string | { url?: string } | null> | null;
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

  const hasImage = Boolean(String(form.image ?? '').trim()) || (Array.isArray(form.images) && form.images.some((entry) => {
    if (typeof entry === 'string') return entry.trim().length > 0;
    return typeof entry?.url === 'string' && entry.url.trim().length > 0;
  }));

  if (!hasImage) {
    errors.image = 'Al menos una imagen es requerida';
  }

  if ((form.images?.length ?? 0) > MAX_PRODUCT_GALLERY_IMAGES) {
    errors.gallery = `La galería admite hasta ${MAX_PRODUCT_GALLERY_IMAGES} imágenes`;
  }

  return errors;
}
