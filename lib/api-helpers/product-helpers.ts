import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';
import {
  isAssignableSportCategoryName,
  normalizeProductCategoryName,
  PRODUCT_CATEGORY_NAMES,
} from '../product-categories.js';

const ALLOWED_PRODUCT_COLUMNS = new Set([
  'slug',
  'name',
  'brand',
  'description',
  'price',
  'compare_at_price',
  'category_id',
  'catalog_section',
  'stock',
  'sku',
  'main_image',
  'images',
  'sizes',
  'specifications',
  'is_active',
]);
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_PRODUCT_GALLERY_IMAGES = 10;

type ProductCategoryRow = { id: string; name: string; slug: string; is_active: boolean };

function isProductCategoryRow(value: unknown): value is ProductCategoryRow {
  if (!value || typeof value !== 'object') return false;
  const category = value as Record<string, unknown>;
  return typeof category.id === 'string'
    && typeof category.name === 'string'
    && typeof category.slug === 'string'
    && typeof category.is_active === 'boolean';
}

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

function parsePermanentImageUrl(value: unknown, fieldName: string): string | undefined {
  const imageUrl = parseString(value);
  if (!imageUrl) return undefined;

  try {
    const url = new URL(imageUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return imageUrl;
  } catch {
    // Reject relative and browser-local references below.
  }

  throw new ApiError(400, `${fieldName} debe ser una URL HTTP o HTTPS permanente.`);
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

function normalizeProductSizes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, 'Las tallas deben ser una lista de textos.');

  const sizes: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') throw new ApiError(400, 'Cada talla debe ser texto.');
    const size = item.trim();
    if (!size) continue;
    const normalized = size.toLowerCase();
    if (seen.has(normalized)) throw new ApiError(400, 'No se permiten tallas duplicadas.');
    seen.add(normalized);
    sizes.push(size);
  }

  return sizes;
}

function normalizeProductSpecifications(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) throw new ApiError(400, 'Las especificaciones deben ser una lista de pares nombre/valor.');

  const specifications: Array<{ name: string; value: string }> = [];
  const seenNames = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError(400, 'Cada especificación debe contener nombre y valor.');
    }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const specificationValue = typeof item.value === 'string' ? item.value.trim() : '';
    if (!name && !specificationValue) continue;
    if (!name || !specificationValue) throw new ApiError(400, 'Completa el nombre y el valor de cada especificación.');

    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName)) throw new ApiError(400, 'No se permiten nombres de especificación duplicados.');
    seenNames.add(normalizedName);
    specifications.push({ name, value: specificationValue });
  }

  return specifications;
}

function setProductFields(payload: Record<string, unknown>, body: any) {
  const name = parseString(body.name);
  const sku = parseString(body.sku);
  const slug = parseString(body.slug);
  if (slug || name) payload.slug = slug ?? createProductSlug(name as string, sku);
  if (name) payload.name = name;
  for (const column of ['brand', 'sku'] as const) {
    const value = parseString(body[column]);
    if (value) payload[column] = value;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') throw new ApiError(400, 'La descripción debe ser texto.');
    payload.description = body.description.trim();
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
  if (body.catalog_section !== undefined) {
    const catalogSection = parseString(body.catalog_section);
    const canonicalSection = PRODUCT_CATEGORY_NAMES.find(
      (section) => normalizeProductCategoryName(section) === normalizeProductCategoryName(catalogSection ?? ''),
    );
    if (!canonicalSection) throw new ApiError(400, 'Selecciona una sección del catálogo válida.');
    payload.catalog_section = canonicalSection;
  }
  if (body.stock !== undefined) {
    const stock = toNumber(body.stock);
    if (stock === undefined || !Number.isInteger(stock) || stock < 0) {
      throw new ApiError(400, 'El stock debe ser un entero mayor o igual a 0.');
    }
    payload.stock = stock;
  }

  const mainImage = parsePermanentImageUrl(body.main_image ?? body.image, 'La imagen principal');
  if (mainImage) payload.main_image = mainImage;
  if (body.images !== undefined) {
    const images = parseStringArray(body.images);
    if (!images) throw new ApiError(400, 'La galería debe ser una lista de imágenes válida.');
    if (images.length > MAX_PRODUCT_GALLERY_IMAGES) {
      throw new ApiError(400, `La galería admite hasta ${MAX_PRODUCT_GALLERY_IMAGES} imágenes.`);
    }
    for (const image of images) {
      parsePermanentImageUrl(image, 'Cada imagen de galería');
    }
    payload.images = images;
  }
  if (body.sizes !== undefined) payload.sizes = normalizeProductSizes(body.sizes);
  if (body.specifications !== undefined) payload.specifications = normalizeProductSpecifications(body.specifications);
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;
}

async function resolveCategoryId(body: any): Promise<string | undefined> {
  const explicitCategoryId = parseString(body.category_id);
  const hasCategoryId = Object.prototype.hasOwnProperty.call(body, 'category_id');
  const hasCategoryName = Object.prototype.hasOwnProperty.call(body, 'category')
    || Object.prototype.hasOwnProperty.call(body, 'category_name')
    || Object.prototype.hasOwnProperty.call(body, 'category_slug');

  if (hasCategoryId && !explicitCategoryId) {
    throw new ApiError(400, 'Selecciona una categoría existente y activa.');
  }

  const categoryValue = parseString(body.category_name) ?? parseString(body.category) ?? parseString(body.category_slug);
  if (hasCategoryName && !explicitCategoryId && !categoryValue) {
    throw new ApiError(400, 'Selecciona una categoría existente y activa.');
  }
  if (!explicitCategoryId && !categoryValue) return undefined;

  const { data: categoryData, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, slug, is_active');
  if (error) throw error;
  if (!Array.isArray(categoryData)) throw new ApiError(400, 'No se pudo validar la categoría seleccionada.');
  const data = categoryData.filter(isProductCategoryRow);
  if (data.length !== categoryData.length) throw new ApiError(400, 'La respuesta de categorías no es válida.');

  const categoryMatches = explicitCategoryId
    ? data.filter((category) => category.id === explicitCategoryId)
    : data.filter((category) => {
      const isSlug = body.category_slug !== undefined
        && body.category_name === undefined
        && body.category === undefined;
      return (isSlug ? category.slug : category.name) === categoryValue;
    });

  if (categoryMatches.length !== 1) {
    throw new ApiError(400, 'La categoría no existe o es ambigua.');
  }

  const category = categoryMatches[0];
  if (category.is_active !== true || typeof category.name !== 'string' || !isAssignableSportCategoryName(category.name)) {
    throw new ApiError(400, 'La categoría seleccionada no está activa o no es asignable.');
  }

  const normalizedName = normalizeProductCategoryName(category.name);
  const sameNameCategories = data.filter(
    (entry) => normalizeProductCategoryName(entry.name) === normalizedName,
  );
  if (sameNameCategories.length !== 1) {
    throw new ApiError(400, 'La categoría seleccionada está duplicada y no se puede asignar.');
  }

  return category.id;
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
