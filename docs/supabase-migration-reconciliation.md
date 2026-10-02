# Reconciliación segura de migraciones Supabase

**Estado actual: NO-GO.**
**Reconciliation status: BLOCKED**

Esta guía prepara una revisión futura. No se ejecutaron consultas remotas ni comandos de enlace. No ejecutes `supabase db push` mientras el estado de la migración histórica insegura y la historia remota no estén reconciliados.

Revisa primero el [inventario local](supabase-migration-inventory.md). La CLI descubre todos los archivos `.sql` de `supabase/migrations/`; el nombre de un documento o comentario no excluye un archivo del despliegue.

## A. Antes de enlazar la CLI

No continúes hasta confirmar todos estos puntos:

- Buscar en archivos versionados e historial referencias a secretos con herramientas que solo muestren nombres de archivo; no imprimir coincidencias.
- Rotar las claves potencialmente expuestas y validar que las anteriores ya no sirven.
- Confirmar que los valores nuevos están solo en variables de entorno protegidas del backend/CI o en el gestor de secretos del hosting.
- Confirmar que no hay claves secretas con prefijo `VITE_` ni en `src/`, `dist/`, documentación pública o bundles.
- Crear y verificar un backup/snapshot restaurable antes de cualquier cambio de esquema.
- Confirmar el proyecto objetivo comparando el Project Ref de forma privada, sin pegarlo en tickets, logs o salida compartida.
- Confirmar el ambiente y branch: desarrollo, staging o producción. Empezar por staging aislado.
- Mantener este estado hasta que la migración insegura tenga una decisión demostrable y documentada.

## B. Diagnóstico del historial

La ayuda local consultada confirma que `supabase migration list` admite `--linked` y `--local`. Los ejemplos siguientes son para el dueño/operador cuando esté listo; **no se ejecutaron aquí**.

Autenticación interactiva manual, solo en una terminal local confiable:

```text
supabase login
```

Después de confirmar el proyecto de forma privada, el enlace modifica la configuración local del proyecto, no el esquema remoto:

```text
supabase link --project-ref <PROJECT_REF> --workdir supabase
```

Consulta de solo lectura del historial enlazado:

```text
supabase migration list --linked --workdir supabase
```

Consulta del historial local, solo si la base local ya está disponible:

```text
supabase migration list --local --workdir supabase
```

`--linked` consulta el proyecto enlazado y requiere conectividad/autenticación. No uses contraseñas en argumentos, scripts, historial del shell o logs. No ejecutes `supabase db push`, `migration repair`, reset, pull ni comandos de aplicación durante el diagnóstico.

### Descubrir la tabla de historial SQL

No asumas que la tabla interna existe ni que conserva una forma determinada. En SQL Editor, primero inspecciona los nombres de tabla:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'supabase_migrations'
ORDER BY table_name;
```

Solo si la tabla aparece, inspecciona sus columnas reales:

```sql
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
ORDER BY table_name, ordinal_position;
```

Adapta una consulta de lectura a los nombres de columna observados. En instalaciones donde se confirme `supabase_migrations.schema_migrations` y una columna `version`, un ejemplo sería:

```sql
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Si se confirma también una columna `name`, puede incluirse. Si no existe tabla o las columnas no corresponden, detente; no crees ni alteres tablas de historial para forzar una conclusión.

## C. Comparación local vs. remoto

- **Archivo local sin versión remota:** es candidato pendiente, no autorización para aplicarlo. Revisa dependencias, SQL, datos y si el archivo es seguro.
- **Versión remota sin archivo local:** es drift. Recupera el artefacto exacto desde backups/control de releases o documenta la definición real; no inventes una migración equivalente ni ejecutes un baseline encima.
- **Mismo timestamp con contenido distinto:** el historial por versión no demuestra que el SQL local sea el que se aplicó. Detente y compara el release/aprobación original con el esquema remoto inspeccionado. No sobrescribas el archivo histórico.
- **SQL inseguro presente en `supabase/migrations/`:** CLI puede descubrirlo aunque la documentación diga “no ejecutar”. El preflight local debe bloquear y el archivo debe permanecer intacto hasta confirmar el historial.
- **Migración insegura ya aplicada:** no vuelvas a ejecutarla ni la borres del historial. Verifica sus efectos actuales y prepara, en un cambio separado, neutralización/reversión segura y auditada.
- **Migración insegura nunca aplicada:** no la ejecutes. Tras confirmarlo y aprobar el cambio, exclúyela de la carpeta que CLI descubre, conservando copia de archivo y documentación de archivo; actualiza el preflight solo con una revisión explícita. No hacerlo antes de conocer el estado remoto.
- Los nombres de migración y el contenido SQL local no sustituyen la inspección de `pg_policies`, grants, columnas, funciones, triggers y datos actuales.

