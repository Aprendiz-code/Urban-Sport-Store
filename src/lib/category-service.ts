import { resolveApiBaseUrl } from './api-config';

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveProductCategoryName(
  categoryId: string | null | undefined,
  fallbackCategory: string | null | undefined,
  categories: readonly CategoryOption[],
): string {
  const category = categories.find((option) => option.id === categoryId);
  if (category) return category.name;

  const fallback = fallbackCategory?.trim();
  if (fallback && fallback !== categoryId && !UUID_PATTERN.test(fallback)) return fallback;
  return 'Sin categoría';
}

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export async function fetchPublicCategories(): Promise<CategoryOption[]> {
  const response = await fetch(`${API_ROOT}/categories`);
  if (!response.ok) {
    throw new Error('No se pudieron cargar las categorías.');
  }

  const payload = await response.json() as { data?: unknown };
  if (!Array.isArray(payload.data)) {
    throw new Error('La respuesta de categorías no es válida.');
  }

  return payload.data.flatMap((value): CategoryOption[] => {
    if (!value || typeof value !== 'object') return [];
    const category = value as Record<string, unknown>;
    if (
      typeof category.id !== 'string'
      || typeof category.name !== 'string'
      || typeof category.slug !== 'string'
      || category.is_active === false
    ) {
      return [];
    }

    const image = category.image_path ?? category.image_url ?? category.image;
    return [{
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: typeof image === 'string' ? image : null,
    }];
  });
}
