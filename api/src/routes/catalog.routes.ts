import { Router } from 'express';
import { listProducts, getProductBySlug, getFeaturedProducts, searchProducts } from '../controllers/product.controller.js';
import { listCategories, getCategoryBySlug, listBrands } from '../controllers/catalog.controller.js';
import { validateQuery, validateParams } from '../middlewares/validation.js';
import { productQuerySchema, slugParamSchema } from '../validators/products.js';

const router = Router();

router.get('/products', validateQuery(productQuerySchema), listProducts);
router.get('/products/featured', getFeaturedProducts);
router.get('/products/search', validateQuery(productQuerySchema), searchProducts);
router.get('/products/:slug', validateParams(slugParamSchema), getProductBySlug);
router.get('/categories', listCategories);
router.get('/categories/:slug', validateParams(slugParamSchema), getCategoryBySlug);
router.get('/brands', listBrands);

export default router;
