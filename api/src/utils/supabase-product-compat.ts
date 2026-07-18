const SUPABASE_PRODUCT_FIELDS = [
  'id',
  'name',
  'brand',
  'price',
  'original_price',
  'discount',
  'rating',
  'reviews',
  'image',
  'category',
  'subcategory',
  'stock',
  'sku',
  'description',
  'colors',
  'sizes',
  'gender',
  'is_new',
  'is_featured',
  'specs',
  'created_at',
  'updated_at',
] as const;

export const sanitizeSupabaseProductPayload = (payload: Record<string, unknown>) => {
  const sanitized: Record<string, unknown> = {};

  for (const field of SUPABASE_PRODUCT_FIELDS) {
    if (field in payload) {
      const value = payload[field];
      if (value === undefined) continue;

      if (field === 'price' && typeof value === 'string') {
        sanitized[field] = Number(value);
        continue;
      }

      if (field === 'stock' && typeof value === 'string') {
        sanitized[field] = Number(value);
        continue;
      }

      if (field === 'rating' && typeof value === 'string') {
        sanitized[field] = Number(value);
        continue;
      }

      if (field === 'reviews' && typeof value === 'string') {
        sanitized[field] = Number(value);
        continue;
      }

      if (field === 'discount' && typeof value === 'string') {
        const parsed = Number(value);
        sanitized[field] = Number.isNaN(parsed) ? null : parsed;
        continue;
      }

      if (field === 'original_price' && typeof value === 'string') {
        const parsed = Number(value);
        sanitized[field] = Number.isNaN(parsed) ? null : parsed;
        continue;
      }

      if (field === 'colors' || field === 'sizes' || field === 'specs') {
        sanitized[field] = Array.isArray(value) ? value : null;
        continue;
      }

      sanitized[field] = value;
    }
  }

  if (!('id' in sanitized) && payload.id) {
    sanitized.id = payload.id;
  }

  return sanitized;
};
