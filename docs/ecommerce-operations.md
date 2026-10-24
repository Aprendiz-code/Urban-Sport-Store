# Operación de UrbanSport Store

## Estado actual

Este repositorio conserva el catálogo público, newsletter, home content y CRUD administrativo existentes. La Fase 1 añade a staging una API autenticada para crear pedidos pendientes y consultar los propios; su creación transaccional depende de la migración de staging y no está conectada al flujo visual de checkout. Checkout y los pagos siguen deshabilitados. No se ejecutaron migraciones con este cambio.

Migraciones preparadas: `20261002170000_security_profiles_audit.sql`, `20261002170100_ecommerce_core.sql` y `20261002170200_ecommerce_rls.sql`. Son una base de datos preparada; por sí solas no implementan endpoint de pedidos, checkout ni paneles operativos.

El carrito invitado es local y persiste únicamente IDs, cantidad, talla y color. Al cargar catálogo, los datos de producto se rehidratan desde la respuesta actual; precios/stock guardados no se usan. Referencias que no se pueden resolver se conservan y se marcan para revisión. Direcciones de cuenta siguen en almacenamiento local y no son una fuente persistente/privada.

## Principios de diseño

- El cliente nunca puede decidir precios, stock, estados de pago ni totales finales.
- El backend o Supabase Edge Function debe validar stock, precios y permisos; la Fase 1 no acepta variantes.
- Las operaciones administrativas deben ejecutarse con permisos reales del perfil del usuario.
- La UI debe mostrar estados honestos: loading, empty, success y error.
- Los pedidos quedan en estado pending hasta que exista confirmación y validación del pago real.

## Fase 1 de pedidos pendientes en staging

1. `POST /api/orders` valida sesión, perfil activo, UUID v4 en `Idempotency-Key`, dirección inline estricta y artículos acotados.
2. Una RPC transaccional obtiene perfil, stock y precios desde Supabase y crea un pedido `pending_payment`, sus `order_items`, reservas y exactamente un registro interno `payments` `local/pending`.
3. `orders.expires_at` registra vencimiento a las 24 horas; cada reserva vence a los 20 minutos. No hay worker que cambie automáticamente el estado del pedido. Las reservas vencidas dejan de reducir la disponibilidad cuando `expires_at <= clock_timestamp()`, aunque no haya worker que las borre.
4. `products.stock` no se descuenta en esta fase. El envío y el descuento son cero; no se ofrece pago ni se calcula envío final.
5. La UUID v4 de idempotencia y el SHA-256 de la solicitud son obligatorios. La clave permanece única e inmutable permanentemente; un nuevo intento de creación requiere una UUID nueva.
6. La API permite listar y consultar únicamente los pedidos del usuario autenticado. La UI de cuenta los representa; el flujo visual de checkout no crea pedidos.
7. La cancelación, si se invoca mediante backend autorizado, solo aplica a pedidos `pending_payment` y libera reservas activas.
8. No hay aprobación/rechazo de pagos, pasarela, webhook ni limpieza automática de reservas. La limpieza local/manual requiere autorización futura separada.

## Estrategia de stock

La estrategia de Fase 1 es:

- No descontar `products.stock` al crear un pedido.
- Restar de la disponibilidad solo reservas activas aún no vencidas.
- Registrar el vencimiento del pedido a 24 horas, pero reservar inventario solo 20 minutos.
- Liberar reservas al cancelar un pedido `pending_payment`; las vencidas dejan de contarse por tiempo, sin proceso automático de limpieza.
- No marcar pedidos como pagados ni integrar un proveedor de pagos en esta fase.

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

## Operación de pedidos

- La API autenticada lista y devuelve únicamente pedidos del cliente solicitante.
- La creación se autoriza solo al backend mediante la RPC transaccional.
- La UI de cuenta muestra pedidos pendientes y su detalle; no inicia la creación desde checkout.
- No se deben reutilizar UUID de idempotencia históricas ni alterar sus hashes.
- Las claves de idempotencia no vencen ni se limpian; la expiración de reserva es independiente de la del pedido.

## Segmentos que no están operativos aún

- pagos en línea,
- envíos reales,
- promociones activas sin backend validado,
- auditoría del cliente,
- limpieza automática de reservas vencidas,
- pedidos creados desde el flujo visual de checkout.
