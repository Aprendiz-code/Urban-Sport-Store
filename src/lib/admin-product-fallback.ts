import adminApi from './admin-api';
import { createProductInSupabase, deleteProductInSupabase, updateProductInSupabase } from './supabase-store';

const isAuthError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  return /\b(401|403)\b/.test(error.message);
};

const isFallbackableError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.name === 'TypeError') return true;
    if (/\b(404|502|503|504)\b/.test(error.message)) return true;
    if (/Network error/i.test(error.message) || /failed to fetch/i.test(error.message)) return true;
    if (/backend down|server unavailable|service unavailable|temporarily unavailable|unable to reach/i.test(error.message)) return true;
  }
  return false;
};

const normalizeSlug = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const DEFAULT_FALLBACK_CATEGORY_ID = '11111111-1111-1111-1111-111111111111';

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

export function buildAdminProductPayload(product: Record<string, unknown>, fallbackRecord: Record<string, unknown> = {}) {
  const fallbackName = toStringValue(fallbackRecord.name) ?? toStringValue(product.name) ?? toStringValue(product.title);
  const fallbackSlug = toStringValue(fallbackRecord.slug) ?? toStringValue(product.slug);
  const fallbackCategoryId = toStringValue(fallbackRecord.category_id) ?? toStringValue(fallbackRecord.categoryId) ?? toStringValue(product.category_id) ?? toStringValue(product.categoryId);
  const fallbackCategoryName = toStringValue(fallbackRecord.category) ?? toStringValue(product.category) ?? toStringValue(fallbackRecord.category_name) ?? toStringValue(product.category_name);
  const fallbackSku = toStringValue(fallbackRecord.sku) ?? toStringValue(product.sku);
  const fallbackDescription = toStringValue(fallbackRecord.description) ?? toStringValue(product.description);
  const fallbackStock = toNumber(fallbackRecord.stock) ?? toNumber(product.stock);
  const fallbackPrice = toNumber(fallbackRecord.price) ?? toNumber(product.price);
  const fallbackOriginalPrice = toNumber(fallbackRecord.compare_at_price) ?? toNumber(fallbackRecord.original_price) ?? toNumber(product.compare_at_price) ?? toNumber(product.original_price) ?? toNumber(product.originalPrice);

  const name = toStringValue(product.name) ?? fallbackName ?? 'Producto';
  const price = toNumber(product.price) ?? fallbackPrice ?? 0;
  const slug = fallbackSlug || normalizeSlug(name) || normalizeSlug(String(fallbackSku || 'producto')) || 'producto';
  const categoryId = fallbackCategoryId || (fallbackCategoryName ? undefined : DEFAULT_FALLBACK_CATEGORY_ID);

  const payload: Record<string, unknown> = {
    slug,
    name,
    price,
    category_id: categoryId || DEFAULT_FALLBACK_CATEGORY_ID,
    description: fallbackDescription ?? toStringValue(product.description) ?? '',
    sku: fallbackSku ?? toStringValue(product.sku) ?? `${Date.now().toString().slice(-6)}`,
    stock: fallbackStock ?? toNumber(product.stock) ?? 0,
    compare_at_price: fallbackOriginalPrice ?? undefined,
    is_active: true,
  };

  if (!payload.category_id && fallbackCategoryName) {
    payload.category = fallbackCategoryName;
    payload.category_name = fallbackCategoryName;
    payload.category_slug = normalizeSlug(String(fallbackCategoryName));
  }

  return payload;
}

export async function createProductWithFallback(adminPayload: Record<string, unknown>, fallbackRecord: Record<string, unknown>) {
  try {
    return await adminApi.createProductApi(adminPayload as any);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    if (isFallbackableError(error)) {
      console.warn('Admin API create failed, falling back to Supabase.', error);
      try {
        const sanitized = { ...fallbackRecord } as Record<string, unknown>;
        const removedKeys: string[] = [];

        const fallbackSlug = typeof sanitized.slug === 'string' && sanitized.slug.trim().length
          ? sanitized.slug
          : normalizeSlug(String(sanitized.name ?? sanitized.sku ?? 'producto').trim() || 'producto');

        if (fallbackSlug) {
          sanitized.slug = fallbackSlug;
        }

        const allowed = new Set([
          'id',
          'slug',
          'name',
          'price',
          'compare_at_price',
          'category_id',
          'stock',
          'sku',
          'description',
          'is_active',
          'created_at',
          'updated_at',
        ]);

        const mappings: Record<string, string> = {
          original_price: 'compare_at_price',
          category: 'category_id',
        };

        for (const [from, to] of Object.entries(mappings)) {
          if (Object.prototype.hasOwnProperty.call(sanitized, from)) {
            const val = (sanitized as any)[from];
            if (typeof val !== 'undefined' && val !== null) {
              (sanitized as any)[to] = val;
            }
            delete (sanitized as any)[from];
            removedKeys.push(from);
          }
        }

        for (const [k, v] of Object.entries({ ...sanitized })) {
          if (!allowed.has(k)) {
            delete (sanitized as any)[k];
            removedKeys.push(k);
            continue;
          }
          if (Array.isArray(v) && v.length === 0) {
            delete (sanitized as any)[k];
            removedKeys.push(k);
            continue;
          }
          if (typeof v === 'undefined' || v === null) {
            delete (sanitized as any)[k];
            removedKeys.push(k);
            continue;
          }
        }

        const fields = Object.keys(sanitized);
        console.debug('[admin-fallback] preparing Supabase insert', {
          originalFallbackKeys: Object.keys(fallbackRecord),
          finalPayloadPreview: JSON.stringify(sanitized).slice(0, 2048),
          fields,
          removedKeys,
        });

        const result = await createProductInSupabase(sanitized as any);
        console.debug('[admin-fallback] create succeeded', { result });
        return result;
      } catch (supErr) {
        console.error('[admin-fallback] Supabase insert failed', { error: supErr });
        throw supErr;
      }
    }
    throw error;
  }
}

export async function updateProductWithFallback(productId: string, adminUpdates: Record<string, unknown>, fallbackUpdates: Record<string, unknown>) {
  try {
    return await adminApi.updateProductApi(productId, adminUpdates as any);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    if (isFallbackableError(error)) {
      console.warn('Admin API update failed, falling back to Supabase.', error);
      return updateProductInSupabase(productId, fallbackUpdates as any);
    }
    throw error;
  }
}

export async function deleteProductWithFallback(productId: string) {
  try {
    await adminApi.deleteProductApi(productId);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    if (isFallbackableError(error)) {
      console.warn('Admin API delete failed, falling back to Supabase.', error);
      await deleteProductInSupabase(productId);
      return;
    }
    throw error;
  }
}
