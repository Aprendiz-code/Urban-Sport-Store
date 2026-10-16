export const PRODUCT_CATEGORY_NAMES = [
  'Tenis Hombre',
  'Tenis Mujer',
  'Ropa Hombre',
  'Ropa Mujer',
  'Perfumes',
  'Relojes',
  'Gafas',
] as const;

export const SPORT_CATEGORY_NAMES = ['Urbano', 'Running', 'Training'] as const;

export type ProductCategoryName = (typeof PRODUCT_CATEGORY_NAMES)[number];
export type SportCategoryName = (typeof SPORT_CATEGORY_NAMES)[number];

export function normalizeProductCategoryName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO');
}

export function isAssignableProductCategoryName(value: string): value is ProductCategoryName {
  const normalized = normalizeProductCategoryName(value);
  return PRODUCT_CATEGORY_NAMES.some((name) => normalizeProductCategoryName(name) === normalized);
}

export function isAssignableSportCategoryName(value: string): value is SportCategoryName {
  const normalized = normalizeProductCategoryName(value);
  return SPORT_CATEGORY_NAMES.some((name) => normalizeProductCategoryName(name) === normalized);
}
