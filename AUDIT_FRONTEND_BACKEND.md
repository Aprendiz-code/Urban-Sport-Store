# Auditoría Frontend-Backend - Integración en Producción

**Fecha**: 2026-07-21
**Estado**: En Progreso - 85% completado
**Bloqueador**: DATABASE_URL no configurado en Vercel Production

---

## ✅ Validaciones Completadas

### 1. Endpoints Admin Verificados
- **Ruta**: `GET /api/v1/admin/supabase-products` ✅ Existe
- **Ruta**: `GET /api/v1/admin/audit` ✅ Existe (corregida - ahora usa import directo)
- **Autenticación**: Ambos requieren `requireAuth` + `requireRole('ADMIN')` ✅
- **Respuestas**: JSON estructurado con `{ ok: boolean, data: {...}, error?: {...} }` ✅

### 2. Estructura Vercel
- **Frontend**: Deployado en Vercel (proyecto: urban-sport-store)
- **Backend**: Deployado en Vercel (proyecto: api)
- **Alias**: https://api-sigma-ruby.vercel.app
- **Arquitectura**: Serverless functions (Node.js/Express)

### 3. Configuración vercel.json
```json
{
  "rewrites": [
    { "source": "/((?!api).*)", "destination": "/index.html" }
  ]
}
```
**Estado**: ✅ Correcto - Solo SPA fallback, sin redirecciones de /api/*

### 4. Error Handling - MEJORADO ✅
**Cambios realizados**:

#### Backend (`api/src/middlewares/error-handler.ts`):
- ✅ Detecta `PrismaClientInitializationError` → 503 "DATABASE_UNAVAILABLE"
- ✅ Detecta Prisma errors `P1001`, `P1002`, etc → 503 o 500 con contexto
- ✅ Valida Zod validation errors → 400 con detalles
- ✅ Maneja fetch errors de servicios externos → 503
- ✅ Logs mejorados con stack traces

#### Backend (`api/src/services/auth.service.ts`):
- ✅ Try-catch alrededor de Prisma queries en `exchangeSupabaseToken`
- ✅ Convierte Prisma errors a `HttpError` con mensajes claros
- ✅ P1001 (no connection) → 503 "DATABASE_UNAVAILABLE"
- ✅ P* errors → 500 "DATABASE_ERROR"

#### Backend (`api/src/controllers/auth.controller.ts`):
- ✅ Logging agregado al bridge controller
- ✅ Registro de token exchange exitoso/fallido
- ✅ Logs con userId y email para auditoría

#### Frontend (`src/lib/admin-api.ts`):
- ✅ Mejor parsing de errores JSON del backend
- ✅ Extrae `error.code` y `error.message` de respuestas
- ✅ Logs de debugging en `bridgeSupabaseToken`
- ✅ Mensajes de error estructurados: `[CODE] Message`

### 5. Routes y Endpoints
**Admin Routes** (`api/src/routes/admin.routes.ts`):
- ✅ 13 rutas admin correctamente definidas
- ✅ Todas con `requireAuth` y `requireRole('ADMIN')`
- ✅ Endpoint audit corregido: ahora importa función directamente (no require())

**Auth Routes** (`api/src/routes/auth.routes.ts`):
- ✅ Bridge endpoint correctamente definido
- ✅ Tiene rate limiter (`authLimiter`)
- ✅ Sin `requireAuth` (es primer punto de autenticación)

---

## 📊 Estado de Endpoints

| Endpoint | Ruta | Autenticación | Respuesta | Estado |
|----------|------|---------------|-----------|--------|
| Bridge | `POST /api/v1/auth/bridge` | Supabase Token | Backend JWT | ⏳ Bloqueado (DB) |
| Admin - Productos | `GET /api/v1/admin/supabase-products` | Backend JWT | Array<Product> | ⏳ Bloqueado (Auth) |
| Admin - Audit | `GET /api/v1/admin/audit` | Backend JWT | Array<AuditLog> | ⏳ Bloqueado (Auth) |

**Bloqueador**: Bridge devuelve 503 "DATABASE_UNAVAILABLE" porque DATABASE_URL no está en Vercel Production

---

## 🔧 Cambios de Código Realizados

### 1. `api/src/services/auth.service.ts`
```typescript
// ANTES: Prisma error causaba 500 "unhandled error"
const user = await prisma.user.findUnique(...)

// DESPUÉS: Prisma error se convierte a HttpError 503
try {
  const user = await prisma.user.findUnique(...)
  ...
} catch (err) {
  if (err?.code === 'P1001') {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', '...')
  }
}
```

### 2. `api/src/middlewares/error-handler.ts`
```typescript
// ANTES: Todos los errores → 500 "Unexpected server error"

// DESPUÉS: Errores específicos con mensajes útiles
if (error?.name === 'PrismaClientInitializationError') {
  res.status(503).json(errorResponse('DATABASE_UNAVAILABLE', '...'))
}
```

### 3. `api/src/routes/admin.routes.ts`
```typescript
// ANTES: router.get('/audit', ..., (req,res,next) => require(...).getAuditLogs(...))

// DESPUÉS: Import directo
import { ..., getAuditLogs } from '../controllers/admin.controller'
router.get('/audit', ..., getAuditLogs)
```

### 4. `src/lib/admin-api.ts`
```typescript
// ANTES: throw new Error(`${res.status} ${res.statusText}: ${text}`)

// DESPUÉS: Mejor parsing de errores
try {
  const json = JSON.parse(text)
  const errorMessage = json?.error?.message || '...'
  const errorCode = json?.error?.code || 'UNKNOWN_ERROR'
  throw new Error(`[${errorCode}] ${errorMessage}`)
} catch {
  throw new Error(`${res.status} ${res.statusText}: ${text}`)
}
```

---

## 🔴 Bloqueador Crítico

### El Problema
```
❌ DATABASE_URL no está configurado en Vercel Production Environment
   → Prisma no puede inicializar en serverless
   → Bridge endpoint devuelve 503 "DATABASE_UNAVAILABLE"
   → Admin endpoints no se pueden alcanzar
   → Frontend no puede cargar productos
```

### La Solución Requerida
1. **Agregar DATABASE_URL a Vercel Production**
   - URL: `postgresql://postgres:UrbanSportStore2024Production@vgfvjmpaftiufykejagk.pooler.supabase.co:6543/postgres?sslmode=require`
   - Nota: Usar **pooler** (puerto 6543) no conexión directa (puerto 5432)
   - Razón: Serverless requiere connection pooling
   
2. **Redeploy del backend**
   - Una vez agregada la variable, hacer: `npx vercel --prod`
   
3. **Prueba**
   - Bridge endpoint debería devolver 200 con backend JWT
   - Admin endpoints deberían devolver datos
   - Frontend debería cargar productos

---

## 📋 Próximas Acciones (En Orden)

### 1. ⚠️ CRÍTICO: Agregar DATABASE_URL a Vercel
```bash
cd api
# Método 1: Dashboard - https://vercel.com/.../settings/environment-variables
#   - Agregar variable: DATABASE_URL
#   - Valor: postgresql://postgres:...@pooler.supabase.co:6543/...
#   - Ambiente: Production

# Método 2: CLI (si es posible)
npx vercel env add DATABASE_URL --environment=production
```

### 2. Redeploy Backend
```bash
npx vercel --prod --yes
```

### 3. Prueba Bridge Endpoint
```bash
curl -X POST https://api-sigma-ruby.vercel.app/api/v1/auth/bridge \
  -H "Authorization: Bearer {SUPABASE_TOKEN}" \
  -H "Content-Type: application/json"
```
**Esperado**: Status 200, response con `data.token`

### 4. Prueba Admin Endpoints
```bash
curl https://api-sigma-ruby.vercel.app/api/v1/admin/supabase-products \
  -H "Authorization: Bearer {BACKEND_JWT}"
```
**Esperado**: Status 200, array de productos

### 5. Verificar Frontend
- Abrir https://urbansportstore.online
- Verificar que catálogo de home carga productos
- Ir a Admin panel
- Verificar que tab "Productos" carga lista

---

## 🎯 Validación de Integración Cuando DATABASE_URL Esté Configurado

```
Frontend Login                 ✅ Supabase Auth
    ↓
Supabase Access Token         ✅ Token válido
    ↓
Bridge Exchange               ⏳ Requiere DATABASE_URL (BLOQUEADO)
    ↓
Backend JWT                   ⏳ Espera DB
    ↓
Admin Endpoints Access        ⏳ Espera JWT
    ↓
Product Load / Management     ⏳ Espera endpoints
    ↓
Image Storage (Supabase)      ⏳ Espera éxito de productos
```

---

## 📝 Notas Técnicas

### Por qué Connection Pooler?
- **Vercel Serverless**: Cada invocación crea nueva conexión
- **Puerto 5432**: Conexión directa, lenta en serverless
- **Puerto 6543**: PgBouncer pooling, optimizado para serverless
- **Recomendación Supabase**: Usar pooler para Vercel/Lambda

### Error Codes Mejorados
- `503 SERVICE_UNAVAILABLE`: Database unavailable (conexión)
- `500 DATABASE_ERROR`: Database error (query error)
- `401 UNAUTHORIZED`: Falta token o inválido
- `403 FORBIDDEN`: Token válido pero sin permisos
- `400 BAD_REQUEST`: Validación de entrada falló

### URLs Configuradas
- **Frontend API Root**: `${import.meta.env.VITE_API_URL}/api/v1`
- **Producción**: `https://api-sigma-ruby.vercel.app/api/v1`
- **Local Dev**: `/api/v1` (relativa)
- **Fallback**: Frontend intenta Supabase directo si admin API falla

---

## ✨ Mejoras Implementadas

| Área | Antes | Después |
|------|-------|---------|
| Error Handling | 500 genérico | 503 específico con contexto |
| Logs | Mínimos | Con userId, email, stack traces |
| Admin Routes | require() dinámico | Import directo (mejor) |
| Frontend Errors | Texto plano | Código + Mensaje estruturado |
| Database Errors | No detectados | Detectados y manejados |

---

**Próxima revisión**: Una vez DATABASE_URL esté en Vercel
**Status**: Esperando configuración de DATABASE_URL en Vercel Production
