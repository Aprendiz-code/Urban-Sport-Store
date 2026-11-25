import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  cartItemSchema,
  createOrderRequestSchema,
  shippingQuoteRequestSchema,
  allowedOrderStatusTransitions,
  profileUpdateSchema,
} from '../commerce-validation';
import { normalizeGuestCartEntries, resolveGuestCartEntries } from '../cart-service';
import { groupProductsByModel } from '../product-models';

describe('commerce validation', () => {
  it('accepts a valid address and customer order request', () => {
    const address = addressSchema.parse({
      recipientName: 'Ana Gómez',
      city: 'Bogotá',
      addressLine1: 'Cra 15 #84-25',
      phone: '+57 311 234 5678',
      country: 'CO',
      department: 'Cundinamarca',
    });

    expect(address.country).toBe('CO');

    const order = createOrderRequestSchema.parse({
      shippingQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      address: {
        recipientName: 'Ana Gómez',
        addressLine1: 'Cra 15 #84-25',
        city: 'Bogotá',
        state: 'Cundinamarca',
        postalCode: '110221',
        phone: '+57 311 234 5678',
        country: 'CO',
      },
      items: [
        { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
      ],
      note: 'Entregar antes de las 18:00',
    });

    expect(order.items[0].quantity).toBe(1);
    expect(order.address.country).toBe('CO');
    expect(shippingQuoteRequestSchema.parse({
      destinationCode: '11001000', address: order.address, items: order.items,
    }).items).toHaveLength(1);
  });

  it('rejects invalid quantities and disallowed client-controlled fields', () => {
    expect(() => cartItemSchema.parse({ productId: 'x', quantity: 0 })).toThrow();

    expect(() => createOrderRequestSchema.parse({
      shippingQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      address: {
        recipientName: 'Ana Gómez',
        addressLine1: 'Cra 15 #84-25',
        city: 'Bogotá',
        state: 'Cundinamarca',
        postalCode: '110221',
        phone: '+57 311 234 5678',
        country: 'CO',
      },
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
      total: 30000,
    })).toThrow();
  });

  it('requires a shipping quote with a clear Spanish validation message', () => {
    const result = createOrderRequestSchema.safeParse({
      address: {
        recipientName: 'Ana Gómez',
        addressLine1: 'Cra 15 #84-25',
        city: 'Bogotá',
        state: 'Cundinamarca',
        postalCode: '110221',
        phone: '+57 311 234 5678',
        country: 'CO',
      },
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Confirma una cotización de envío vigente antes de pagar.');
    }
  });

  it('rejects extra address fields, oversized address content, and unbounded product lists', () => {
    const address = {
      recipientName: 'Ana Gómez',
      addressLine1: 'Cra 15 #84-25',
      city: 'Bogotá',
      state: 'Cundinamarca',
      postalCode: '110221',
      phone: '+57 311 234 5678',
      country: 'CO',
    };
    const productId = '11111111-1111-4111-8111-111111111111';

    expect(() => createOrderRequestSchema.parse({
      shippingQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      address: { ...address, arbitrary: 'ignored?' },
      items: [{ productId, quantity: 1 }],
    })).toThrow();
    expect(() => createOrderRequestSchema.parse({
      shippingQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      address: { ...address, addressLine1: 'x'.repeat(181) },
      items: [{ productId, quantity: 1 }],
    })).toThrow();
    expect(() => createOrderRequestSchema.parse({
      address,
      items: Array.from({ length: 21 }, (_, index) => ({
        productId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
        quantity: 1,
      })),
    })).toThrow();
  });

  it('documents the valid order status transitions', () => {
    expect(allowedOrderStatusTransitions.pending_payment).toEqual(['cancelled']);
    expect(allowedOrderStatusTransitions.confirmed).not.toContain('cancelled');
    expect(allowedOrderStatusTransitions.pending).toContain('confirmed');
    expect(allowedOrderStatusTransitions.confirmed).toContain('processing');
    expect(allowedOrderStatusTransitions.shipped).toContain('delivered');
    expect(allowedOrderStatusTransitions.pending).not.toContain('paid');
  });

  it('migrates legacy guest cart entries without trusting stored product data', () => {
    const entries = normalizeGuestCartEntries([{
      product: { id: 'product-1', name: 'Legacy name', price: 999999, stock: 99 },
      qty: 2,
      selectedSize: 'M',
      selectedColor: 'Negro',
    }]);

    expect(entries).toEqual([{
      productId: 'product-1',
      quantity: 2,
      selectedSize: 'M',
      selectedColor: 'Negro',
    }]);
    expect(normalizeGuestCartEntries([{ productId: 'product-2', quantity: 0 }])).toEqual([]);
  });

  it('retains cart lines for inactive or missing products as unavailable', () => {
    const entries = [
      { productId: 'active', quantity: 1 },
      { productId: 'inactive', quantity: 2, selectedSize: 'M' },
      { productId: 'missing', quantity: 3 },
    ];
    const products = [
      {
        id: 'active', name: 'Activo', brand: 'Marca', price: 100, rating: 0, reviews: 0,
        image: '', category: '', subcategory: '', stock: 1, sku: 'A', description: '',
        colors: [], sizes: [], isActive: true,
      },
      {
        id: 'inactive', name: 'Inactivo', brand: 'Marca', price: 100, rating: 0, reviews: 0,
        image: '', category: '', subcategory: '', stock: 1, sku: 'I', description: '',
        colors: [], sizes: ['M'], isActive: false,
      },
    ];

    const result = resolveGuestCartEntries(entries, products);

    expect(result.restoredItems.map((item) => item.product.id)).toEqual(['active']);
    expect(result.unavailableItems).toEqual([entries[1], entries[2]]);
  });

  it('restores same-size cart lines by stable color variant ID', () => {
    const [model] = groupProductsByModel([
      {
        id: 'model-gray', name: 'Tenis modelo', brand: 'Marca', price: 100, rating: 0, reviews: 0,
        image: 'gray.jpg', category: '', subcategory: '', stock: 3, sku: 'GRAY', description: '',
        colors: [], sizes: ['M'], isActive: true, colorHex: '#808080', isDefaultColor: true,
      },
      {
        id: 'variant-black', modelId: 'model-gray', name: 'Tenis modelo', brand: 'Marca', price: 110, rating: 0, reviews: 0,
        image: 'black.jpg', category: '', subcategory: '', stock: 2, sku: 'BLACK', description: '',
        colors: [], sizes: ['M'], isActive: true, colorHex: '#111827',
      },
    ]);
    const result = resolveGuestCartEntries([
      { productId: 'model-gray', quantity: 1, selectedSize: 'M', selectedColor: 'Gris' },
      { productId: 'variant-black', quantity: 1, selectedSize: 'M', selectedColor: 'Negro' },
    ], [model]);

    expect(result.unavailableItems).toEqual([]);
    expect(result.restoredItems.map((item) => [item.product.id, item.selectedSize, item.selectedColor])).toEqual([
      ['model-gray', 'M', ''],
      ['variant-black', 'M', ''],
    ]);
    expect(result.restoredItems.map((item) => item.product.price)).toEqual([100, 110]);
  });

  it('accepts only personal profile fields', () => {
    expect(profileUpdateSchema.parse({ firstName: 'Ana', lastName: 'Gómez', phone: '+57 311 234 5678' })).toEqual({
      firstName: 'Ana',
      lastName: 'Gómez',
      phone: '+57 311 234 5678',
    });
    expect(() => profileUpdateSchema.parse({ role: 'ADMIN' })).toThrow();
    expect(() => profileUpdateSchema.parse({ email: 'other@example.test' })).toThrow();
  });
});
