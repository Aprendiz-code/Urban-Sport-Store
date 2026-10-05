# Administración de UrbanSport Store

## Estado actual

El panel está en implementación parcial. El proyecto Supabase vinculado estaba inactivo y no fue posible inspeccionar sus tablas. No se aplicaron migraciones ni se hicieron cambios remotos.

La arquitectura que existe es React/TypeScript + Vite en el cliente, Supabase Auth para sesiones, funciones serverless de Vercel en `api/` y PostgreSQL/Supabase para persistencia. No hay Prisma ni un backend Node persistente activo. Las cargas actuales usan Supabase Storage desde el cliente; el sistema no guarda archivos en el filesystem de Vercel.

## Acceso

- Panel: `/admin`
- Login: `/admin/login`
- Un usuario sin sesión o sin rol administrativo no puede abrir el dashboard.
- El cliente autentica con Supabase Auth y envía su access token como Bearer a las funciones API.
- Cada función administrativa valida el token con Supabase y luego consulta `public.profiles.role` y `public.profiles.is_active` en el servidor.
- Los roles reconocidos son `OWNER`, `ADMIN`, `CATALOG_MANAGER`, `LOGISTICS` y `ACCOUNTANT`. La matriz del backend está en `lib/api-helpers/admin-rbac.ts`.
- La fuente de verdad es `public.profiles`; ni `app_metadata`, ni `user_metadata`, ni almacenamiento del navegador conceden permisos. No existe una interfaz pública para crear administradores. La promoción manual por UUID está documentada en [docs/admin-role-management.md](docs/admin-role-management.md).

## Funciones conectadas

- Productos: endpoints protegidos para lectura, creación, actualización y archivado lógico. El modelo y los campos siguen limitados al esquema existente.
- Categorías: endpoints protegidos de lectura, creación, edición y desactivación; todavía no hay módulo CRUD en el panel.
- Contenido de la home: lectura/actualización de campos soportados por `home_content`.
- Auditoría: lectura de hasta 200 registros. Algunas escrituras existentes registran cambios de productos y contenido.
- Inventario: la vista muestra stock de productos; no hay endpoint funcional de movimientos ni historial.
- Imágenes: el formulario valida JPG/JPEG/PNG/WebP hasta 5 MB y sube a Supabase Storage. Esto sigue usando acceso desde cliente y depende de las políticas efectivas del bucket, que no se pudieron revisar remotamente.

## Funciones pendientes

Pedidos, clientes, variantes, promociones persistentes, reportes de ventas, usuarios administradores y configuración no tienen modelos/endpoints conectados. La sección de promociones no guarda datos y los reportes muestran explícitamente que faltan fuentes de pedidos/pagos. No hay procesamiento de pagos, reembolsos, facturación electrónica ni exportación de ventas.

Las migraciones locales contienen contratos de `profiles` y `audit_logs` incompatibles entre versiones. No las ejecutes sobre producción hasta reactivar Supabase, inspeccionar el esquema real y preparar una migración de reconciliación con respaldo.

## Variables

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_STORAGE_BUCKET`, `VITE_API_URL`. `VITE_TERMS_URL` y `VITE_PRIVACY_POLICY_URL` son overrides opcionales; el registro usa por defecto `/terminos-y-condiciones` y `/politica-de-privacidad`.

Funciones API: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. La service-role key nunca debe tener prefijo `VITE_` ni exponerse al navegador. Configura valores únicamente en archivos locales ignorados o en el entorno protegido del hosting; consulta `.env.example` para los placeholders.

## Desarrollo y validación

```pwsh
pnpm dev
pnpm build
cd api
npm run lint
npm run typecheck
npm test
npm run build
```

Los tests E2E requieren frontend, API y credenciales de prueba dedicadas. No los ejecutes contra datos de producción: algunas pruebas hacen CRUD y modifican contenido.

## Producción y almacenamiento

Vercel usa funciones serverless; su filesystem no es persistente. Mantén medios administrables en Supabase Storage u otro almacenamiento de objetos. Un adaptador a disco solo sería viable en desarrollo o en un servidor con volumen persistente. No se deben borrar objetos mientras tengan referencias en productos o contenido.

Antes de producción: reactivar/inspeccionar Supabase, reconciliar y probar RLS/buckets, provisionar OWNER por canal privilegiado, configurar backups y restauración, rotar cualquier secreto expuesto, y definir políticas reales de envío, promociones, pagos, soporte y privacidad.
