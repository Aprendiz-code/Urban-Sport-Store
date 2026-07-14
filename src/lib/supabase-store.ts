import { getSupabaseClient } from './supabase-client';

export interface ProductRecord {
  id: string;
  name: string;
  brand: string;
  price: number;
  original_price?: number | null;
  discount?: number | null;
  rating?: number | null;
  reviews?: number | null;
  image: string;
  category: string;
  subcategory?: string | null;
  stock?: number | null;
  sku?: string | null;
  description?: string | null;
  colors?: Array<{ name: string; hex: string }> | null;
  sizes?: string[] | null;
  gender?: string | null;
  is_new?: boolean | null;
  is_featured?: boolean | null;
  specs?: string[] | null;
}

export const fetchProductsFromSupabase = async (limit = 12): Promise<ProductRecord[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client.from('products').select('*').limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ProductRecord[];
};

export const uploadProductImage = async (file: File, path = `${Date.now()}-${file.name}`) => {
  const client = getSupabaseClient();
  const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'products';
  const { data, error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const getPublicUrl = (bucket: string, path: string) => {
  const client = getSupabaseClient();
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};
