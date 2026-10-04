
# Urban Sport Store

Modern ecommerce platform for sports equipment, apparel, and lifestyle products.

> Estado de operación: catálogo, home, newsletter y CRUD de catálogo usan API/backend. El carrito es solo local y el checkout está bloqueado; no se crean pedidos ni pagos. Direcciones no están persistidas en cuenta; stock por variante y paneles de pedidos/inventario no están activos. Seguridad NO-GO: no desplegar ni migrar hasta rotar credenciales y reconciliar el historial remoto.

## Quick Start

### Frontend

```bash
npm install
npm run dev
# Opens at http://127.0.0.1:5173
```

### Backend local

```bash
cd api
npm install
npm run dev
# Runs the local API at http://127.0.0.1:3000
```

### Backend production / deployment

```bash
# Use the deployed API or environment-specific URL in VITE_API_URL.
# Do not commit real secrets or service-role keys into frontend code.
```

## Environment configuration

Use one frontend API variable for every environment:

```env
VITE_API_URL=http://127.0.0.1:3000/api
```

For production deployments, set `VITE_API_URL` to the secure public API URL of the backend runtime. Do not expose service-role or private credentials in Vite.

### Priority for development

For Vite development, the effective precedence is:

1. `.env.local` (local overrides)
2. `.env.development` (if present)
3. `.env`

Keep the canonical value in `.env.example` and avoid checking in `.env.local`.

## Health check

```bash
curl http://127.0.0.1:3000/api/health
```

Expected response:

```json
{ "ok": true, "service": "urbansport-api" }
```

## Architecture

### Frontend (Vite + React + TypeScript)
- Catálogo conectado al API público.
- Carrito invitado local con rehidratación desde catálogo; no es fuente de precios ni stock.
- Registro/login Supabase Auth y consulta de perfil para adaptar UI.
- Panel CRUD de catálogo protegido por autorización server-side.
- Checkout bloqueado: no crea pedidos ni pagos.
- Uploads de imagen bloqueados hasta configurar un provider server-side.

**See**: [src/](src/) and [Frontend Guide](README.md)

### Backend (Vercel serverless TypeScript)
- Endpoints API para catálogo, categorías, contenido home, newsletter y CRUD admin.
- La API valida bearer token y permisos desde `public.profiles`.
- `POST /api/orders` valida Auth/perfil, pero devuelve 501 y no escribe pedidos.
- No hay API activa para pagos, inventario por variantes, direcciones persistidas o gestión de pedidos.

**See**: [api/](api/) and [Backend Guide](api/README_BACKEND.md)

> Runtime note: the current production runtime is served from Vercel Functions in `api/*.ts` and `api/admin/*`.
> The `api/src/*` Express backend source exists in the repository, but it is not the deployed production runtime today.
> The active production API contract is `/api/*` and `/api/admin/*`.

### Database (Supabase/PostgreSQL)
- Runtime existente: productos, categorías, home content, newsletter, perfiles y auditoría.
- Las tablas de pedidos, pagos, direcciones, carrito, variantes, inventario y cupones son solo migraciones locales.
- Estado de seguridad: NO-GO hasta rotación manual de secretos y reconciliación del historial remoto.

**Schema**: [api/prisma/schema.prisma](api/prisma/schema.prisma)

### SQL Source of Truth
- **Fuente activa:** `supabase/migrations/` es la fuente de verdad SQL.
- **Snapshot legacy / referencia:** `SUPABASE_INIT.sql` permanece en el repositorio como un snapshot histórico y no debe editarse directamente.
- `supabase/migrations/*` son las migraciones activas; todas las validaciones locales deben partir de ellas.
- `compare-schemas` es una verificación auxiliar contra el snapshot legacy, no la autoridad para cambios de esquema.
- Algunas migraciones dependen de Supabase Auth, incluyendo referencias a `auth.users` y funciones como `auth.uid()`.
- No se debe usar todavía: `supabase login`, `supabase link`, `supabase db push`.

### SQL archivos clasificados
- SQL activo:
  - `supabase/migrations/0001_init.sql`
  - `supabase/migrations/20260723_phase1_public_catalog.sql`
  - `supabase/migrations/20260723_phase2_admin_base.sql`
  - `supabase/migrations/20260724_phase4_align_schema.sql`
  - `supabase/seed.sql`
  - `supabase/seed_phase1_public.sql`
  - `supabase/migrations/20261002170300_profiles_role_bootstrap_hardening.sql`
  - `supabase/migrations/20261002170400_unify_profile_authorization.sql`

