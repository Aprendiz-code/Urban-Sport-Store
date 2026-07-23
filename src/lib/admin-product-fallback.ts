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
  }
  return false;
};

export async function createProductWithFallback(product: Record<string, unknown>) {
  try {
    return await adminApi.createProductApi(product as any);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    if (isFallbackableError(error)) {
      console.warn('Admin API create failed, falling back to Supabase.', error);
      return createProductInSupabase(product as any);
    }
    throw error;
  }
}

export async function updateProductWithFallback(productId: string, updates: Record<string, unknown>) {
  try {
    return await adminApi.updateProductApi(productId, updates as any);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    if (isFallbackableError(error)) {
      console.warn('Admin API update failed, falling back to Supabase.', error);
      return updateProductInSupabase(productId, updates as any);
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
