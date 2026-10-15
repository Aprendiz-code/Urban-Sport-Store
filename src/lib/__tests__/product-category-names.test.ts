import { describe, expect, it } from 'vitest';
import {
  isAssignableProductCategoryName,
  normalizeProductCategoryName,
  PRODUCT_CATEGORY_NAMES,
} from '../../../lib/product-categories';

describe('product category names', () => {
  it('exposes exactly the seven assignable categories', () => {
    expect(PRODUCT_CATEGORY_NAMES).toEqual([
      'Tenis Hombre',
      'Tenis Mujer',
      'Ropa Hombre',
      'Ropa Mujer',
      'Perfumes',
      'Relojes',
      'Gafas',
    ]);
  });

  it('normalizes legacy casing and whitespace without accepting unrelated labels', () => {
    expect(normalizeProductCategoryName('  TENIS   HOMBRE ')).toBe('tenis hombre');
    expect(isAssignableProductCategoryName('TENIS   HOMBRE')).toBe(true);
    expect(isAssignableProductCategoryName('Urbano')).toBe(false);
  });
});
