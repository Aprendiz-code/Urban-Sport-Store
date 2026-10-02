export function isValidUuid(value?: string | null): boolean {
  return typeof value === 'string' && /^[0-9a-fA-F-]{36}$/.test(value.trim());
}

export function validateProductForm(form: {
  name?: string;
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

  if (!String(form.sku ?? '').trim()) {
    errors.sku = 'El SKU es requerido';
  }

  const price = Number(form.price ?? 0);
  if (Number.isFinite(price) && price <= 0) {
    errors.price = 'El precio debe ser mayor a 0';
  }

  const stock = Number(form.stock ?? 0);
  if (Number.isFinite(stock) && stock < 0) {
    errors.stock = 'El stock no puede ser negativo';
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

  return errors;
}
