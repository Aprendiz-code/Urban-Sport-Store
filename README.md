
# Urban Sport Store

Modern ecommerce platform for sports equipment, apparel, and lifestyle products.

## Quick Start

### Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Opens at http://localhost:5173
```

### Backend / API serverless

```bash
cd api
npm install

# Configure the serverless runtime environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# The active runtime is Vercel Functions under /api and /api/admin
# No separate Express/Prisma backend process is required for the current deployment
```

## Architecture

### Frontend (Vite + React + TypeScript)
- Storefront with product catalog
- Shopping cart and checkout flow
- User authentication (login/register)
- Admin dashboard for product management
- Image uploads to Supabase Storage

**See**: [src/](src/) and [Frontend Guide](README.md)

### Backend (Vercel Functions + Supabase)
- Public endpoints under `/api/*`
- Admin endpoints under `/api/admin/*`
- Supabase token validation for admin access
- Product and category CRUD through serverless handlers
- Home content and audit log support
- Supabase Storage for product images

**See**: [api/](api/) and [api/README.md](api/README.md)

> Runtime note: the current production runtime is served from Vercel Functions in `api/*.ts` and `api/admin/*`.
> Legacy Express/Prisma artifacts remain in the repository as historical reference only and are not part of the deployed runtime today.
> The active production API contract is `/api/*` and `/api/admin/*`.

### Database (Supabase Postgres)
- Product catalog
- User accounts and roles
- Storage buckets and public URLs
- Audit trail in Supabase tables
- RLS policies enforced by Supabase

**Schema**: [supabase/migrations](supabase/migrations)

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
  - `supabase/seed_phase2_admin_test.sql`
- SQL legacy / referencia:
  - `SUPABASE_INIT.sql`
- Artefactos auxiliares:
  - `supabase/generated_schema.sql`
  - `supabase/schema_diff_executed.txt`
  - `supabase/remote_schema.sql`

### Current Integration Notes
- El backend de newsletter ya existía en `api/newsletter.ts`; en este lote se conectó el formulario del frontend al endpoint real `POST /api/newsletter`.
- El backend admin para CRUD de categorías existe en `api/admin/categories/*`, pero la UI de administración de categorías aún está pendiente de integrar.
- El upload de imágenes hoy se realiza directamente desde el frontend a Supabase Storage usando `VITE_SUPABASE_STORAGE_BUCKET`. Esta ruta funciona, pero requiere revisión de seguridad y posiblemente un proxy backend en un lote futuro.

### Authentication (Supabase)
- User sign-up/login with email confirmation
- JWT tokens for API access
- Admin role-based access control
- Row-level security (RLS) on database

**Setup**: [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md)

## Features

### Storefront
- ✅ Product browse and search
- ✅ Shopping cart
- ✅ Checkout flow
- ✅ User registration and login
- ✅ Address management
- ✅ Order history

### Admin Panel
- ✅ Product create/edit/delete
- ✅ Image upload to cloud storage
- ✅ Inventory management
- ✅ Order status tracking
- ✅ Sales reports
- ✅ Audit logs

### Security
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Email confirmation for registration
- ✅ Row-level security in database

## Environment Variables

### Frontend (.env.local)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STORAGE_BUCKET=product-images
VITE_API_URL=http://localhost:3000/api
```

### Backend (api/.env.local)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

**See**: [api/.env.example](api/.env.example)

> Legacy values such as `DATABASE_URL`, `JWT_SECRET` and `CORS_ORIGINS` are not part of the current serverless runtime and should be removed from local setups unless a legacy path is explicitly being exercised.

## Documentation

- [Backend API Documentation](api/README_BACKEND.md)
- [Supabase Admin Setup](docs/supabase-admin-setup.md)
- [Production Deployment Checklist](PRODUCTION.md)
- [Database Schema](docs/database.md)
- [Architecture Overview](docs/architecture.md)

## Development

### Scripts

**Frontend**:
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
npm run e2e        # Playwright tests
```

**Backend**:
```bash
npm run dev           # Start local TypeScript build/watch
npm run build         # TypeScript compilation
npm test              # Run tests (vitest)
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
│   │   ├── supabase-auth.ts
│   │   ├── supabase-store.ts
│   │   └── admin-api.ts
│   └── styles/
├── api/                    # Serverless runtime source
│   ├── products.ts
│   ├── categories.ts
│   ├── home.ts
│   ├── newsletter.ts
│   └── admin/
├── supabase/               # SQL migrations and seeds
├── docs/                   # Documentation
├── e2e/                    # End-to-end tests
└── package.json
```

## Production Deployment

See [PRODUCTION.md](PRODUCTION.md) for:
- Security hardening checklist
- Environment variables setup
- Supabase migration strategy
- Deployment to Vercel with the current serverless API contract
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
- Verify the Supabase project URL and anon/service-role keys in the active environment
- Check that the required Supabase migrations have been applied to the target project
- Confirm that the relevant tables and RLS policies exist before calling the admin endpoints

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
- [Supabase Documentation](https://supabase.com/docs)
  