import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';

const ALLOWED_PRODUCT_COLUMNS = new Set([
  'slug',
  'name',
  'brand',
  'description',
  'price',
  'compare_at_price',
  'category_id',
  'stock',
  'sku',
  'main_image',
  'images',
  'is_active',
]);
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_PRODUCT_GALLERY_IMAGES = 10;

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

function createProductSlug(name: string, sku: string | undefined): string {
  const base = `${name}-${sku ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
  return base || `product-${Date.now()}`;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === 'string') ? value : undefined;
}

function setProductFields(payload: Record<string, unknown>, body: any) {
  const name = parseString(body.name);
  const sku = parseString(body.sku);
  const slug = parseString(body.slug);
  if (slug || name) payload.slug = slug ?? createProductSlug(name as string, sku);
  if (name) payload.name = name;
  for (const column of ['brand', 'description', 'sku'] as const) {
    const value = parseString(body[column]);
    if (value) payload[column] = value;
  }

  if (body.price !== undefined) {
    const price = toNumber(body.price);
    if (price === undefined || price < 0) throw new ApiError(400, 'El precio debe ser un número mayor o igual a 0.');
    payload.price = price;
  }
  const requestedDiscount = body.discount_percentage ?? body.discount;
  if (requestedDiscount !== undefined) {
    const discount = toNumber(requestedDiscount);
    if (discount === undefined || discount < 0) throw new ApiError(400, 'El descuento debe ser un número mayor o igual a 0.');
  }
  const compareAtPrice = computeCompareAtPrice(body);
  if (compareAtPrice !== undefined) {
    if (compareAtPrice < 0) throw new ApiError(400, 'El precio anterior no puede ser negativo.');
    payload.compare_at_price = compareAtPrice;
  }
  const categoryId = body.category_id;
  if (typeof categoryId === 'string' && categoryId.trim()) {
    if (!UUID_PATTERN.test(categoryId.trim())) throw new ApiError(400, 'La categoría seleccionada no es válida.');
    payload.category_id = categoryId.trim();
  }
  if (body.stock !== undefined) {
    const stock = toNumber(body.stock);
    if (stock === undefined || !Number.isInteger(stock) || stock < 0) {
      throw new ApiError(400, 'El stock debe ser un entero mayor o igual a 0.');
    }
    payload.stock = stock;
  }

  const mainImage = parseString(body.main_image) ?? parseString(body.image);
  if (mainImage) payload.main_image = mainImage;
  if (body.images !== undefined) {
    const images = parseStringArray(body.images);
    if (!images) throw new ApiError(400, 'La galería debe ser una lista de imágenes válida.');
    if (images.length > MAX_PRODUCT_GALLERY_IMAGES) {
      throw new ApiError(400, `La galería admite hasta ${MAX_PRODUCT_GALLERY_IMAGES} imágenes.`);
    }
    payload.images = images;
  }
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;
}

async function resolveCategoryId(body: any): Promise<string | undefined> {
  const explicitCategoryId = parseString(body.category_id);
  if (explicitCategoryId) {
    if (!UUID_PATTERN.test(explicitCategoryId)) throw new ApiError(400, 'La categoría seleccionada no es válida.');
    return explicitCategoryId;
  }

  const categoryValue = parseString(body.category) ?? parseString(body.category_name) ?? parseString(body.category_slug);
  if (!categoryValue) return undefined;

  const encodedValue = encodeURIComponent(categoryValue);
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .or(`name.eq.${encodedValue},slug.eq.${encodedValue}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
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
  setProductFields(payload, body);
  const categoryId = await resolveCategoryId(body);
  if (categoryId) payload.category_id = categoryId;

  return filterProductColumns(payload);
}

export async function normalizeProductUpdates(body: any) {
  const updates: Record<string, unknown> = {};
  setProductFields(updates, body);
  const shouldResolveCategory = body.category_id !== undefined || body.category !== undefined || body.category_name !== undefined || body.category_slug !== undefined;
  const categoryId = shouldResolveCategory ? await resolveCategoryId(body) : undefined;
  if (categoryId) updates.category_id = categoryId;

  return filterProductColumns(updates);
}
