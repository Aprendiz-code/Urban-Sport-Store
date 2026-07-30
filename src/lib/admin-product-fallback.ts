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
