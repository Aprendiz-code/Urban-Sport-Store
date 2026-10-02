# Operación de UrbanSport Store

## Estado actual

Este repositorio conserva el catálogo público, newsletter, home content y CRUD administrativo existentes. El endpoint `POST /api/orders` valida sesión y perfil activo, pero responde `501` sin escribir tablas. Checkout no está habilitado. No se ejecutaron ni se deben ejecutar migraciones remotas mientras el proyecto permanezca NO-GO.

Migraciones preparadas: `20261002170000_security_profiles_audit.sql`, `20261002170100_ecommerce_core.sql` y `20261002170200_ecommerce_rls.sql`. Son una base de datos preparada; por sí solas no implementan endpoint de pedidos, checkout ni paneles operativos.

El carrito invitado es local y persiste únicamente IDs, cantidad, talla y color. Al cargar catálogo, los datos de producto se rehidratan desde la respuesta actual; precios/stock guardados no se usan. Referencias que no se pueden resolver se conservan y se marcan para revisión. Direcciones de cuenta siguen en almacenamiento local y no son una fuente persistente/privada.

## Principios de diseño

- El cliente nunca puede decidir precios, stock, estados de pago ni totales finales.
- El backend o Supabase Edge Function debe validar stock, variantes, precios y permisos.
- Las operaciones administrativas deben ejecutarse con permisos reales del perfil del usuario.
- La UI debe mostrar estados honestos: loading, empty, success y error.
- Los pedidos quedan en estado pending hasta que exista confirmación y validación del pago real.

## Flujo objetivo de pedido pendiente (no implementado; endpoint bloqueado)

1. El cliente crea un carrito desde el frontend.
2. El cliente selecciona dirección, envía la orden al endpoint seguro.
3. El backend valida sesión, usuario, stock y precios usando Supabase.
4. Solo después de una transacción/RPC verificada se crearía `orders` con `status = 'pending'` y `payment_status = 'pending'`.
5. Se crean `order_items` con snapshots del producto.
6. Se crea un registro `payments` con estado pending.
7. El cliente vería el número solo después de confirmar persistencia; hoy no se genera pedido.
8. Cuando exista pasarela o webhook real, entonces se actualiza el pago y el stock.

## Estrategia de stock

La estrategia recomendada es:

- Mantener stock disponible para pedidos pendientes mientras el pago no se confirma.
- Reservar solo si se implementa un mecanismo temporal y auditable con expiración.
- Descontar stock cuando el pago es aprobado por un flujo seguro.
- Liberar reserva si el pedido es cancelado.

## Requisitos antes de integración real

- Supabase project activo y autenticación configurada.
- Rotación manual de credenciales y reconciliación del historial completadas.
- Backup restaurable confirmado.
- Hardening de profiles aplicado y grants/RLS/policies verificados en staging.
- Variables de entorno del backend y del cliente sin secretos en frontend.
- Endpoint seguro con transacción/RPC atómica para crear pedidos y validar direcciones/stock.
- Proveedor de pagos externo si se quiere convertir `payment_status` a `paid`.
- Proveedor de envíos o política de despacho real.
- Política de inventario y auditoría para administración.

## Decisiones operativas aún pendientes

- Pagos: elegir un proveedor, configurar secretos solo en servidor, verificar firmas de webhook e idempotencia, y definir conciliación antes de marcar un pedido como pagado.
- Envíos: definir transportadora o método propio, cobertura, tarifas, plazos y seguimiento antes de mostrar opciones o costos.
- Correo: verificar SMTP y plantillas transaccionales en Supabase Auth/Vercel; no asumir que confirmaciones o recuperación de contraseña se están enviando.
- Backups: habilitar/revisar backups disponibles en el plan de Supabase, conservar exportaciones fuera del proyecto y probar restauración antes de producción.
- Imágenes: el upload/delete desde navegador está desactivado. `LocalStorageProvider` existe como adaptador local no conectado; no sirve para Vercel serverless sin almacenamiento persistente y una ruta de lectura. `SupabaseStorageProvider` permanece sin configurar y no realiza operaciones.

## Primer administrador

Crear la cuenta desde Supabase Auth y promoverla manualmente desde SQL Editor como dueño del proyecto. El esquema existente usa `ADMIN`:

```sql
UPDATE public.profiles
SET role = 'ADMIN'
WHERE id = 'REEMPLAZAR_CON_UUID_DEL_USUARIO';
```

Obtener el UUID correcto desde Authentication → Users. No añadir una ruta pública para promover usuarios.

## Admin de inventario (no implementado)

Cuando se implemente el panel `/admin/inventory`, deberá:

- revisar stock por variante,
- ajustar cantidades con motivo,
- guardar movimientos en `inventory_movements`,
- autorizar solo a usuarios con rol admin.

## Operación de pedidos (no implementada)

- Los clientes deberán poder leer solo sus propios pedidos.
- Los administradores deberán consultar y actualizar estados mediante API segura y auditable.
- El frontend no debe cambiar estados de pago o envío directamente.

## Segmentos que no están operativos aún

- pagos en línea,
- envíos reales,
- promociones activas sin backend validado,
- auditoría del cliente,
- pedidos reales desde carrito sin Edge Function o backend seguro.
