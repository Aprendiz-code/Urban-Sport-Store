# API de UrbanSport Store

## Runtime actual

`api/` contiene funciones serverless TypeScript para Vercel. Usan los helpers de `lib/api-helpers/` y el cliente de Supabase; no hay un servidor Node persistente, Prisma, seed de usuarios ni documentación Swagger implementados en este paquete.

Rutas administrativas existentes:

- `GET/POST /api/admin/products`
- `GET/PATCH/DELETE /api/admin/products/:productId` (DELETE archiva mediante `is_active=false`)
- `GET/POST /api/admin/categories`
- `GET/PATCH/DELETE /api/admin/categories/:categoryId` (DELETE desactiva)
- `GET/PATCH /api/admin/home-content`
- `GET /api/admin/audit`

Cada handler valida el access token de Supabase y requiere un permiso RBAC asociado al rol en `app_metadata`. Los roles y permisos se definen en `lib/api-helpers/admin-rbac.ts`. La asignación de roles desde el panel no existe.

Pedidos, pagos, promociones, usuarios, reportes y movimientos de inventario no tienen endpoints implementados aquí. No se deben tratar como funcionalidades disponibles.

## Variables de entorno

Las funciones Vercel requieren `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La service-role key es exclusivamente de servidor y nunca debe tener prefijo `VITE_`. Los nombres y placeholders están en `api/.env.example`; no hay credenciales demo.

El proyecto Supabase vinculado está actualmente inactivo. Inspecciona el esquema y las políticas antes de aplicar migraciones o probar escrituras.

## Scripts

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

Vitest carga `api/test/`. Los E2E del storefront están en `e2e/` y requieren servicios y credenciales dedicados; no los ejecutes contra datos de producción.
