# Integración futura de envíos

**Estado:** proveedor local `coordinadora` implementado; requiere aplicar la migración propuesta de staging para habilitarse. No hay llamadas a una API externa de Coordinadora.

## Contrato local

`POST /api/shipping/quotes` calcula con tarifas locales configuradas por administración. No existe tarifa predeterminada: sin cobertura, tarifa única vigente o metadatos del producto, no se emite cotización. La tarifa de staging confirmada es solo Bogotá → Bogotá, paquete de 1–2 kg, con vigencia 2026-10-13 a 2026-12-31; impuestos permanecen sin especificar.

La creación de productos no requiere metadatos de envío mientras se completa el catálogo. Si se empieza a diligenciar alguno de esos datos, el producto debe incluir el conjunto completo; sin ellos no se podrá cotizar el envío.

La migración de staging `20261013193319_staging_coordinadora_shipping_quotes.sql` está aplicada al proyecto autorizado. Su versión local coincide con el registro remoto. El fixture `STAGING-SYNTH-001` tiene los datos de empaque aprobados y la tarifa inicial está configurada; la auditoría seed ausente se insertó en una transacción separada y quedó verificada. El CTE usa `RETURNING *` para que futuras instalaciones puedan auditar la fila recién creada sin volver a leer la tabla objetivo.

El checkout recibe la cotización, muestra subtotal + envío + total, y solo permite crear pedido con un UUID de cotización vigente. El backend vuelve a comprobar propietario, dirección, artículos, COP y vencimiento antes de la RPC de pedido/reserva. Wompi continúa leyendo el total final persistido.

## Requisitos de una implementación

- Completar atributos de empaque y valor declarado en todos los productos que se quieran cotizar.
- Mantener actualizadas rutas, bandas de peso, tarifas, manejo, impuestos y vigencia desde administración.
- Si se integra una API externa en el futuro, revisar contrato, credenciales de staging y tratamiento de errores antes de activarla.
- Preservar método, costo y snapshot de la tarifa en cada pedido; no confiar en campos enviados por el navegador.
- Verificar webhooks/actualizaciones de tracking, idempotencia y transiciones permitidas.
- No mostrar costo, “gratis”, fecha estimada o estado enviado hasta contar con respuesta real.
- Probar escenarios de cobertura no disponible, dirección inválida, cambio de tarifa, cancelación y devolución en staging.

No hay transporte de pagos ni pedidos activos en este momento. Aplicar tablas de comercio por sí solo no configura el proveedor.
