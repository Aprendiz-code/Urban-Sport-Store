# Urban Sport Store: inicio rápido

## Variables de entorno

Configura los valores del proyecto en los archivos locales ignorados por Git. No incluyas claves reales en la documentación.

Frontend (`.env.local`):

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=products
VITE_API_URL=http://localhost:4000/api
```

API (`api/.env.local`):

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=products
```

La clave de servicio solo pertenece al entorno servidor. Mantén ambas variables de bucket alineadas con `products`.

---

## 🏗️ Arquitectura de Seguridad

```
┌─────────────────┐
│   FRONTEND      │
│  (Vite + React) │
└────────┬────────┘
         │
         ├─ Supabase Anon Client (RLS enforcement)
         │  └─ Leer productos ✓
         │  └─ No puede escribir ✗
         │
         └─ Backend API (JWT auth)
            └─ POST /api/admin/products (require admin role)
               └─ Service role key
                  └─ Supabase (bypass RLS)

┌─────────────────┐
│    BACKEND      │
│ (Express + ORM) │
└────────┬────────┘
         │
         ├─ Service Role Client
         │  └─ Crear/editar/eliminar productos
         │
         ├─ JWT Verification
         │  └─ Validar token de Supabase
         │
         └─ PostgreSQL (Prisma)
            └─ Persistencia de datos

┌─────────────────┐
│   SUPABASE      │
│ (Auth + Storage)│
└─────────────────┘
```

---

## 📋 Flujo de Operaciones

> Runtime activo actual: `/api/*` y `/api/admin/*`.
> El directorio `api/src/*` existe en el repositorio como backend adicional/legacy, pero no es el runtime desplegado hoy.

### 1️⃣ Lectura de Productos (Público)
```
User → Frontend (anon client) → Supabase RLS → products table
✓ SELECT * WHERE status = 'ACTIVE'
```

### 2️⃣ Creación de Productos (Admin)
```
Admin User → Frontend (login) → JWT token
           → Backend API (POST /api/admin/products) → JWT verification
           → Service role client → Supabase RLS bypass
           → Insert into products table
✓ Product visible en storefront
```

### 3️⃣ Registro de Usuario
```
User → Frontend (form) → Supabase Auth (sign up)
     → Email confirmation sent
     → User clicks link
     → Email marked confirmed
     → Session created
     ✓ User can browse
     (requires admin role for mutations)
```

---

## 🔐 Seguridad Implementada

| Aspecto | Implementación | Status |
|--------|-----------------|--------|
| **Autenticación** | Supabase JWT + Custom claims | ✅ |
| **Autorización** | RLS + Role checking | ✅ |
| **Service Role** | Backend-only, no frontend | ✅ |
| **Email Confirmation** | Supabase Auth enabled | ✅ |
| **Admin Role** | Custom claim (role=ADMIN) | ✅ |
| **Rate Limiting** | Express rate limiter | ✅ |
| **Audit Logging** | Prisma auditLog table | ✅ |
| **CORS Protection** | Whitelist origins | ✅ |
| **Helmet Headers** | Security headers | ✅ |

---

## 🧪 Testing Local

### Frontend
```bash
npm run dev
# http://localhost:5173
```

### Backend
```bash
cd api
npm run dev
# http://localhost:4000
# API docs: http://localhost:4000/api/docs
```

### Test Admin Flow
1. Abrir app en http://localhost:5173
2. Clickear **Admin** (login local de demostración)
   - Email: `Urbansportstore@outlook.com`
   - Password: `bM4_tX!8wK2#vP7$qR`
3. Acceso a **Admin Panel** > **Productos**
4. Crear/editar/eliminar producto
5. Verificar cambios en Supabase Dashboard

---

## 📦 Despliegue

### Checklist Pre-Producción

- [ ] **Database**: PostgreSQL running (Railway/Supabase)
- [ ] **JWT_SECRET**: Cambiar a valor fuerte (openssl rand -base64 32)
- [ ] **Email Confirmation**: Habilitado en Supabase Auth
- [ ] **CORS_ORIGINS**: Actualizar a dominio real
- [ ] **SECURE_COOKIES**: true en producción
- [ ] **Admin User**: Crear y otorgar role ADMIN

### Deployment Targets

**Frontend**: Vercel / Netlify
```bash
npm run build
# auto-deploy from GitHub
```

**Backend**: Railway / Render
```bash
npm install
npm run db:migrate
npm start
```

---

## 📖 Documentación Completa

- [PRODUCTION.md](PRODUCTION.md) - Checklist de despliegue
- [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md) - Setup de roles
- [api/README_BACKEND.md](api/README_BACKEND.md) - API documentation
- [README.md](README.md) - Project overview

---

## 🎯 Próximas Mejoras (Roadmap)

- [ ] Code splitting (reducir bundle de 1MB)
- [ ] Image optimization (thumbnails)
- [ ] Checkout payment flow (Stripe)
- [ ] Email notifications (SendGrid)
- [ ] Analytics (Mixpanel/Amplitude)
- [ ] Admin dashboard (chart.js)
- [ ] Mobile app (React Native)

---

## 💬 Soporte

**GitHub**: https://github.com/Aprendiz-code/Urban-Sport-Store
**Issues**: Reportar en la página de issues

---

**Last Updated**: 2026-07-17  
**Status**: 🟢 Production Ready
