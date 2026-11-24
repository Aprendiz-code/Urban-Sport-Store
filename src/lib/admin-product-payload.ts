import type { Product } from '../types/domain';

function slugifyProductValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildAdminProductPayload(product: Partial<Product>, isCreating = false): Record<string, unknown> {
  const name = (product.name ?? '').trim();
  const sku = (product.sku ?? '').trim();
  const colorName = (product.colorName ?? '').trim();
  const slugParts = [name];
  if (sku && sku.toLowerCase() !== name.toLowerCase()) slugParts.push(sku);
  if (product.modelId && colorName) slugParts.push(colorName);
  const generatedSlug = slugifyProductValue(slugParts.filter(Boolean).join('-')).slice(0, 180);
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
  const includeCatalogSection = isCreating || product.catalogSection !== undefined;

  return {
    slug: product.slug?.trim() || generatedSlug || `product-${Date.now()}`,
    name,
    brand: product.brand ?? '',
    price: Number(product.price ?? 0),
    compare_at_price: product.originalPrice ?? undefined,
    stock: Number(product.stock ?? 0),
    sku,
    ...(product.modelId !== undefined ? { model_id: product.modelId } : {}),
    ...(product.colorName !== undefined ? { color_name: product.colorName } : {}),
    ...(product.colorHex !== undefined ? { color_hex: product.colorHex } : {}),
    ...(product.colorHex2 !== undefined ? { color_hex2: product.colorHex2 } : {}),
    ...(product.modelSortOrder !== undefined ? { model_sort_order: Number(product.modelSortOrder) } : {}),
    ...(product.isDefaultColor !== undefined ? { is_default_color: Boolean(product.isDefaultColor) } : {}),
    category_id: product.categoryId ?? undefined,
    ...(includeCatalogSection ? { catalog_section: product.catalogSection || undefined } : {}),
    ...(includeDescription ? { description: product.description ?? '' } : {}),
    ...(includeSizes ? { sizes } : {}),
    ...(includeSpecifications ? { specifications } : {}),
    ...(product.shippingWeightGrams !== undefined ? { shipping_weight_grams: product.shippingWeightGrams } : {}),
    ...(product.shippingLengthCm !== undefined ? { shipping_length_cm: product.shippingLengthCm } : {}),
    ...(product.shippingWidthCm !== undefined ? { shipping_width_cm: product.shippingWidthCm } : {}),
    ...(product.shippingHeightCm !== undefined ? { shipping_height_cm: product.shippingHeightCm } : {}),
    ...(product.shippingDeclaredValueCop !== undefined ? { shipping_declared_value_cop: product.shippingDeclaredValueCop } : {}),
    ...(product.shippingUnitsPerGuide !== undefined ? { shipping_units_per_guide: product.shippingUnitsPerGuide } : {}),
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