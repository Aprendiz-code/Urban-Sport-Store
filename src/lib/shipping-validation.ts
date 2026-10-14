import { z } from 'zod';

export const shippingRateSchema = z.object({
  carrier: z.literal('coordinadora'),
  origin_code: z.string().regex(/^\d{8}$/),
  origin_city: z.string().trim().min(2).max(100),
  origin_department: z.string().trim().min(2).max(100),
  destination_code: z.string().regex(/^\d{8}$/),
  destination_city: z.string().trim().min(2).max(100),
  destination_department: z.string().trim().min(2).max(100),
  route_category: z.enum(['Local', 'Regional', 'Nacional', 'Zonal', 'Otros', 'Destinos especiales']),
  min_billable_weight_grams: z.number().int().positive(),
  max_billable_weight_grams: z.number().int().positive(),
  base_rate_cop: z.number().int().positive(),
  tax_status: z.enum(['included', 'excluded', 'unspecified']),
  handling_type: z.enum(['percentage', 'fixed']),
  handling_value: z.number().nonnegative(),
  handling_basis: z.enum(['declared_value', 'per_guide']),
  handling_rounding: z.enum(['exact', 'nearest_peso', 'up_peso', 'down_peso']),
  estimated_delivery_business_days: z.number().int().positive(),
  valid_from: z.string().date(),
  valid_until: z.string().date(),
  is_active: z.boolean(),
}).strict().refine((rate) => rate.min_billable_weight_grams <= rate.max_billable_weight_grams, {
  message: 'El peso mínimo debe ser menor o igual al máximo.',
  path: ['max_billable_weight_grams'],
}).refine((rate) => rate.valid_from <= rate.valid_until, {
  message: 'La vigencia inicial debe ser anterior al fin de vigencia.',
  path: ['valid_until'],
});

export type ShippingRateInput = z.infer<typeof shippingRateSchema>;