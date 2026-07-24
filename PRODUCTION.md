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

- [ ] Run `npm run db:migrate` to apply Prisma migrations
- [ ] Run `npm run db:seed` to create initial roles and admin user
- [ ] Backup database before production deployment

## Frontend Environment

- [ ] `VITE_SUPABASE_URL`: Set to production Supabase project
- [ ] `VITE_SUPABASE_ANON_KEY`: Set to production anon key (safe to expose)
- [ ] `VITE_ADMIN_EMAIL`: Optional, defaults to configured value
- [ ] `VITE_ADMIN_PASSWORD`: Optional local admin fallback (not recommended for production)

## Backend Environment

- [ ] `SUPABASE_URL`: Set to production project
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: ⚠️ SENSITIVE - Keep secure
- [ ] `DATABASE_URL`: Production PostgreSQL connection
- [ ] `JWT_SECRET`: Strong secret, different from development
- [ ] `NODE_ENV=production`

## Production API Reference

- Canonical usable production API alias: `https://api-sigma-ruby.vercel.app`

- Public endpoints validated:
  - `GET /health`
  - `GET /products`
  - `GET /api/products`
  - `GET /categories`
  - `GET /api/categories`
  - `GET /home`
  - `GET /api/home`
  - `POST /newsletter`
  - `POST /api/newsletter`

> Warning: another alias (`urban-sport-store-ezfburg3o.vercel.app`) is protected by SSO and should not be used as the operational reference for automated checks.

## Deployment Platform

### Vercel / Netlify (Frontend)
```bash
npm run build  # Creates optimized dist/
```

### Railway / Render (Backend)
```bash
npm install
npm run db:migrate
npm start  # Runs on PORT env variable
```

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
