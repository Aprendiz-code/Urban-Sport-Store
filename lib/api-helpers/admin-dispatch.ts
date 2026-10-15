import type { IncomingMessage, ServerResponse } from 'node:http';
import { jsonError } from './response.ts';
import { handleProductImageUpload } from './product-image-upload.ts';
import auditHandler from '../api-handlers/admin/audit.ts';
import dashboardHandler from '../api-handlers/admin/dashboard.ts';
import homeContentHandler from '../api-handlers/admin/home-content.ts';
import categoriesHandler from '../api-handlers/admin/categories/index.ts';
import categoryHandler from '../api-handlers/admin/categories/[categoryId].ts';
import productsHandler from '../api-handlers/admin/products/index.ts';
import productHandler from '../api-handlers/admin/products/[productId].ts';
import type { RequestQuery } from './route-query.ts';

type AdminRequest = IncomingMessage & { body?: unknown; query?: RequestQuery };
type AdminHandler = (req: AdminRequest, res: ServerResponse) => Promise<unknown> | unknown;
type RouteDefinition = { handler: AdminHandler; allow: string[] };

const STATIC_ROUTES: Record<string, RouteDefinition> = {
  audit: { handler: auditHandler, allow: ['GET'] },
  dashboard: { handler: dashboardHandler, allow: ['GET'] },
  'home-content': { handler: homeContentHandler, allow: ['GET', 'PATCH'] },
  categories: { handler: categoriesHandler, allow: ['GET', 'POST'] },
  products: { handler: productsHandler, allow: ['GET', 'POST'] },
  'product-images': { handler: handleProductImageUpload, allow: ['POST'] },
};

const DYNAMIC_ROUTES: Record<string, RouteDefinition> = {
  categories: { handler: categoryHandler, allow: ['GET', 'PATCH', 'DELETE'] },
  products: { handler: productHandler, allow: ['PATCH'] },
};

export default async function handleAdminRequest(req: AdminRequest, res: ServerResponse) {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api' || segments[1] !== 'admin') {
    return jsonError(res, 404, 'Ruta administrativa no encontrada.');
  }

  const routeSegments = segments.slice(2);
  const definition = routeSegments.length === 1
    ? STATIC_ROUTES[routeSegments[0] ?? '']
    : routeSegments.length === 2
      ? DYNAMIC_ROUTES[routeSegments[0] ?? '']
      : undefined;
  if (!definition) return jsonError(res, 404, 'Ruta administrativa no encontrada.');

  const method = String(req.method ?? 'GET').toUpperCase();
  if (!definition.allow.includes(method)) {
    res.setHeader('Allow', definition.allow.join(', '));
    return jsonError(res, 405, 'Método no permitido.');
  }

  return definition.handler(req, res);
}