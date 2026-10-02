# Runbook de rotación de secretos

**Estado:** rotación manual pendiente. No incluir valores en tickets, capturas, shell history, logs ni commits. No se ejecutó Vercel CLI ni se borró ningún archivo `.env`.

## 1. Supabase

1. En Supabase Dashboard, identifica qué formato de claves usa el proyecto: claves legacy anon/service-role, claves modernas publishable/secret, o una combinación durante transición. No copies valores a este documento.
2. Rota/crea una nueva clave secreta de backend con el mecanismo de claves vigente del proyecto. La clave secreta debe existir solo en backend/Vercel/CI; nunca en frontend.
3. Actualiza la URL del proyecto y la clave pública solo en los entornos cliente/backend que correspondan. La clave pública/publishable puede estar en `VITE_*`; ninguna clave secreta puede tener prefijo `VITE_`.
4. Actualiza `SUPABASE_SERVICE_ROLE_KEY` o la clave secreta moderna solo en variables protegidas de backend/Vercel/CI. No uses `VITE_*` para esos valores.
5. Confirma que `SUPABASE_URL`, clave pública y clave secreta pertenecen al mismo Project Ref y ambiente. No publiques ni pegues el Project Ref junto a credenciales.
6. Despliega backend y frontend según su separación, sin imprimir variables desde logs de build/deploy.
7. Comprueba health checks y funciones actuales del backend con pruebas seguras. Inspecciona logs de Auth, API y Database por errores de autenticación/conexión; no exportes payloads sensibles.
8. Después de validar el nuevo runtime, revoca las credenciales antiguas según el tipo de clave y el procedimiento de Supabase.
9. Si se rota un JWT signing secret o una clave legacy que lo implique, planifica invalidación de sesiones/tokens, reautenticación de usuarios y redeploy coordinado.
10. Si se expuso la contraseña de una cuenta seed, cambia la contraseña, revisa sesiones y confirma en Auth qué cuentas seed existen. Deshabilitar/eliminar cuentas solo después de que el dueño confirme que no se usan.
11. No confundas rotar la clave pública con rotar un secreto: la publicable/anon es destinada al cliente, pero debe revisarse su uso y configuración RLS.

Verificación local que solo muestra nombres de archivo coincidentes, no líneas ni valores:

```powershell
rg -l --hidden -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.env*' '(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|VERCEL_OIDC_TOKEN|SEED_ADMIN_PASSWORD)' src dist api scripts docs
```

Revisa los archivos devueltos manualmente sin copiar valores. `dist/` debe revisarse para descartar bundles con claves secretas, no para capturar su contenido en un reporte.

## 2. Vercel

1. En el dashboard de Vercel, revisa Environment Variables por separado para Development, Preview y Production.
2. Actualiza URL del proyecto, clave pública donde corresponda y clave secreta solo en variables server-side protegidas.
3. No ejecutes el script de sincronización como sustituto de esta revisión manual. Aunque ya se saneó y exige confirmación de producción, no forma parte de este runbook de rotación.
4. No descargues variables a archivos que vayan a compartirse o versionarse; no uses logs para comprobar valores.
5. Haz redeploy de los entornos afectados después de actualizar las variables y valida el backend sin mostrar configuración.
6. Revoca un token OIDC/Vercel solo si se confirma que está expuesto o que ya no se usa; coordina la revocación con deployments activos.

## 3. Git e historial

1. Confirma si los valores siguen accesibles en commits anteriores usando herramientas que solo informen nombres de archivo. No uses opciones que muestren líneas coincidentes, diffs, hashes o valores.
2. Recuerda que `.gitignore` y reemplazar un archivo en el árbol de trabajo no eliminan commits previos ni revocan credenciales.
3. Primero rota/revoca las credenciales. Solo después evalúa sanear el historial.
4. No ejecutar BFG, `git-filter-repo`, force-push ni reescritura de historial durante esta fase.
5. Preparar una operación posterior con ventana aprobada, backup del repositorio, lista de colaboradores/clones, plan de coordinación, validación de refs/branches/tags y procedimiento de clonación nueva.
6. Coordinar con todos los colaboradores antes de reescribir; sus clones y forks conservarán los commits antiguos hasta reemplazarse.
7. Después del saneamiento, repetir un barrido que reporte únicamente rutas y coordinar una segunda rotación si hubiera dudas sobre exposición.

## Checklist de cierre

- [ ] Claves antiguas rotadas/revocadas después de validar reemplazos.
- [ ] Clave secreta nueva almacenada solo en backend/Vercel/CI.
- [ ] Frontend usa solo claves publicables y no contiene claves secretas.
- [ ] Vercel Development, Preview y Production revisados por separado.
- [ ] Backend redeployado y comprobado sin imprimir variables.
- [ ] Password seed cambiada o cuenta confirmada como inexistente/no usada.
- [ ] Logs revisados sin exportar credenciales.
- [ ] Historial Git pendiente de saneamiento coordinado; no se ha reescrito.
