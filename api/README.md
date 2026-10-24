# API de UrbanSport Store

## Runtime actual

`api/` contiene funciones serverless TypeScript para Vercel. Usan los helpers de `lib/api-helpers/` y el cliente de Supabase; no hay un servidor Node persistente, Prisma, seed de usuarios ni documentación Swagger implementados en este paquete.

Rutas administrativas existentes:

- `GET/POST /api/admin/products`
- `PATCH/DELETE /api/admin/products/:productId` (PATCH con `{ "is_active": boolean }` cambia solo la disponibilidad; DELETE archiva con `is_active = false`, conserva fila e imágenes y no depende de tablas de pedidos. Responde `200` con `archived: true` y `audit_status: "recorded"` o `"pending"`.)
- `GET/POST /api/admin/categories`
- `GET/PATCH/DELETE /api/admin/categories/:categoryId` (DELETE desactiva)
- `GET/PATCH /api/admin/home-content`
- `GET /api/admin/audit`
- `GET/POST/PATCH /api/shipping/rates` (solo `OWNER`, permiso `settings.manage`; PATCH incluye `rateId`; altas/cambios quedan auditados por RPC)

Envíos y pedidos:

- `POST /api/shipping/quotes` (requiere sesión; cotiza solo con una tarifa local vigente y metadatos logísticos completos)
- `POST /api/orders` requiere `shippingQuoteId`; el backend calcula el subtotal, valida la cotización y persiste el total con envío antes de conservar la reserva de inventario.

Cada handler valida el access token de Supabase y consulta `public.profiles` desde el servidor. El permiso RBAC se deriva de `profiles.role` y requiere `profiles.is_active = true`; `app_metadata` y `user_metadata` no autorizan operaciones. La asignación de roles desde el panel no existe.

Pedidos y pagos Sandbox incluyen `POST /api/orders`, `POST /api/orders/:id/payment-session` y el webhook público `POST /api/webhooks/wompi`. Promociones, usuarios, reportes y movimientos de inventario no tienen endpoints implementados aquí.

## Variables de entorno

Las funciones Vercel requieren `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La service-role key es exclusivamente de servidor y nunca debe tener prefijo `VITE_`. Los nombres y placeholders están en `api/.env.example`; no hay credenciales demo.

La sesión de pago Sandbox requiere `WOMPI_ENVIRONMENT`, `WOMPI_API_BASE_URL`, `WOMPI_PUBLIC_KEY` y `WOMPI_PRIVATE_KEY`. El webhook requiere además `WOMPI_EVENTS_SECRET`, distinto de la llave privada. Configura en Wompi Sandbox un callback HTTPS público a `/api/webhooks/wompi`; no incluyas estas variables en el frontend.

El proyecto remoto está activo. La migración `20261002160428_secure_current_runtime_access` habilita RLS y permisos mínimos para las tablas actuales sin eliminar datos. La CLI local aún necesita autenticación; no ejecutes `supabase db push` hasta reconciliar el historial porque hay una migración remota `remote_schema` sin archivo local y migraciones duplicadas/legacy.

## Scripts

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

Vitest carga `api/test/`. Los E2E del storefront están en `e2e/` y requieren servicios y credenciales dedicados; no los ejecutes contra datos de producción.