Mover o eliminar `20260727000000_set_admin_raw_app_meta.sql` sin saber si ya fue aplicada puede crear una versión remota ausente localmente y romper la reconciliación. Si ya fue aplicada, eliminarla no revierte sus efectos; si nunca se aplicó pero el archivo se queda en la carpeta, CLI puede intentar ejecutarla. Por eso permanece sin cambios y bloqueada hasta tomar la decisión informada.

## D. Decisión por escenarios

| Escenario remoto | Acción correcta | Acción prohibida | Riesgo |
|---|---|---|---|
| La migración insegura nunca fue aplicada | Mantenerla sin cambios hasta aprobar su archivo/ubicación; después excluirla de la carpeta CLI y probar el inventario/preflight. | Ejecutarla para “alinear” versiones o dejarla en la carpeta y hacer push. | Elevación administrativa por selección de email. |
| La migración insegura aparece como aplicada | Conservar su identidad histórica; verificar los perfiles/claims afectados y planificar neutralización aprobada, sin reejecutarla. | Borrar el archivo/historial o asumir que eliminarlo revierte cambios. | Drift y privilegios residuales. |
| No hay tabla/historial verificable | Detenerse y reconstruir desde backup, release records y catálogo SQL de solo lectura. | Crear historial a mano o ejecutar todos los SQL por orden de nombre. | Aplicación repetida o esquema incoherente. |
| Las migraciones 170000–170400 no aparecen aplicadas | Confirmar esquema, políticas, grants, tipos y backup; aplicar solo el hardening aprobado, por etapas. Mantener e-commerce pendiente. | Ejecutar las cinco juntas o ejecutar `db push`. | Policies y esquema incompatibles o activación accidental de comercio. |
| Algunas 170000–170400 aparecen aplicadas y otras no | Comparar cada efecto real y versión; continuar solo con pasos faltantes y dependencias verificadas. | Reaplicar todo el grupo o marcar todo aplicado por conveniencia. | Duplicación, efectos parciales o falsa historia. |
| Definiciones remotas difieren de archivos locales | Detenerse, documentar el delta y construir una migración correctiva nueva, revisada con backup. | Editar una migración histórica para que “coincida”. | Pérdida de datos y divergencia permanente. |
| El remoto conserva policies basadas en `app_metadata`/`user_metadata` | Inventariar policies efectivas; diseñar y probar su sustitución por perfiles activos antes de quitar la ruta previa. | Confiar en documentación o borrar policies sin comprobar accesos sustitutos. | Bypass de autorización o bloqueo del runtime. |
| Hay perfiles con roles privilegiados inesperados | Detener cambios, verificar identidad/UUID con el dueño y revisar auditoría; decidir manualmente la remediación. | Actualizar o desactivar perfiles en lote por email. | Bloqueo del dueño legítimo o privilegio no autorizado. |

## E. Proceso seguro de aplicación

1. Empezar en staging restaurable, con backup probado, secretos rotados e inventario remoto aprobado.
2. Revisar el SQL exacto de una migración por vez contra las tablas, tipos, triggers, grants y policies reales. No utilizar `db push`.
3. Aplicar únicamente hardening de perfiles en el orden operativo aprobado: `20261002170000`, `20261002170300`, `20261002170400`. Comprobar cada efecto antes de continuar.
4. Después de cada paso, registrar fecha, ambiente, versión, operador, resultado y error sanitizado. Detenerse ante el primer error; no continuar una transacción manual a ciegas.
5. Verificar los permisos de columnas de `profiles`, policies, función `private.is_admin()`, trigger de registro y policies Storage. Validar con usuario anónimo, cuenta normal, admin activo, admin inactivo y perfil ausente.
6. Entre pasos, comprobar login, lectura de catálogo, newsletter y operaciones administrativas existentes. No habilitar checkout, pedidos, pagos o inventario.
7. Aplicar `20261002170100` y después `20261002170200` solo en una etapa futura aprobada para comercio; revisar impacto y probar cada migración separada. No activar endpoints o flujos por el hecho de crear tablas.
8. SQL Editor ejecuta SQL pero no debe suponerse que registra la versión en la historia que consulta CLI. Antes de volver a usar CLI, reconciliar explícitamente cada versión ejecutada por el procedimiento soportado y verificado para ese proyecto.
9. Repetir `supabase migration list --linked --workdir supabase` solo después de cada operación aprobada, como lectura del ledger. No dar por finalizada la reconciliación mientras haya versiones inesperadas, archivos duplicados o SQL inseguro descubrible.
