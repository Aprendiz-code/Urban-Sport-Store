# Integración futura de pagos

**Estado:** no implementada, no configurada y no conectada. El checkout actual no inicia pagos y el API no crea pedidos. No se acepta ni se registra información de tarjetas.

## Requisitos antes de elegir proveedor

- Aprobación comercial del proveedor y países/monedas soportados.
- Cuenta de pruebas y luego credenciales de producción guardadas solo en backend/CI protegido.
- Contrato de pedido persistido y transacción/RPC de creación idempotente.
- Estados permitidos y transición auditada para pending, paid, failed, cancelled y refunded.
- Política de conciliación, disputas, reembolsos y retención de datos.

## Contratos locales

`src/types/providers.ts` define `PaymentProvider`, `PaymentWebhookVerifier` y `PaymentStatusUpdater`. Sus instancias configuradas son `null`; no hay SDK, endpoint de pago, webhook ni callback habilitado.

Una implementación futura debe:

1. Crear la intención desde backend usando el total recalculado en servidor y una clave de idempotencia.
2. Mantener el estado inicial `pending`; nunca permitir que el navegador lo cambie a `paid`.
3. Verificar la firma sobre el cuerpo original del webhook antes de aceptar eventos.
4. Comprobar proveedor, referencia, pedido, moneda, importe, timestamp y duplicados.
5. Actualizar pago/pedido dentro de una operación idempotente y registrar auditoría.
6. No almacenar PAN, CVV ni secretos del proveedor en tablas o logs.
7. Probar aprobado, rechazado, reintento, evento duplicado, cancelación y reembolso en staging.

## Activación futura

No publicar una pasarela hasta que rotación, backup, historial, hardening/RLS y esquema de pedidos estén verificados en staging. No mostrar “Pago aprobado”, “Compra completada” o “Pago seguro” antes de una confirmación autenticada del proveedor.
