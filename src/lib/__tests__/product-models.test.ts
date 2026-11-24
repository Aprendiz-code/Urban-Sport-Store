import { describe, expect, it } from 'vitest';
import type { Product } from '../../types/domain';
import { groupProductsByModel, productForColor } from '../product-models';

const product = (overrides: Partial<Product> & Pick<Product, 'id'>): Product => ({
  name: 'New Balance Fresh Foam 410',
  brand: 'New Balance',
  price: 190000,
  rating: 0,
  reviews: 0,
  image: `https://images.test/${overrides.id}-main.jpg`,
  category: 'Tenis Mujer',
  subcategory: 'Running',
  stock: 5,
  sku: overrides.id,
  description: '',
  colors: [],
  sizes: ['US 7', 'US 8'],
  ...overrides,
  id: overrides.id,
});

describe('product model grouping', () => {
  it('creates one color sample for one product with four gallery angles', () => {
    const grayProduct = product({
      id: 'gray-record',
      colorName: 'Gris / Plata',
      colorHex: '#A7ADB4',
      colorHex2: '#D6DADE',
      isDefaultColor: true,
      images: [
        'https://images.test/gray-front.jpg',
        'https://images.test/gray-side.jpg',
        'https://images.test/gray-back.jpg',
        'https://images.test/gray-sole.jpg',
      ],
    });
    const blackProduct = product({
      id: 'black-record',
      modelId: 'gray-record',
      colorName: 'Negro',
      colorHex: '#111827',
      price: 205000,
      stock: 2,
      sku: 'NB-410-BLK',
    });

    const [model] = groupProductsByModel([grayProduct, blackProduct]);

    expect(model.id).toBe('gray-record');
    expect(model.colors.map((color) => color.name)).toEqual(['Gris / Plata', 'Negro']);
    expect(model.colors).toHaveLength(2);
    expect(model.colors[0].images).toHaveLength(4);
    expect(productForColor(model, 'black-record')).toMatchObject({
      id: 'black-record',
      price: 205000,
      stock: 2,
      sku: 'NB-410-BLK',
      colorName: 'Negro',
    });
  });

  it('keeps legacy products without registered colors as standalone entries', () => {
    const [legacy] = groupProductsByModel([product({ id: 'legacy' })]);
    expect(legacy.id).toBe('legacy');
    expect(legacy.colors).toEqual([]);
  });
});