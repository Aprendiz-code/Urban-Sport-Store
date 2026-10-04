import http from 'node:http';

const CORS_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

function applyCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function jsonError(res: http.ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: { code: status, message } }));
}

async function resolveRoute(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:3000');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  const handlers: Record<string, () => Promise<{ default: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown> | unknown }>> = {
    '/api/health': () => import('./health.ts'),
    '/api/categories': () => import('./categories.ts'),
    '/api/products': () => import('./products.ts'),
    '/api/home': () => import('./home.ts'),
    '/api/newsletter': () => import('./newsletter.ts'),
    '/api/orders': () => import('./orders.ts'),
    '/api/admin/categories': () => import('./admin/categories/index.ts'),
    '/api/admin/home-content': () => import('./admin/home-content.ts'),
    '/api/admin/audit': () => import('./admin/audit.ts'),
    '/api/admin/products': () => import('./admin/products/index.ts'),
    '/api/admin/product-images': () => import('./admin/product-images.ts'),
  };

  const directHandler = handlers[pathname];
  if (directHandler) {
    const module = await directHandler();
    return module.default(req, res);
  }

  const adminCategoryMatch = pathname.match(/^\/api\/admin\/categories\/(.+)$/);
  if (adminCategoryMatch) {
    const module = await import('./admin/categories/[categoryId].ts');
    return module.default(req, res);
  }

  const adminProductMatch = pathname.match(/^\/api\/admin\/products\/(.+)$/);
  if (adminProductMatch) {
    const module = await import('./admin/products/[productId].ts');
    return module.default(req, res);
  }

  if (pathname === '/api') {
    return (await import('./health.ts')).default(req, res);
  }

  return jsonError(res, 404, 'Route not found.');
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    await resolveRoute(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    jsonError(res, 500, message);
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`Local API running at http://127.0.0.1:${port}`);
});