The historical `20260727000000_set_admin_raw_app_meta.sql` must not be run. Reconcile the remote migration history before using the CLI; `supabase/config.toml` auto-loads only `supabase/seed.sql`.
- SQL legacy / referencia:
  - `SUPABASE_INIT.sql`
- Artefactos auxiliares:
  - `supabase/generated_schema.sql`
  - `supabase/schema_diff_executed.txt`
  - `supabase/remote_schema.sql`

### Current Integration Notes
- El backend de newsletter ya existía en `api/newsletter.ts`; en este lote se conectó el formulario del frontend al endpoint real `POST /api/newsletter`.
- El backend admin para CRUD de categorías existe en `api/admin/categories/*`, pero la UI de administración de categorías aún está pendiente de integrar.
- La carga/borrado de imágenes desde navegador está desactivada. Hay un adaptador filesystem local no conectado; requiere hosting persistente y ruta server-side antes de usarse. Supabase Storage queda como provider alternativo no configurado.

### Authentication (Supabase)
- User sign-up/login with email confirmation
- JWT tokens for API access
- Admin role-based access control
- Row-level security (RLS) on database
- Administrative authorization uses only `public.profiles.role` and `public.profiles.is_active`; Auth metadata is not an authorization source. See [docs/admin-role-management.md](docs/admin-role-management.md).

**Setup**: [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md)

## Features

### Storefront
- ✅ Product browse and search
- ⚠️ Carrito invitado: guarda solo IDs, cantidad y opciones; rehidrata datos desde catálogo. Precios/stock son referenciales.
- [BLOQUEADO] Checkout: backend y esquema remoto sin verificar; no crea pedidos ni pagos.
- ✅ User registration and login: requiere Supabase configurado
- ⚠️ Direcciones: almacenamiento local del dispositivo, no persistencia de cuenta.
- [BLOQUEADO] Historial de pedidos: no hay fuente real conectada; no se muestran pedidos locales/simulados.

### Admin Panel
- ✅ Product create/edit/delete
- [BLOQUEADO] Carga y borrado de imágenes: desactivados hasta provider server-side y policies verificadas.
- ⚠️ Inventory management: sin stock por variante ni endpoint operativo
- ⚠️ Order status tracking: no hay flujo de pedidos conectado
- ⚠️ Sales reports: no se basan en ventas persistidas
- ⚠️ Audit logs: el registro local no es auditoría administrativa confiable

### Security
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Email confirmation for registration
- ⚠️ RLS está habilitado en tablas existentes, pero las nuevas políticas aún requieren aplicar y validar migraciones

## Supabase

UrbanSport Store se está preparando para usar Supabase como la capa segura de PostgreSQL, autenticación y almacenamiento de referencias de imágenes. El proyecto actual es Vite + React + TypeScript, por lo que el uso recomendado es cliente público con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y toda operación administrativa o sensible queda protegida en backend/API o en RLS.

### Requisitos
- Proyecto Supabase creado en la consola.
- URL del proyecto del tipo `https://<project-ref>.supabase.co`.
- Anon/public key para cliente.
- Service role key solo en entorno del servidor, nunca en frontend.
- Dominio de producción: `https://www.urbansportstore.online`.
- Desarrollo local: `http://localhost:5173`.

### Variables

