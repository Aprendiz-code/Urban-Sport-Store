# Supabase Enterprise Setup Guide

## 1. Service Role Configuration (Backend Admin Access)

The backend uses the **service role key** to perform admin operations on Supabase that bypass RLS policies.

### Steps:

1. Go to your Supabase project dashboard
2. Navigate to **Settings > API**
3. Copy the **Service Role Key** (not the anon key)
4. Add to your backend `.env`:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

⚠️ **Important**: Never expose the service role key in the frontend or public repositories.

## 2. Roles and permissions

The only authorization source is `public.profiles.role` plus `public.profiles.is_active`. The API validates the Supabase access token, then loads the current profile from the server. RLS uses `private.is_admin()`; Auth metadata is never an authorization source. Role permissions are defined in `lib/api-helpers/admin-rbac.ts`.

The first administrator must be promoted manually by the project owner using a verified UUID in SQL Editor. Follow [docs/admin-role-management.md](admin-role-management.md). No public endpoint or signup field assigns roles.

## 3. Email Confirmation (User Registration)

Enable email verification to ensure users confirm their email before logging in.

### Steps:

1. Go to **Authentication > Providers > Email**
2. Enable **Confirm email** 
3. Set your redirect URL:
   - Development: `http://localhost:5173`
   - Production: `https://yourdomain.com`

4. Configure email templates (optional):
   - Subject: "Confirma tu correo"
   - Body: Include the confirmation link

### Registration Flow with Email Confirmation

- User signs up → Supabase sends confirmation email
- User clicks link → Session is created in the browser
- User can immediately browse (storefront is public)
- Admin features require both:
  - Email confirmation ✅
  - An active profile with an allowed role in `public.profiles` ✅

## 4. RLS Policies

Product mutations pass through the server-side admin API. Profile and Storage RLS use `private.is_admin()` backed by `profiles.role` and `profiles.is_active`. The old metadata-based policy SQL is archived and must not be run; see `supabase/migrations/20261002170400_unify_profile_authorization.sql`.

## 5. Architecture

```
Frontend (Vite + React)
  ├── Public reads → Supabase anon client (RLS)
  └── Admin writes → Backend service → Service role client → Supabase

Backend (Vercel serverless functions)
  └── /api/admin/* → Validates bearer token, checks active profile, then uses server service role
      ├── POST /products
      ├── PATCH /products/:id
      └── DELETE /products/:id
```

## 6. Testing Locally

To test the admin workflow:

1. Start the backend: `cd api && npm run dev`
2. Start the frontend: `npm run dev`
3. Register a test user
4. Have the project owner promote the verified profile UUID manually in SQL Editor, following [docs/admin-role-management.md](admin-role-management.md)
5. Use the admin panel to create/edit/delete products
6. Review the resulting audit entries through the protected audit API

## 7. Troubleshooting

### "Insufficient permissions" when creating products

- Check that the authenticated user has an active profile with the expected role
- Verify the RLS policies are applied
- Ensure the backend is using the service role key

### Email confirmation not working

- Verify SMTP settings in Supabase Auth
- Check email templates are configured
- Test with a real email (not example.com domains)

### User can't log in after email confirmation

- Ensure `email_confirmed_at` is set in Supabase
- Check the user's role is set correctly

