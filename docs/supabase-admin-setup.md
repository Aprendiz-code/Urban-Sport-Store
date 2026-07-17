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

## 2. User Roles in Supabase Auth

Define roles using custom claims in Supabase Auth:

### Admin Role Setup

1. After a user signs up/logs in via the app, go to Supabase Dashboard
2. Navigate to **Auth > Users**
3. Click on the user and edit their custom claims (JSON):

```json
{
  "role": "ADMIN",
  "isAdmin": true
}
```

The RLS policies check for these exact claims when a user attempts to write/delete products.

### Role Levels

- **CUSTOMER**: Default role. Can only read products
- **ADMIN**: Can create, update, and delete products

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
  - Admin role in custom claims ✅

## 4. RLS Policies

All product mutations require:

1. User is authenticated (`auth.uid()` is not null)
2. User has the correct custom claim (`role = 'ADMIN'` or `isAdmin = true`)

See [docs/supabase-rules.sql](./supabase-rules.sql) for the actual policies.

## 5. Architecture

```
Frontend (Vite + React)
  ├── Public reads → Supabase anon client (RLS)
  └── Admin writes → Backend service → Service role client → Supabase

Backend (Node.js + Express)
  └── /api/v1/admin/* → Uses service role key for safe writes
      ├── POST /products
      ├── PATCH /products/:id
      └── DELETE /products/:id
```

## 6. Testing Locally

To test the admin workflow:

1. Start the backend: `cd api && npm run dev`
2. Start the frontend: `npm run dev`
3. Register a test user
4. Manually add the admin role via Supabase dashboard
5. Use the admin panel to create/edit/delete products
6. Monitor Supabase dashboard to see the changes reflected

## 7. Troubleshooting

### "Insufficient permissions" when creating products

- Check that the admin user has the custom claims set
- Verify the RLS policies are applied
- Ensure the backend is using the service role key

### Email confirmation not working

- Verify SMTP settings in Supabase Auth
- Check email templates are configured
- Test with a real email (not example.com domains)

### User can't log in after email confirmation

- Ensure `email_confirmed_at` is set in Supabase
- Check the user's role is set correctly