Archivo base a crear en la raíz del proyecto:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=products
VITE_API_URL=http://localhost:4000
VITE_TERMS_URL=
VITE_PRIVACY_POLICY_URL=
```

No configures `SUPABASE_SERVICE_ROLE_KEY` en el frontend. Solo debe estar en el entorno seguro del servidor.

### Migración SQL

Las migraciones nuevas de seguridad y comercio están en:
- [supabase/migrations/20261002170000_security_profiles_audit.sql](supabase/migrations/20261002170000_security_profiles_audit.sql)
- [supabase/migrations/20261002170100_ecommerce_core.sql](supabase/migrations/20261002170100_ecommerce_core.sql)
- [supabase/migrations/20261002170200_ecommerce_rls.sql](supabase/migrations/20261002170200_ecommerce_rls.sql)

No las apliques todavía. Rota credenciales, confirma backup y reconcilia historial/policies según [docs/supabase-migration-reconciliation.md](docs/supabase-migration-reconciliation.md). Mantén `pnpm run supabase:preflight` bloqueando; no uses `supabase db push`.

### Seguridad
- El cliente del navegador solo usa la anon key.
- Los cambios administrativos, stock, pedidos y operaciones sensibles deben protegerse con RLS y backend/API.
- Las imágenes no se almacenan como BLOB en PostgreSQL. Upload/delete desde navegador están desactivados hasta tener un endpoint autorizado y policies verificadas.
- `LocalStorageProvider` está preparado para filesystem persistente pero no conectado; Vercel serverless no se considera persistente. `SupabaseStorageProvider` permanece desconfigurado.

### Primer administrador
1. Crear usuario desde Auth en Supabase.
2. Confirmar su email si la configuración lo exige.
3. Copiar el UUID correcto desde Authentication → Users.
4. Ejecutar únicamente en Supabase SQL Editor como dueño del proyecto:

```sql
UPDATE public.profiles
SET role = 'ADMIN', is_active = true
WHERE id = 'REEMPLAZAR_CON_UUID_DEL_USUARIO';
```

5. Reemplazar el UUID antes de ejecutar. El esquema actual usa `ADMIN` en mayúsculas; no existe una pantalla pública para elevar roles.

### Seguridad y comercio

- Los archivos de entorno de Vercel que estaban versionados se retiraron del índice, pero sus tokens deben revocarse/rotarse manualmente y el historial debe revisarse.
- Las migraciones nuevas aún no se aplicaron al proyecto remoto.
- No ejecutar ni aplicar migraciones hasta completar rotación y reconciliación según [docs/supabase-migration-reconciliation.md](docs/supabase-migration-reconciliation.md). El preflight permanece bloqueando `db push`.
- En Supabase Dashboard → Authentication → Password Security, habilitar y verificar la protección contra contraseñas filtradas.

## Environment Variables

### Frontend (.env.local)

```env
VITE_SUPABASE_URL=https://project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STORAGE_BUCKET=products
VITE_TERMS_URL=
VITE_PRIVACY_POLICY_URL=
```

### Backend (api/.env.local)

```env
DATABASE_URL=postgresql://user:password@localhost/urbansportstore
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=products
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=http://localhost:5173
```

**See**: [api/.env.example](api/.env.example)

## Documentation

- [Backend API Documentation](api/README_BACKEND.md)
- [Local admin product flow](docs/local-admin-product-flow.md)
- [Supabase Admin Setup](docs/supabase-admin-setup.md)
- [E-commerce Operations](docs/ecommerce-operations.md)
- [Supabase Security](docs/supabase-security.md)
- [Production Deployment Checklist](PRODUCTION.md)
- [Database Schema](docs/database.md)
- [Architecture Overview](docs/architecture.md)

## Development

### Scripts

**Frontend**:
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run typecheck  # TypeScript checks
npm test           # Frontend unit tests
npm run e2e        # Playwright tests
```

**Backend**:
```bash
npm run dev           # Start dev server
npm run build         # TypeScript compilation
npm test              # Run tests (vitest)
npm run db:migrate    # Apply migrations
npm run db:seed       # Seed database
npm run lint          # ESLint
```

### Project Structure

```
/
├── src/                    # Frontend source
│   ├── app/
│   │   ├── App.tsx
│   │   └── components/
│   ├── lib/
│   │   ├── supabase-client.ts
│   │   ├── supabase-auth.ts
│   │   ├── supabase-store.ts
│   │   └── admin-api.ts
│   └── styles/
├── api/                    # Backend source
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   └── config/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── package.json
├── docs/                   # Documentation
├── e2e/                    # End-to-end tests
└── package.json
```

## Production Deployment

See [PRODUCTION.md](PRODUCTION.md) for:
- Security hardening checklist
- Environment variables setup
- Database migration strategy
- Deployment to Vercel / Railway
- Monitoring and rollback procedures

## Troubleshooting

### "Email not confirmed" error
- Check Supabase Auth settings → Email confirmation enabled
- User must click confirmation link in their email
- For testing, disable email confirmation in development

### 401 Unauthorized on admin API calls
- Verify user has `role: ADMIN` custom claim in Supabase
- Check backend `SUPABASE_SERVICE_ROLE_KEY` is set
- Ensure RLS policies are applied

### Database connection errors
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Check PostgreSQL service is running
- Run migrations: `npm run db:migrate`

## Contributing

1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open a Pull Request

## License

MIT - See LICENSE file for details

## Support

- [GitHub Issues](https://github.com/Aprendiz-code/Urban-Sport-Store/issues)
- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
  