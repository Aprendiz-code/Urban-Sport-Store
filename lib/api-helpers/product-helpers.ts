import { supabaseAdmin } from './supabase.js';

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

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function resolveCategoryId(body: any): Promise<string | undefined> {
  const explicitCategoryId = parseString(body.category_id) ?? parseString(body.categoryId);
  if (explicitCategoryId) return explicitCategoryId;

  const categoryValue = parseString(body.category) ?? parseString(body.category_name) ?? parseString(body.category_slug) ?? parseString(body.categoryName) ?? parseString(body.categorySlug);
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
  const compareAtPrice = toNumber(body.compare_at_price) ?? toNumber(body.compareAtPrice) ?? toNumber(body.original_price) ?? toNumber(body.originalPrice);
  if (compareAtPrice !== undefined) {
    return compareAtPrice;
  }

  const discountPercentage = toNumber(body.discount_percentage) ?? toNumber(body.discountPercentage) ?? toNumber(body.discount);
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

  const slugFromBody = parseString(body.slug);
  const name = parseString(body.name) ?? parseString(body.title) ?? parseString(body.product_name) ?? parseString(body.productName);
  if (name) payload.name = name;
  if (slugFromBody) payload.slug = slugFromBody;
  else if (name) payload.slug = slugify(name);

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
    body.discount !== undefined ||
    body.originalPrice !== undefined ||
    body.discountPercentage !== undefined;

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
  if (typeof body.isActive === 'boolean') updates.is_active = body.isActive;

  return filterProductColumns(updates);
}

export function normalizeProduct(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    price: record.price,
    compareAtPrice: record.compare_at_price ?? record.compareAtPrice ?? null,
    categoryId: record.category_id ?? record.categoryId ?? null,
    stock: record.stock ?? null,
    sku: record.sku ?? null,
    description: record.description ?? null,
    image: record.image ?? null,
    images: record.images ?? [],
    gender: record.gender ?? null,
    isActive: record.is_active ?? record.isActive ?? null,
    isNew: record.is_new ?? record.isNew ?? false,
    isFeatured: record.is_featured ?? record.isFeatured ?? false,
    specs: record.specs ?? [],
    originalPrice: record.original_price ?? record.compare_at_price ?? null,
    discount: record.discount ?? null,
    discountPercentage: record.discount_percentage ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}

export function normalizeProducts(records: any[]) {
  return Array.isArray(records) ? records.map(normalizeProduct) : [];
}
