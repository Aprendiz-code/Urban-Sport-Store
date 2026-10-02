# Integración futura de envíos

**Estado:** no implementada ni cotizada. No hay transportadora, cobertura, costo, promesa de entrega ni tracking configurados. La UI muestra el envío como pendiente de confirmar.

## Contrato local

`src/types/providers.ts` define `ShippingProvider`, `ShippingQuote` y `ShipmentStatusUpdater`. El provider configurado es `null`; no se simulan tarifas ni fechas.

## Requisitos de una implementación

- Elegir proveedor o documentar una política propia de despacho.
- Confirmar ciudades/cobertura, peso/dimensiones requeridas, tarifas, recargos, tiempos y devoluciones.
- Calcular cotización server-side a partir de dirección/productos verificados.
- Persistir método, costo y snapshot aceptado en el pedido; no confiar en campos enviados por el navegador.
- Verificar webhooks/actualizaciones de tracking, idempotencia y transiciones permitidas.
- No mostrar costo, “gratis”, fecha estimada o estado enviado hasta contar con respuesta real.
- Probar escenarios de cobertura no disponible, dirección inválida, cambio de tarifa, cancelación y devolución en staging.

No hay transporte de pagos ni pedidos activos en este momento. Aplicar tablas de comercio por sí solo no configura el proveedor.
