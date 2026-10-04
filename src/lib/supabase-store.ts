import { getSupabaseClient } from './supabase-client';
import { uploadProductImageApi } from './admin-api';

export interface ProductRecord {
  id: string;
  name: string;
  brand: string;
  price: number;
  original_price?: number | null;
  discount?: number | null;
  rating?: number | null;
  compare_at_price?: number | null;
  reviews?: number | null;
  image: string;
  category: string;
  category_id?: string | null;
  main_image?: string | null;
  slug?: string | null;
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
  reviews_count?: number | null;
}

export function resolveStorageBucket(configuredBucket?: string): string {
  return configuredBucket?.trim() || 'products';
}

export const STORAGE_BUCKET = resolveStorageBucket(import.meta.env.VITE_SUPABASE_STORAGE_BUCKET);
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

export const uploadProductImage = async (file: File, _path?: string): Promise<{ path: string }> => {
  return uploadProductImageApi(file);
};

export const deleteProductImage = async (_path: string): Promise<never> => {
  throw new Error('La eliminación de imágenes está desactivada hasta configurar un endpoint server-side autorizado.');
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
