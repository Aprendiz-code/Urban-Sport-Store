# Checklist de preparación para producción

**Estado global: NO-GO.** No declarar el sistema listo para producción mientras secretos, migraciones, providers y pruebas E2E sigan pendientes.

## Implementación local

- [x] Autorización server-side consulta `profiles.role` y `profiles.is_active`.
- [x] Tests rechazan metadata falsificada, perfil ausente e inactivo.
- [x] Carrito invitado guarda IDs/opciones/cantidad y rehidrata desde catálogo.
- [x] Pedido pendiente permanece bloqueado; API no escribe.
- [x] Contratos tipados para pagos/envíos sin provider configurado.
- [x] Adaptador filesystem local valida formatos, tamaño, nombre y path; está aislado y no conectado.
- [x] Escritura/borrado de Storage desde navegador deshabilitada.
- [ ] Dirección/perfil persistidos por endpoints server-side.
- [ ] Listado/detalle real de pedidos propios y admin.
- [ ] Variantes/stock transaccionales y auditoría de movimientos.
- [ ] CRUD de metadata de imágenes y entrega desde almacenamiento persistente.
- [ ] Pruebas E2E locales con backend y fixtures aislados.

## Activación de Supabase (manual, posterior a NO-GO)

- [ ] Rotar secretos y credenciales potencialmente expuestos.
- [ ] Actualizar variables protegidas del backend/Vercel/CI; no poner secretos en `VITE_*`.
- [ ] Confirmar backup/snapshot restaurable.
- [ ] Inspeccionar historial, esquema, grants, triggers, policies y perfiles privilegiados remotos.
- [ ] Resolver explícitamente el estado de `20260727000000_set_admin_raw_app_meta.sql`; no ejecutarla.
- [ ] Reconciliar migraciones locales/remotas y mantener `pnpm run supabase:preflight` bloqueado hasta ese momento.
- [ ] Aplicar hardening de perfiles en staging y verificar grants/RLS con anon, customer, admin activo, admin inactivo y perfil ausente.
- [ ] Aplicar esquema e-commerce en una decisión separada, una migración a la vez.
- [ ] Generar tipos del esquema real después de verificar el esquema aplicado.
- [ ] Configurar variables de cliente solo públicas y secretos solo en servidor.
- [ ] Crear el primer admin manualmente por UUID verificado desde Auth y SQL Editor.
- [ ] Configurar SMTP/confirmación de email y probar registro/login en staging.
- [ ] Probar catálogo, newsletter, home content y CRUD existente entre pasos.

## Antes de producción

- [ ] Rotar y revocar credenciales antiguas después de validar las nuevas.
- [ ] Definir pagos, firma/idempotencia de webhooks, conciliación, devoluciones y reembolsos.
- [ ] Definir proveedor/política de envíos, cobertura, tarifas, tiempos y cambios.
- [ ] Publicar términos, privacidad, datos comerciales y políticas verificadas.
- [ ] Definir backup y probar restauración.
- [ ] Configurar monitoreo, alertas, rate limits y revisión de logs sin datos sensibles.
- [ ] Realizar compra end-to-end en staging con pago de prueba del proveedor elegido.
- [ ] Probar inventario concurrente y reintentos/doble envío.
- [ ] Probar móvil, teclado, lectores de pantalla y contraste.
- [ ] Medir rendimiento/Core Web Vitals; no afirmar aprobación sin medición.
- [ ] Revisar SEO, canonical, sitemap y structured data usando solo datos reales.
- [ ] Hacer revisión de seguridad final y resolver los hallazgos.

## Activación de pedidos reales

Solo después de tablas/RLS/backend verificados: activar endpoint transaccional idempotente, validar dirección propia y precios/stock en servidor, crear pedido `pending`, mantener pago `pending`, auditar y limpiar carrito solo tras éxito. El endpoint actual devuelve 501 y no crea pedido.

## Activación de pagos

Solo después de elegir proveedor, almacenar secretos server-side, implementar/verificar webhooks, idempotencia, estados y conciliación. No aceptar una transición a `paid` desde el navegador.
