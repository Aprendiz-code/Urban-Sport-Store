# Seguridad de Supabase y credenciales

## Secretos y variables de entorno

El script versionado `scripts/add_vercel_envs.ps1` contenía credenciales literales y se reemplazó por una versión que lee el entorno local. Se encontraron asignaciones sensibles en varias revisiones históricas del script; quitar o sanear un archivo del árbol de trabajo no revoca credenciales ni limpia commits anteriores.

La inspección previa también registró un token con formato JWT en `VERCEL_OIDC_TOKEN`; no se verificó su vigencia. Trata como potencialmente comprometidos la clave service-role/secret, contraseña seed, credenciales de `DATABASE_URL`, secretos JWT y tokens OIDC/Vercel/CI que aparezcan en archivos o historial. Sigue [docs/incident-response-secrets.md](incident-response-secrets.md); no se incluyen valores.

## Recomendaciones obligatorias

La rotación de credenciales y la limpieza controlada del historial son requisitos previos al despliegue. No reescribas el historial en esta fase.

## RLS y perfiles

Las migraciones `20261002170000_security_profiles_audit.sql` y `20261002170400_unify_profile_authorization.sql` definen políticas para:

- `profiles`: lectura propia/admin; actualización propia limitada por grants a columnas personales.
- `audit_logs`: solo administradores pueden consultar y no se permite escritura desde cliente.
- `private.is_admin()`: función segura basada en `auth.uid()`, `public.profiles.role` y `is_active`.

Las migraciones `20261002170100_ecommerce_core.sql` y `20261002170200_ecommerce_rls.sql` preparan tablas de comercio aún no habilitadas en producto. No se ejecutaron ni se deben ejecutar remotamente como parte de esta tarea.

El endpoint `POST /api/newsletter` conserva validación y control de duplicados, pero inserta usando la clave service role del servidor. La migración revoca inserciones directas desde `anon` y `authenticated`; la clave service role debe existir solo en el entorno de servidor.

Las cargas y eliminaciones de imágenes desde navegador están desactivadas en el código local. El adaptador filesystem solo está probado en directorios temporales, no está conectado y no debe usarse en Vercel serverless. Supabase Storage permanece sin provider configurado; no se verificaron las policies remotas.

## Bloqueos previos a cualquier migración remota

La migración histórica `20260727000000_set_admin_raw_app_meta.sql` promueve por email y no debe ejecutarse. Se conserva hasta reconciliar el historial remoto; la CLI puede incluirla si no figura como aplicada. No uses `supabase db push` ni ejecutes SQL remoto hasta resolver ese estado, rotar credenciales y revisar los archivos de incident response y gestión de roles.

Después validar que RLS quedó habilitado:

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
	AND c.relname IN (
		'profiles', 'audit_logs', 'addresses', 'product_variants', 'carts',
		'cart_items', 'orders', 'order_items', 'payments', 'inventory_movements',
		'coupons', 'coupon_redemptions'
	)
ORDER BY c.relname;
```

Y revisar las políticas efectivas:

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
	AND tablename IN ('profiles', 'audit_logs', 'orders', 'payments', 'addresses')
ORDER BY tablename, policyname;
```

Validar además con sesiones anon, usuario normal y admin; comprobar que un cliente no puede insertar pedidos, modificar pagos/stock, leer perfiles ajenos ni insertar auditoría/newsletter directamente. No usar la service role key desde el navegador.

La política de perfil concede actualización solo de campos personales existentes (`first_name`, `last_name`, `full_name` y/o `phone`). No concede al cliente actualización de `id`, `role`, `is_active` ni otros campos administrativos. Para promover al primer administrador, sigue [docs/admin-role-management.md](admin-role-management.md).

## Password protection

Debe habilitarse manualmente en:

Supabase Dashboard → Authentication → Password Security → Protect against leaked passwords.

No se puede confirmar desde este repositorio si la configuración quedó activada porque requiere acceso al dashboard del proyecto.
