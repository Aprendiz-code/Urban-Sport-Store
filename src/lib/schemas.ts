import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  brand: z.string().min(1, 'La marca es requerida'),
  price: z.number().nonnegative('El precio debe ser >= 0'),
  originalPrice: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  rating: z.number().nonnegative().optional(),
  reviews: z.number().int().nonnegative().optional(),
  image: z.string().url().optional().or(z.string().min(0)),
  category: z.string().min(1),
  catalogSection: z.string().min(1, 'Selecciona una sección válida.'),
  subcategory: z.string().optional(),
  stock: z.number().int().nonnegative(),
  sku: z.string().optional(),
  description: z.string().optional(),
  shippingWeightGrams: z.number().int().positive().nullable().optional(),
  shippingLengthCm: z.number().positive().nullable().optional(),
  shippingWidthCm: z.number().positive().nullable().optional(),
  shippingHeightCm: z.number().positive().nullable().optional(),
  shippingDeclaredValueCop: z.number().positive().nullable().optional(),
  shippingUnitsPerGuide: z.number().int().positive().nullable().optional(),
});

export type ProductForm = z.infer<typeof productSchema>;

export default { productSchema };
