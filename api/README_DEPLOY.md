Despliegue del backend (api/) en Vercel

Pasos rápidos:

1. Añadir secrets al repositorio (Settings → Secrets):
   - `VERCEL_TOKEN` (token de Vercel con permisos de deploy)
   - `DATABASE_URL` (URL de Postgres en Supabase)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGINS`
   - `E2E_SECRET`

2. El workflow ya añadido (`.github/workflows/deploy-api-vercel.yml`) se ejecutará en `push` a `main` y hará:
   - Instalar dependencias en `api/` usando `pnpm`
   - Ejecutar `pnpm run db:deploy` (migrations) con `DATABASE_URL`
   - Ejecutar `pnpm run build`
   - Ejecutar `vercel --prod --cwd api` usando `VERCEL_TOKEN`

3. Opciones manuales:
   - Conectar manualmente proyecto en Vercel y configurar Root Directory = `api`.
   - En Vercel Project Settings configurar Build Command: `pnpm build` y Start Command: `pnpm start`.

Notas:
- Asegúrate de que `CORS_ORIGINS` incluya el dominio del frontend.
- Si las migraciones requieren mayor control, ejecuta `pnpm run db:deploy` manualmente desde un runner con el secret `DATABASE_URL`.
