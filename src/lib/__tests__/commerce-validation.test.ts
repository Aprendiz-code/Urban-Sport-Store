import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  cartItemSchema,
  createOrderRequestSchema,
  allowedOrderStatusTransitions,
  profileUpdateSchema,
} from '../commerce-validation';
import { normalizeGuestCartEntries } from '../cart-service';

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
      address: {
        recipientName: 'Ana Gómez',
        city: 'Bogotá',
        addressLine1: 'Cra 15 #84-25',
        phone: '+57 311 234 5678',
        country: 'CO',
      },
      items: [
        { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
      ],
      note: 'Entregar antes de las 18:00',
    });

    expect(order.items[0].quantity).toBe(1);
  });

  it('rejects invalid quantities and disallowed client-controlled fields', () => {
    expect(() => cartItemSchema.parse({ productId: 'x', quantity: 0 })).toThrow();

    expect(() => createOrderRequestSchema.parse({
      address: {
        recipientName: 'Ana Gómez',
        city: 'Bogotá',
        addressLine1: 'Cra 15 #84-25',
        phone: '+57 311 234 5678',
        country: 'CO',
      },
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
      total: 30000,
    })).toThrow();
  });

  it('documents the valid order status transitions', () => {
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
