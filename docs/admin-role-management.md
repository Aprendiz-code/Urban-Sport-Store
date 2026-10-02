# Gestión de roles administrativos

## Fuente de verdad

La autorización administrativa se basa exclusivamente en `public.profiles.role` y `public.profiles.is_active`.

- La API valida el token Supabase Auth, obtiene el UUID autenticado y consulta el perfil desde el servidor.
- La matriz de permisos server-side asigna capacidades según `profiles.role`.
- RLS usa `private.is_admin()`, que comprueba el rol y que `is_active` sea `true`.
- `app_metadata`, `user_metadata`, email, formularios, URL, almacenamiento del navegador y banderas de interfaz no conceden permisos.
- La interfaz puede consultar el perfil para adaptar la presentación. Nunca sustituye la autorización de la API o RLS.

## Bootstrap

El trigger de `auth.users` crea el perfil con un rol no privilegiado compatible con el esquema y `is_active = true`. Solo puede usar `full_name` de metadata como dato de presentación; no toma de metadata roles, permisos ni estado activo.

## Promoción manual

Solo el dueño del proyecto debe promover usuarios desde Supabase SQL Editor. Primero debe verificar en **Authentication → Users** que el UUID pertenece a la persona correcta y contrastarlo de forma independiente. No se debe usar el correo como selector de autorización.

Para el esquema actual de texto, la promoción es:

```sql
UPDATE public.profiles
SET role = 'ADMIN', is_active = true
WHERE id = '<UUID-verificado-desde-Authentication-Users>';
```

Comprueba que la consulta afectó exactamente una fila. Si `role` es un enum, usa únicamente la etiqueta privilegiada exacta permitida por el esquema. La desactivación debe cambiar `is_active` a `false`.

El API actual no tiene endpoint de gestión de usuarios ni promoción. Cuando se implemente uno, deberá exigir permiso server-side de dueño y registrar el cambio en `audit_logs` desde el backend.

## Migración histórica bloqueada

`supabase/migrations/20260727000000_set_admin_raw_app_meta.sql` promueve por coincidencia de email en `raw_app_meta_data`. No la ejecutes. Se conserva en su ruta histórica hasta reconciliar la historia remota; la CLI puede incluirla si no figura como aplicada. No ejecutar `supabase db push` hasta resolver explícitamente ese estado.
