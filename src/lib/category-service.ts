import { resolveApiBaseUrl } from './api-config';
import {
  normalizeProductCategoryName,
  PRODUCT_CATEGORY_NAMES,
  SPORT_CATEGORY_NAMES,
  type ProductCategoryName,
  type SportCategoryName,
} from '../../lib/product-categories';

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  image?: string | null;
}

export type AssignableProductCategory = CategoryOption & { displayName: ProductCategoryName };
export type AssignableSportCategory = CategoryOption & { displayName: SportCategoryName };

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

export function parseCategoryOptions(data: unknown): CategoryOption[] {
  if (!Array.isArray(data)) {
    throw new Error('La respuesta de categorías no es válida.');
  }

  return data.flatMap((value): CategoryOption[] => {
    if (!value || typeof value !== 'object') return [];
    const category = value as Record<string, unknown>;
    if (
      typeof category.id !== 'string'
      || typeof category.name !== 'string'
      || typeof category.slug !== 'string'
      || (category.is_active !== undefined && typeof category.is_active !== 'boolean')
    ) {
      return [];
    }

    const image = category.image_path ?? category.image_url ?? category.image;
    return [{
      id: category.id,
      name: category.name,
      slug: category.slug,
      isActive: category.is_active !== false,
      image: typeof image === 'string' ? image : null,
    }];
  });
}

export function resolveAssignableProductCategories(
  categories: readonly CategoryOption[],
): AssignableProductCategory[] {
  return PRODUCT_CATEGORY_NAMES.flatMap((displayName) => {
    const matches = categories.filter(
      (category) => normalizeProductCategoryName(category.name) === normalizeProductCategoryName(displayName),
    );
    return matches.length === 1 && matches[0].isActive
      ? [{ ...matches[0], displayName }]
      : [];
  });
}

export function resolveAssignableSportCategories(
  categories: readonly CategoryOption[],
): AssignableSportCategory[] {
  return SPORT_CATEGORY_NAMES.flatMap((displayName) => {
    const matches = categories.filter(
      (category) => normalizeProductCategoryName(category.name) === normalizeProductCategoryName(displayName),
    );
    return matches.length === 1 && matches[0].isActive
      ? [{ ...matches[0], displayName }]
      : [];
  });
}

export function getUnavailableProductCategoryNames(categories: readonly CategoryOption[]): ProductCategoryName[] {
  const assignableNames = new Set(resolveAssignableProductCategories(categories).map((category) => category.displayName));
  return PRODUCT_CATEGORY_NAMES.filter((name) => !assignableNames.has(name));
}

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export async function fetchPublicCategories(): Promise<CategoryOption[]> {
  const response = await fetch(`${API_ROOT}/categories`);
  if (!response.ok) {
    throw new Error('No se pudieron cargar las categorías.');
  }

  const payload = await response.json() as { data?: unknown };
  return parseCategoryOptions(payload.data);
}
