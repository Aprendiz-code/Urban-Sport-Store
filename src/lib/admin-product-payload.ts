import type { Product } from '../types/domain';

export function buildAdminProductPayload(product: Partial<Product>, isCreating = false): Record<string, unknown> {
  const name = product.name ?? '';
  const sku = product.sku ?? '';
  const generatedSlug = `${name}-${sku}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
  const images = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === 'string')
    : [];
  const sizes = Array.isArray(product.sizes)
    ? product.sizes.filter((size): size is string => typeof size === 'string')
    : [];
  const specifications = Array.isArray(product.specifications) ? product.specifications : [];
  const includeImages = isCreating || product.images !== undefined;
  const includeSizes = isCreating || product.sizes !== undefined;
  const includeSpecifications = isCreating || product.specifications !== undefined;
  const includeDescription = isCreating || product.description !== undefined;

  return {
    slug: product.slug?.trim() || generatedSlug || `product-${Date.now()}`,
    name,
    brand: product.brand ?? '',
    price: Number(product.price ?? 0),
    compare_at_price: product.originalPrice ?? undefined,
    stock: Number(product.stock ?? 0),
    sku,
    category_id: product.categoryId ?? undefined,
    ...(includeDescription ? { description: product.description ?? '' } : {}),
    ...(includeSizes ? { sizes } : {}),
    ...(includeSpecifications ? { specifications } : {}),
    main_image: product.image ?? '',
    ...(includeImages ? { images } : {}),
    ...(isCreating ? { is_active: true } : {}),
  };
}

export async function runAdminProductSubmission<T>(
  save: () => Promise<T>,
  onSuccess: (result: T) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  let result: T;
  try {
    result = await save();
  } catch (error) {
    onError(error);
    return;
  }

  onSuccess(result);
}