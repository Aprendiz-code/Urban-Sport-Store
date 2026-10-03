import { describe, expect, it } from 'vitest';
import { resolveProductCategoryName, type CategoryOption } from '../category-service';

const categories: CategoryOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Running', slug: 'running' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Training', slug: 'training' },
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
});