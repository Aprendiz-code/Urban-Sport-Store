import { supabaseAdmin } from '../../lib/supabase.js';

const ALLOWED_PRODUCT_COLUMNS = new Set([
  'slug',
  'name',
  'price',
  'compare_at_price',
  'category_id',
  'stock',
  'sku',
  'description',
  'is_active',
]);

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

async function resolveCategoryId(body: any): Promise<string | undefined> {
  const explicitCategoryId = parseString(body.category_id);
  if (explicitCategoryId) return explicitCategoryId;

  const categoryValue = parseString(body.category) ?? parseString(body.category_name) ?? parseString(body.category_slug);
  if (!categoryValue) return undefined;

  const encodedValue = encodeURIComponent(categoryValue);
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .or(`name.eq.${encodedValue},slug.eq.${encodedValue}`)
    .limit(1)
    .maybeSingle();

  if (error) return undefined;
  return data?.id ?? undefined;
}

function computeCompareAtPrice(body: any): number | undefined {
  const compareAtPrice = toNumber(body.compare_at_price) ?? toNumber(body.original_price);
  if (compareAtPrice !== undefined) {
    return compareAtPrice;
  }

  const discountPercentage = toNumber(body.discount_percentage) ?? toNumber(body.discount);
  const price = toNumber(body.price);
  if (discountPercentage !== undefined && price !== undefined) {
    return Number((price * (1 + discountPercentage / 100)).toFixed(2));
  }

  return undefined;
}

function filterProductColumns(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => ALLOWED_PRODUCT_COLUMNS.has(key)),
  );
}

export async function normalizeProductPayload(body: any) {
  const payload: Record<string, unknown> = {};

  const slug = parseString(body.slug);
  if (slug) payload.slug = slug;

  const name = parseString(body.name);
  if (name) payload.name = name;

  const price = toNumber(body.price);
  if (price !== undefined) payload.price = price;

  const compareAtPrice = computeCompareAtPrice(body);
  if (compareAtPrice !== undefined) payload.compare_at_price = compareAtPrice;

  const categoryId = await resolveCategoryId(body);
  if (categoryId) payload.category_id = categoryId;

  const stock = toNumber(body.stock);
  if (stock !== undefined) payload.stock = stock;

  const sku = parseString(body.sku);
  if (sku) payload.sku = sku;

  const description = parseString(body.description);
  if (description) payload.description = description;

  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;

  return filterProductColumns(payload);
}

export async function normalizeProductUpdates(body: any) {
  const updates: Record<string, unknown> = {};

  const slug = parseString(body.slug);
  if (slug) updates.slug = slug;

  const name = parseString(body.name);
  if (name) updates.name = name;

  const price = toNumber(body.price);
  if (price !== undefined) updates.price = price;

  const shouldComputeCompareAtPrice =
    body.compare_at_price !== undefined ||
    body.original_price !== undefined ||
    body.discount_percentage !== undefined ||
    body.discount !== undefined;

  if (shouldComputeCompareAtPrice) {
    const compareAtPrice = computeCompareAtPrice(body);
    if (compareAtPrice !== undefined) updates.compare_at_price = compareAtPrice;
  }

  const categoryId = await resolveCategoryId(body);
  if (categoryId) updates.category_id = categoryId;

  const stock = toNumber(body.stock);
  if (stock !== undefined) updates.stock = stock;

  const sku = parseString(body.sku);
  if (sku) updates.sku = sku;

  const description = parseString(body.description);
  if (description) updates.description = description;

  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;

  return filterProductColumns(updates);
}
