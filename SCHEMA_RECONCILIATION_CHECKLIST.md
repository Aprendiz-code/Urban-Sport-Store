# Checklist de reconciliación del esquema objetivo

**Alcance:** verificación de solo lectura. Recopilar metadatos de esquema, historial de migraciones y conteos agregados. No consultar filas individuales, modificar datos ni aplicar cambios.

Para cada verificación, completar la tabla con uno de los estados permitidos y adjuntar evidencia que respete las reglas de privacidad.

## Estados permitidos

- Confirmado: existe evidencia directa del esquema objetivo.
- No existe: se verificó que el objeto no está presente.
- Drift: el esquema objetivo difiere de las migraciones o del modelo local.
- No verificable: no existe acceso o evidencia suficiente.

## Reglas de privacidad

Solo deben aparecer:
- nombres de tablas;
- columnas;
- tipos;
- nullability;
- defaults;
- constraints;
- índices;
- políticas RLS;
- grants;
- funciones y firmas;
- nombres/versiones de migraciones;
- conteos y sumas agregadas.

No deben aparecer:
- usuarios;
- emails;
- tokens;
- secretos;
- IDs;
- SKU;
- tallas o colores individuales;
- filas completas;
- contenido de pedidos o clientes.

## Estado de la Fase 2

“No es seguro preparar la Fase 2”.

No cambies ese estado hasta que todas las verificaciones críticas tengan evidencia aprobada.

## Procedimiento

- Consultar únicamente metadatos de catálogo, historial de migraciones y agregados de lectura.
- No recuperar ni exportar filas de negocio para respaldar este checklist.
- Para tallas y colores, informar solo existencia y conteos; no enumerar valores.
- Para productos y variantes, informar sumas totales y conteos de discrepancias; no detallar por producto.
- Marcar como No verificable cualquier elemento cuyo resultado requiera datos no disponibles o acceso no autorizado.
- No interpretar una migración local como prueba de que fue aplicada al esquema objetivo.
- Comparar el historial del objetivo con los nombres/versiones de `supabase/migrations` local y reportar diferencias sin ejecutar migraciones.

## Checklist de verificación

| Verificación | Resultado | Evidencia | Riesgo | Acción |
|---|---|---|---|---|
| `products`: existencia, columnas, tipos, nullability y defaults |  |  |  |  |
| `products`: constraints e índices |  |  |  |  |
| `products.stock`: existencia real, tipo, nullability y default |  |  |  |  |
| `product_variants`: existencia, columnas, tipos y nullability |  |  |  |  |
| `product_variants.stock` e `is_active`: tipo, default y constraints |  |  |  |  |
| FK `product_variants.product_id` hacia `products` |  |  |  |  |
| Unicidad de `product_variants.id` y de `(id, product_id)` |  |  |  |  |
| Índices de `product_variants` |  |  |  |  |
| Conteo total de variantes, sin listar filas ni IDs |  |  |  |  |
| `inventory_movements`: existencia y columnas/tipos |  |  |  |  |
| Tipos permitidos por constraints de movimientos |  |  |  |  |
| FK y nullability de `variant_id` y `created_by` |  |  |  |  |
| Checks, FKs e índices de `inventory_movements` |  |  |  |  |
| Conteo total de movimientos, sin mostrar registros |  |  |  |  |
| `profiles.role`: tipo real, enum/check y valores permitidos |  |  |  |  |
| `profiles.is_active`: existencia, tipo y default |  |  |  |  |
| `private.is_admin()`: existencia, firma, seguridad y grants |  |  |  |  |
| Otras funciones/vistas de permisos: nombres, firmas y grants |  |  |  |  |
| RLS habilitado por tabla pertinente |  |  |  |  |
| Políticas: tabla, nombre, comando, roles, `USING` y `WITH CHECK` |  |  |  |  |
| Grants de `anon`, `authenticated` y `service_role` por tabla |  |  |  |  |
| Grants de ejecución de funciones por `anon`, `authenticated` y `service_role` |  |  |  |  |
| Migraciones aplicadas y pendientes, solo nombres/versiones |  |  |  |  |
| Migraciones ejecutadas manualmente fuera del historial |  |  |  |  |
| Diferencias entre historial objetivo y `supabase/migrations` local |  |  |  |  |
| Total agregado de `products.stock`, si existe |  |  |  |  |
| Suma agregada de `product_variants.stock` |  |  |  |  |
| Conteo de productos sin variantes |  |  |  |  |
| Conteo de productos con tallas/colores declarados y sin variantes |  |  |  |  |
| Conteo de discrepancias entre stock agregado y suma de variantes |  |  |  |  |

## Interpretación de escenarios

Registrar solo el estado y los conteos agregados para estos casos:

- `products` existe sin `stock`.
- `products` existe con `stock`.
- `product_variants` existe sin filas.
- `product_variants` contiene filas.
- `inventory_movements` contiene filas.
- El historial aplicado presenta un orden distinto al esperado localmente.
- Hay indicios de cambios manuales fuera de las migraciones versionadas.

No inferir cantidades por talla/color, no sobrescribir stocks y no eliminar movimientos históricos. Cualquier discrepancia debe quedar como Drift y requerir revisión manual.

## Entrega de resultados

- Completar todas las filas pertinentes de la tabla.
- Adjuntar evidencia de metadatos y consultas agregadas, sin incluir resultados de filas individuales.
- Enumerar nombres/versiones de migraciones aplicadas, pendientes y reportadas como manuales.
- Señalar explícitamente qué verificaciones siguen No verificable.
- Mantener el Estado de la Fase 2 como “No es seguro preparar la Fase 2” mientras falte evidencia aprobada para cualquier verificación crítica.
