# Respuesta a incidentes de secretos

## Estado conocido

Se encontraron credenciales literales en `scripts/add_vercel_envs.ps1`; el archivo de trabajo se saneó sin borrar el archivo. La inspección de historial confirmó asignaciones sensibles en varias revisiones del script. No se verificó la vigencia de ninguna credencial. Los archivos `.vercel-backend-prod*.env` aparecen en la historia local; no se debe asumir que retirar un archivo del árbol de trabajo revoca sus valores.

No se incluyen valores, fragmentos, hashes de tokens ni comandos que puedan imprimir secretos.

## Tipos potencialmente expuestos

- Clave `SUPABASE_SERVICE_ROLE_KEY` o clave secreta equivalente.
- Contraseña de la cuenta seed y datos de configuración de esa cuenta.
- `DATABASE_URL` con credenciales embebidas.
- Secretos JWT u otras claves de firma, si siguen vigentes.
- `VERCEL_OIDC_TOKEN` mencionado en la inspección previa de archivos de entorno; su vigencia no se verificó.
- Otros tokens de Vercel, CI o E2E encontrados en archivos históricos o locales.

## Acciones obligatorias antes de desplegar

1. Rotar la clave service-role/secret desde Supabase Dashboard y actualizarla en los entornos protegidos de backend, Vercel y CI.
2. Rotar las credenciales de base de datos y los secretos JWT u otras claves de firma que resulten vigentes.
3. Rotar o revocar tokens Vercel/OIDC/CI que sigan activos.
4. Cambiar la contraseña seed si la cuenta existe; revisar sus sesiones y estado de Auth.
5. Redeplegar el backend con los valores nuevos y validar su funcionamiento mediante health checks y pruebas que no revelen variables.
6. Revocar las credenciales anteriores después de confirmar la nueva configuración.
7. Buscar referencias restantes en archivos y commits con herramientas que solo muestren nombres de archivo y números de línea, nunca los valores coincidentes.
8. Planificar después una limpieza controlada de Git history. No reescribir el historial durante esta fase; coordinar la operación con colaboradores y clones existentes.

La nueva versión de `scripts/add_vercel_envs.ps1` lee los valores necesarios exclusivamente del entorno del proceso, no gestiona contraseñas seed y requiere confirmación explícita para producción. No se ha ejecutado.
