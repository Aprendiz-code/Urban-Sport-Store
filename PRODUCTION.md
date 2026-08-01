# Production Deployment Checklist

## Security Hardening

- [ ] **Service Role Key**: Stored only in backend `.env`, never in frontend or public repos
- [ ] **JWT Secret**: Generate strong JWT secret (`openssl rand -base64 32`)
- [ ] **CORS Origins**: Restrict to your actual domain, not `*`
- [ ] **Secure Cookies**: Set `SECURE_COOKIES=true` in production
- [ ] **Email Confirmation**: Enabled in Supabase Auth settings
- [ ] **RLS Policies**: Applied to products table (see [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md))

## Admin User Setup

- [ ] Create the initial admin account
- [ ] Grant `role: ADMIN` custom claim in Supabase Auth
- [ ] Confirm email address
- [ ] Test product CRUD operations

## Database

- [ ] Apply the required Supabase migrations from `supabase/migrations/`
- [ ] Run the relevant seed scripts under `supabase/` for the target environment
- [ ] Backup the production database before deployment

## Frontend Environment

- [ ] `VITE_SUPABASE_URL`: Set to production Supabase project
- [ ] `VITE_SUPABASE_ANON_KEY`: Set to production anon key (safe to expose)
- [ ] `VITE_SUPABASE_STORAGE_BUCKET`: Match the production storage bucket name
- [ ] `VITE_API_URL`: Point to the deployed Vercel API base (for example `/api` or the deployed domain + `/api`)

## Backend Environment

- [ ] `SUPABASE_URL`: Set to production project
- [ ] `SUPABASE_ANON_KEY`: Public anon key for frontend-facing access
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: ⚠️ SENSITIVE - Keep secure
- [ ] `NODE_ENV=production`

> Note: The current Vercel serverless runtime validates Supabase access tokens directly for admin requests. A separate `JWT_SECRET` is not required by the active `/api/admin/*` implementation.

## Production API Reference

- Canonical active production API contract: `/api/*` and `/api/admin/*`
- Runtime canónico actual: Vercel Functions en `api/*.ts` y `api/admin/*`
- Nota: el directorio `api/src/*` existe en el repositorio como backend adicional/legacy, pero no es el runtime desplegado en producción hoy.

- Public endpoints validated (canonical `/api/*` paths):
  - `GET /api/health`
  - `GET /api/products`
  - `GET /api/categories`
  - `GET /api/home`
  - `POST /api/newsletter`

> Warning: another alias (`urban-sport-store-ezfburg3o.vercel.app`) is protected by SSO and should not be used as the operational reference for automated checks.

## Deployment Platform

### Vercel (Frontend + Serverless API)
```bash
npm run build  # Creates optimized dist/
```

### Runtime actual
- El frontend se despliega como app Vite en Vercel.
- Los endpoints públicos y admin se despliegan como Vercel Functions desde `api/*.ts` y `api/admin/*`.
- No se requiere un proceso separado de backend Express/Prisma para el runtime activo.

## Post-Deployment Testing

1. Register a new user → Check email confirmation works
2. Login with test user
3. Promote user to admin via Supabase dashboard
4. Test product create/edit/delete from admin panel
5. Verify product appears in storefront immediately
6. Test product image uploads to Supabase Storage

## Monitoring

- [ ] Enable Supabase Analytics
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Monitor API rate limits
- [ ] Review audit logs regularly

## Rollback Plan

- [ ] Tag releases in Git
- [ ] Keep previous environment values documented
- [ ] Test rollback procedure before production
