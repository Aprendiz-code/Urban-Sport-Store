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
  subcategory: z.string().optional(),
  stock: z.number().int().nonnegative(),
  sku: z.string().optional(),
  description: z.string().optional(),
});

export type ProductForm = z.infer<typeof productSchema>;

export default { productSchema };
