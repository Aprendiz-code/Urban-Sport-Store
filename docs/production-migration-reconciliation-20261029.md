# Reconciliación de migración Production: 2026-10-29

## Cambio aplicado manualmente

El 2026-10-29, el responsable aplicó en Supabase Dashboard > SQL Editor esta sentencia en Production:

```sql
REVOKE INSERT ON TABLE public.orders FROM anon, authenticated;
```

La respuesta del editor fue `Success. No rows returned`. La verificación por catálogo del mismo día confirmó que `anon` y `authenticated` ya no tienen INSERT efectivo en `public.orders`, `authenticated` conserva SELECT, `service_role` conserva SELECT e INSERT y las policies de `orders` no cambiaron. Las RPC Wompi consultadas conservan EXECUTE solo para `service_role`.

## Default privileges pendientes

Los intentos de `ALTER DEFAULT PRIVILEGES` para `postgres` y `supabase_admin` no se aplicaron: SQL Editor devolvió `ERROR: 42501: permission denied to change default privileges`. No inferir que los permisos de futuras tablas se hayan revocado; siguen pendientes de una decisión y autorización separadas.

## Ledger y despliegues

Comparación de `version`/`name` del ledger Production con filenames de `supabase/migrations/` local:

| Estado | Versión | Nombre | Decisión / riesgo |
|---|---|---|---|
| SOLO REMOTA | `20261016015418` | `add_product_catalog_section` | Pendiente de reconciliación; puede bloquear un futuro `db push`; requiere decisión manual. |
| SOLO REMOTA | `20261021000300` | `production_requote_rpcs` | Pendiente de reconciliación; puede bloquear un futuro `db push`; requiere decisión manual. |
| SOLO REMOTA | `20261021221516` | `production_wompi_payment_link_sessions` | Pendiente de reconciliación; puede bloquear un futuro `db push`; requiere decisión manual. |
| SOLO REMOTA | `20261022203249` | `make_product_shipping_metadata_optional` | Pendiente de reconciliación; puede bloquear un futuro `db push`; requiere decisión manual. |
| SOLO REMOTA | `20261025233415` | `production_create_pending_order` | Pendiente de reconciliación; puede bloquear un futuro `db push`; requiere decisión manual. |
| SOLO LOCAL | `20261029020225` | `revoke_client_orders_insert` | Aplicada manualmente; su archivo local coincide con la sentencia ejecutada. Sin reconciliar el ledger, puede reaplicarse en un futuro `db push`. |

Las demás versiones leídas están presentes en ambos con el mismo nombre. No se usará `supabase db push` ni `supabase migration repair` hasta decidir y documentar una estrategia completa para reconciliar el ledger y los archivos ausentes. No insertar manualmente en el ledger ni recuperar SQL remoto como parte de esta decisión.

La configuración local revisada del deploy no ejecuta migraciones: el intento `npm run db:deploy` del workflow no está definido en `api/package.json` y se ignora su error; `vercel.json` no define un hook de migraciones. La configuración oculta del proyecto Vercel sigue **NO VERIFICADA**.

## Payment status

La lectura GET de pedidos fue corregida localmente para serializar `orders.payment_status`, con fallback seguro a `pending`. Está cubierta por pruebas unitarias mockeadas, pero no se ha desplegado.