# 🚀 Urban Sport Store - Quick Start

## ✅ Configuración activa

### Frontend (`.env.local`)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STORAGE_BUCKET=product-images
VITE_API_URL=http://localhost:3000/api
```

### Backend (`api/.env.local`)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

---

## 🏗️ Arquitectura actual

```text
Frontend (Vite + React) → Supabase Auth/Storage
                         ↘
                          Vercel Functions /api + /api/admin
                         ↘
                          Supabase Postgres + RLS
```

### Runtime actual
- El frontend corre en Vite/React.
- Los endpoints públicos y admin viven en Vercel Functions bajo `/api/*` y `/api/admin/*`.
- El acceso admin se valida contra Supabase y los claims del usuario autenticado.
- Los artefactos legacy de Express/Prisma quedan como referencia, no como runtime activo.

---

## 📋 Flujo de operaciones

### 1️⃣ Lectura de productos (público)
```text
Usuario → Frontend → Supabase RLS → products
```

### 2️⃣ Gestión de productos (admin)
```text
Admin → Frontend → /api/admin/products o /api/admin/categories → Supabase
```

### 3️⃣ Upload de imágenes
```text
Admin → Frontend → Supabase Storage → public URL
```

---

## 🧪 Validación local

### Frontend
```bash
npm run dev
# http://localhost:5173
```

### API serverless
- El runtime activo se sirve desde Vercel Functions; el endpoint base esperado es `/api`.
- Para pruebas locales, usa la variable `VITE_API_URL` apuntando a tu entorno local o de preview.

---

## 📦 Despliegue

- [ ] Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel
- [ ] Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en el runtime de Vercel
- [ ] Confirmar que los endpoints `/api/*` y `/api/admin/*` responden correctamente en producción

---

## 📖 Documentación relevante

- [README.md](README.md)
- [README_ADMIN.md](README_ADMIN.md)
- [PRODUCTION.md](PRODUCTION.md)
- [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md)

---

**Last Updated**: 2026-07-25
**Status**: 🟢 Runtime aligned with current Vercel + Supabase setup
