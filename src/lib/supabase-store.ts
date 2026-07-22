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
  images?: string[] | null;
  gender?: string | null;
  is_new?: boolean | null;
  is_featured?: boolean | null;
  specs?: string[] | null;
}

export const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const getFileExtension = (file: File) => {
  const fileName = file.name.toLowerCase();
  const extensionFromName = fileName.split('.').pop();
  if (extensionFromName && SUPPORTED_IMAGE_EXTENSIONS.includes(extensionFromName)) {
    return extensionFromName;
  }

  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';

  return 'png';
};

export const buildProductImagePath = (file: File, prefix = 'products') => {
  const extension = getFileExtension(file);
  const timestamp = Date.now();
  return `${prefix}/${crypto.randomUUID()}-${timestamp}.${extension}`;
};

export const fetchProductsFromSupabase = async (limit = 12): Promise<ProductRecord[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client.from('products').select('*').order('id', { ascending: false }).limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ProductRecord[];
};

export const createProductInSupabase = async (product: ProductRecord) => {
  const client = getSupabaseClient();
  const { data, error } = await client.from('products').insert([product]).select('*').single();

  if (error) {
    throw error;
  }

  return data as ProductRecord;
};

export const seedProductsToSupabase = async (products: ProductRecord[]) => {
  const client = getSupabaseClient();
  const { data, error } = await client.from('products').insert(products).select('*');

  if (error) {
    throw error;
  }

  return (data ?? []) as ProductRecord[];
};

export const updateProductInSupabase = async (productId: string, updates: Partial<ProductRecord>) => {
  const client = getSupabaseClient();
  const { data, error } = await client.from('products').update(updates).eq('id', productId).select('*').single();

  if (error) {
    throw error;
  }

  return data as ProductRecord;
};

export const deleteProductInSupabase = async (productId: string) => {
  const client = getSupabaseClient();
  const { error } = await client.from('products').delete().eq('id', productId);

  if (error) {
    throw error;
  }
};

export const uploadProductImage = async (file: File, path = buildProductImagePath(file)) => {
  const client = getSupabaseClient();
  const bucket = STORAGE_BUCKET;
  const { data, error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const deleteProductImage = async (path: string) => {
  const client = getSupabaseClient();
  const bucket = STORAGE_BUCKET;
  const { error } = await client.storage.from(bucket).remove([path]);

  if (error) {
    throw error;
  }
};

export const getPublicUrl = (bucket: string, path: string) => {
  const client = getSupabaseClient();
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

export const getStoragePathFromPublicUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const bucket = STORAGE_BUCKET;
    const pattern = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(pattern);
    if (index !== -1) {
      const path = parsed.pathname.slice(index + pattern.length);
      return decodeURIComponent(path);
    }
  } catch {
    // ignore invalid URLs
  }

  return null;
};
