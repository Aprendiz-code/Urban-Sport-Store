import { describe, expect, it } from 'vitest';
import {
  resolveAssignableProductCategories,
  resolveProductCategoryName,
  type CategoryOption,
} from '../category-service';

const categories: CategoryOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Running', slug: 'running', isActive: true },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Training', slug: 'training', isActive: true },
];

describe('resolveProductCategoryName', () => {
  it('shows the category name for a UUID category id', () => {
    expect(resolveProductCategoryName(categories[0]?.id, categories[0]?.id, categories)).toBe('Running');
  });

  it('preserves a readable legacy category when there is no category id', () => {
    expect(resolveProductCategoryName(null, 'Calzado', categories)).toBe('Calzado');
  });

  it('never exposes an unresolved UUID as a category label', () => {
    expect(resolveProductCategoryName('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', categories)).toBe('Sin categoría');
  });

  it('only exposes unique active canonical categories for assignment', () => {
    expect(resolveAssignableProductCategories([
      { id: '33333333-3333-3333-3333-333333333333', name: 'Tenis Hombre', slug: 'tenis-hombre', isActive: true },
      { id: '44444444-4444-4444-4444-444444444444', name: 'Perfumes', slug: 'perfumes', isActive: false },
      { id: '55555555-5555-5555-5555-555555555555', name: 'Tenis   Hombre', slug: 'legacy-tenis-hombre', isActive: true },
    ])).toEqual([]);
  });
});