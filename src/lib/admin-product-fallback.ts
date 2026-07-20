import adminApi from './admin-api';
import { createProductInSupabase, deleteProductInSupabase, updateProductInSupabase } from './supabase-store';

export async function createProductWithFallback(product: Record<string, unknown>) {
  try {
    return await adminApi.createSupabaseProductApi(product as any);
  } catch (error) {
    console.warn('Admin API create failed, falling back to Supabase.', error);
    return createProductInSupabase(product as any);
  }
}

export async function updateProductWithFallback(productId: string, updates: Record<string, unknown>) {
  try {
    return await adminApi.updateSupabaseProductApi(productId, updates as any);
  } catch (error) {
    console.warn('Admin API update failed, falling back to Supabase.', error);
    return updateProductInSupabase(productId, updates as any);
  }
}

export async function deleteProductWithFallback(productId: string) {
  try {
    await adminApi.deleteSupabaseProductApi(productId);
  } catch (error) {
    console.warn('Admin API delete failed, falling back to Supabase.', error);
    await deleteProductInSupabase(productId);
  }
}
