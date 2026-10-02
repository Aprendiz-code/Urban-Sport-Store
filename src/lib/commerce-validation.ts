import { z } from 'zod';

const phonePattern = /^(\+?[0-9\s\-()]{7,20})$/;

export const addressSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(2).max(80).optional(),
  recipientName: z.string().trim().min(2).max(120).optional(),
  line1: z.string().trim().min(5).max(180).optional(),
  addressLine1: z.string().trim().min(5).max(180).optional(),
  line2: z.string().trim().max(180).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120).optional(),
  postalCode: z.string().trim().min(3).max(20).optional(),
  country: z.string().trim().default('CO').transform((value) => value.toUpperCase()),
  phone: z.string().trim().regex(phonePattern, 'Teléfono inválido. Usa un formato válido para Colombia o internacional.'),
  isDefault: z.boolean().optional(),
}).transform((value) => ({
  ...value,
  country: (value.country ?? 'CO').toUpperCase(),
  label: value.label ?? value.recipientName ?? 'Dirección',
  line1: value.line1 ?? value.addressLine1 ?? '',
}));

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().regex(phonePattern, 'Teléfono inválido. Usa un formato válido para Colombia o internacional.').optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'Indica al menos un dato personal para actualizar.',
});

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().positive('La cantidad debe ser mayor que cero.'),
}).strict();

export const checkoutItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().positive('La cantidad debe ser mayor que cero.'),
}).strict();

export const createOrderRequestSchema = z.object({
  addressId: z.string().min(1).optional(),
  address: addressSchema.optional(),
  items: z.array(checkoutItemSchema).min(1, 'Debe incluir al menos un producto.'),
  couponCode: z.string().trim().min(3).max(50).optional(),
  note: z.string().trim().max(500).optional(),
}).strict().refine((payload) => Boolean(payload.addressId || payload.address), {
  message: 'Debe indicar una dirección válida del usuario.',
  path: ['address'],
}).refine((payload) => !('total' in payload || 'subtotal' in payload || 'discount' in payload || 'shippingAmount' in payload || 'price' in payload || 'stock' in payload), {
  message: 'No se aceptan campos de pago o precio enviados desde el frontend.',
  path: ['items'],
});

export const allowedOrderStatusTransitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export const adminOrderStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  note: z.string().trim().max(500).optional(),
}).strict();

export const allowedPaymentStatusTransitions: Record<string, string[]> = {
  pending: ['paid', 'failed', 'cancelled'],
  paid: ['refunded'],
  failed: ['pending'],
  cancelled: [],
  refunded: [],
};

export const allowedShipmentStatusTransitions: Record<string, string[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
};
