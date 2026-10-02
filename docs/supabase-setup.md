# Supabase setup para UrbanSport Store

## 1. Crear el proyecto Supabase

1. Entra a https://supabase.com.
2. Crea un nuevo proyecto.
3. Selecciona la región apropiada.
4. Guarda el `Project URL` y las claves del proyecto.

## 2. Obtener la configuración

Desde el panel de Supabase:

- `Project URL`: Project settings > API > Project URL
- `anon/public key`: Project settings > API > anon/public key
- `service_role key`: Project settings > API > service_role key

Importante:
- La anon key puede usarse en cliente.
- La service role key solo debe usarse en backend/servidor.
- Nunca la pongas en frontend ni en `git`.

## 3. Variables de entorno

En la raíz del proyecto, copia `.env.example` a `.env.local` y completa los valores reales:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_SUPABASE_STORAGE_BUCKET=products
VITE_API_URL=/api
VITE_TERMS_URL=
VITE_PRIVACY_POLICY_URL=

# Solo servidor: necesario para las funciones API de Vercel
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<secret-key>
```

Las variables `SUPABASE_*` no llevan prefijo `VITE_`: son para las funciones API y nunca deben exponerse en el navegador. Define las variables de servidor también en los entornos Preview y Production de Vercel. Para desarrollo local, `vercel dev` carga las funciones `/api/*`; Vite por sí solo no ejecuta esos handlers.

## 4. URLs permitidas de autenticación

En Supabase > Authentication > URL Configuration:

- Add site URL: `http://localhost:5173`
- Add redirect URLs:
  - `http://localhost:5173/**`
  - `https://www.urbansportstore.online/**`
  - `https://urbansportstore.online/**`

Si el proyecto usa una URL alternativa, añádela también.

## 5. Esquema y migraciones

El proyecto remoto Urban Sport Store ya contiene datos y tiene migraciones históricas aplicadas. No ejecutes `SUPABASE_INIT.sql`, `0001_initial_urbansport_store.sql` ni todas las migraciones de la carpeta encima de esta base.

El hardening actual se encuentra en `supabase/migrations/20261002160428_secure_current_runtime_access.sql` y ya fue aplicado al proyecto remoto. Antes de usar `supabase db push`, autentica la CLI y reconcilia el historial local con el remoto: hay una migración histórica `remote_schema` sin archivo local y existen SQL duplicados/legacy.

## 6. Verificar RLS

RLS está habilitado en `categories`, `products`, `home_content`, `newsletter_subscribers`, `audit_logs` y `profiles`. El público puede leer el catálogo activo y la portada, y solo insertar suscripciones activas al newsletter. Auditoría y perfiles no tienen grants públicos ni políticas de acceso para usuarios finales; las escrituras del catálogo pasan por la API protegida con `service_role`.

## 7. Crear el primer administrador

Tras crear el usuario en Supabase Auth, asigna el rol en **App Metadata** (no en User Metadata, que es editable por el propio usuario). La API reconoce `OWNER`, `ADMIN`, `CATALOG_MANAGER`, `LOGISTICS` y `ACCOUNTANT`; para administrar catálogo puede usarse:

```json
{"role":"ADMIN"}
```

Después de cambiar `app_metadata`, cierra y vuelve a iniciar sesión para obtener un JWT actualizado.

## 8. Probar registro, login y admin

1. Registra un usuario nuevo desde la interfaz.
2. Inicia sesión con correo y contraseña.
3. Verifica que se crea el perfil
automatizado con perfil `customer`.
4. Prueba acceso a `/admin` con la cuenta administrative.
5. Confirma que los permisos se validan en servidor.

## 9. Imágenes de producto

El frontend usa el bucket público `products` para URLs de lectura y requiere una sesión Supabase real de un usuario con rol administrativo en `app_metadata` para cargar o borrar archivos. El bucket existente y sus archivos se conservaron. El login demo local no crea un JWT de Supabase y no autoriza esas operaciones.

## 10. Límites actuales

La API actual es serverless en Vercel y ofrece operaciones de catálogo, categorías, portada y auditoría. Pedidos, pagos, promociones, usuarios y movimientos de inventario todavía no tienen handlers implementados.
