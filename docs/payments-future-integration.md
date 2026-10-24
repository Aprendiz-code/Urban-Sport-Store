# Pagos con Wompi

**Estado:** existe una implementación local de payment links y webhook para Sandbox, junto con pruebas locales mockeadas y SQL. La integración de pago confirmado no está verificada mediante una E2E real; la correlación del webhook sigue bloqueada hasta demostrar un vínculo autenticado, único y verificable entre transacción, link, intento y pedido. No se habilitan llaves de producción.

## Flujo Sandbox

- `POST /api/orders` crea el pedido pendiente desde el backend.
- `POST /api/orders/:id/payment-session` verifica propiedad, total y reserva; llama con la llave privada del servidor a `https://sandbox.wompi.co/v1/payment_links` y devuelve `checkoutUrl` solo si apunta a `https://checkout.wompi.co/l/`.
- El checkout obtiene la sesión autenticada, crea el pedido y redirige al cliente a Wompi. No recibe ni almacena datos de tarjeta.
- El código actual del webhook valida `transaction.updated` del ambiente `test` y el checksum SHA-256 con las propiedades enumeradas en `signature.properties`, el timestamp y `WOMPI_EVENTS_SECRET`. Antes de llamar al RPC de procesamiento, exige que `transaction.payment_link_id` no sea nulo, esté incluido entre las propiedades firmadas y encuentre una sesión persistida; esa ruta no está demostrada con un evento real de payment link.
- Condicionado a que esa correlación sea válida, el código llama a `lookup_payment_link_session` para obtener la referencia interna y después a `process_verified_wompi_event`, que comprueba importe, moneda y estado y aplica idempotencia. Según el código actual, solo un evento correlacionado con estado `APPROVED` puede marcar pagado; `DECLINED`, `VOIDED` y `ERROR` no lo hacen. Esto describe el comportamiento implementado, no una capacidad E2E verificada.
- Si `payment_link_id` es nulo, no está firmado o no se puede verificar el vínculo, no se aplica el pago. `transaction.reference`, SKU, retorno e ID del navegador no son fallbacks de correlación ni de aprobación.

## Variables de entorno

Configurar solo en el backend:

- `WOMPI_ENVIRONMENT=sandbox`
- `WOMPI_API_BASE_URL=https://sandbox.wompi.co/v1`
- `WOMPI_PUBLIC_KEY` (prefijo de prueba `pub_test_`)
- `WOMPI_PRIVATE_KEY` (prefijo de prueba `prv_test_`)
- `WOMPI_EVENTS_SECRET` (secreto de eventos Sandbox, diferente de la llave privada)

El webhook debe configurarse en la cuenta Sandbox de Wompi como URL HTTPS pública terminada en `/api/webhooks/wompi`. `localhost` no puede recibir notificaciones desde Wompi. Mantener secretos de producción separados y fuera del cliente.

## Pruebas y límites conocidos

Las pruebas unitarias de aplicación mockean Wompi y Supabase; cubren la creación del link, validación del checksum, estados y rechazos, pero no prueban la integración con el proveedor. Los tests SQL locales de `supabase-staging/supabase/tests/` ejercitan esquema, permisos y funciones con fixtures; no demuestran que Wompi emita un evento correlacionable ni que llegue al webhook. No se ha ejecutado una E2E real de Sandbox: queda pendiente de aprobación y requeriría el secreto de eventos solo en el backend de staging y un endpoint HTTPS configurado en Wompi Sandbox. No requiere configurar el entorno local.

No pasar a producción hasta configurar un webhook independiente de producción, verificar sus secretos y llaves en el entorno de despliegue, completar pruebas de aprobado/rechazado/void/error, reintentos, duplicados y conciliación, y revisar RLS, alertas, retención y reembolsos. Nunca declarar una compra pagada desde el navegador ni antes del evento autenticado.

## Preparación local para staging (pendiente de aprobación)

La URL de retorno es opcional. Cuando se autorice configurar únicamente el deployment Preview dedicado a staging, documentar allí estos valores usando el hostname HTTPS de ese Preview; estos ejemplos son placeholders y no deben copiarse literalmente:

```dotenv
WOMPI_SANDBOX_RETURN_URL=https://<hostname-preview-staging>/checkout/return
WOMPI_SANDBOX_RETURN_ORIGINS=https://<hostname-preview-staging>
```

La allowlist admite una lista separada por comas de orígenes canónicos HTTPS, sin ruta, barra final, puerto, query ni fragmento. La URL de retorno debe usar exactamente uno de esos orígenes y la ruta `/checkout/return`, sin credenciales, puerto, query ni fragmento. Si falta cualquiera de las variables o no coincide la validación, el enlace se crea sin `redirect_url`. No añadir estos valores a Production, al frontend ni a archivos de entorno locales. No se ha configurado ningún servicio.

El retorno es solo navegación: parámetros como `success`, `approved` o equivalentes no prueban un pago ni cambian su estado. El endpoint de webhook existente permanece separado y sin cambios.

## Lectura de estado persistido (propuesta, no implementada)

El retorno genérico no incluye ni necesita un identificador de pedido. No debe leer parámetros de resultado del navegador ni confirmar un pago. La experiencia recomendada es mostrar el historial del usuario autenticado; al seleccionar un pedido, se puede consultar su estado persistido usando ese pedido como filtro, nunca como prueba de correlación con Wompi.

El `GET /api/orders` actual ya consulta `orders` con un cliente Supabase de clave anon/publicable y el Bearer del usuario, por lo que esa lectura queda bajo RLS; sin embargo, serializa `paymentStatus: 'pending'` y no lee `payments`. No reutilizar `authenticateOrderRequest` en una nueva ruta de lectura: hoy valida usuario/perfil mediante el cliente privilegiado. La ruta nueva debe validar el token con un cliente anon/publicable y hacer todas las lecturas con el JWT del usuario, o leer directamente desde el cliente de sesión. `service_role` no debe participar en autenticación, consulta ni serialización de esta ruta.

La ruta `GET /api/orders/:id/payment-status` es una propuesta, no existe como ruta implementada. De llegar a aprobarse, devolvería solo `orders.status`, `payments.status` y el `status`/`session_state` del intento más reciente. El UUID recibido serviría únicamente para filtrar; la policy debería devolver cero filas si el pedido no pertenece a `auth.uid()`. No devolvería `reference`, `transaction_id`, `provider_session_id`, `checkout_url`, tokens de claim ni eventos/checksums. La consulta no escribiría estados.

En el esquema local de staging, `orders` ya tiene grant/policy de lectura propia. `payments` y `payment_attempts` tienen RLS habilitado, pero staging revoca `SELECT` a roles cliente y no define policies de lectura. Por tanto, hoy no se pueden leer esos estados directamente con RLS. Las consultas, grants y policies para leer `payments` y `payment_attempts` no están aprobados y no deben aplicarse todavía. El SQL siguiente es solo un borrador para revisión, no una opción autorizada ni una migración aprobada:

### Auditoría de privilegios efectivos (propuesta, no ejecutada)

- **Objetivo:** identificar los privilegios `SELECT` efectivos de `authenticated` sobre `payments` y `payment_attempts`, incluidos los otorgados directamente, a `PUBLIC` y a roles heredados por membresía.
- **Alcance:** lectura exclusiva de catálogos y metadatos de privilegios. No consultar filas de usuarios ni realizar revocaciones, migraciones o cambios de RLS.
- **Criterio de salida:** entregar por cada privilegio el grantee, rol concedente, tabla, privilegio, tipo de grant y si se hereda por membresía; concluir si existe `SELECT` a nivel de tabla que haga que los grants por columna no limiten el acceso efectivo.
- **Precondición:** aprobación explícita del entorno/destino y del procedimiento antes de ejecutar cualquier consulta.
- **Estado:** propuesta pendiente de aprobación; no ejecutada.

#### Procedimiento propuesto de solo lectura

- **Entradas:** rol sujeto a auditoría (`authenticated`), tablas objetivo (`payments` y `payment_attempts`), entorno/destino aprobado y fecha/hora de ejecución.
- **Pasos conceptuales:** identificar membresías y herencia de roles; identificar grants directos y a `PUBLIC`; calcular privilegios efectivos por tabla; distinguir grants de tabla de grants por columna; registrar los resultados.
- **Criterios de seguridad:** acceso de solo lectura a catálogos/metadatos; sin leer filas de negocio; sin revocaciones, grants, migraciones ni cambios de RLS; sin secretos, credenciales ni datos personales en la evidencia.
- **Evidencia esperada:** inventario de privilegios efectivos, conclusión sobre `SELECT` a nivel de tabla y recomendación separada de revocaciones, si correspondiera.
- **Estado:** procedimiento propuesto, no ejecutado; requiere aprobación explícita del entorno/destino antes de cualquier ejecución.

#### Destino y plan de ejecución propuesto (pendiente de aprobación)

- **Criterios para elegir el entorno/destino:** debe ser un entorno de staging aislado, nunca Producción. El proyecto y la base de datos se identificarán por nombre lógico únicamente, sin credenciales ni cadenas de conexión.
- **Quién debe aprobar:** se requiere aprobación explícita del responsable del entorno antes de cualquier consulta.
- **Ventana y alcance:** ejecución de solo lectura sobre catálogos/metadatos, sin cambios de estado, sin lectura de filas de negocio y con evidencia sin secretos ni datos personales.
- **Criterio de parada:** si el destino no está claramente identificado, no es staging aislado o falta aprobación, no se ejecuta nada.
- **Estado:** plan propuesto; no aprobado ni ejecutado.

#### Procedimiento ejecutable propuesto (solo lectura, pendiente de aprobación)

- **Destino lógico:** [nombre lógico del staging]; aprobación registrada por [responsable] el [fecha]. Estos campos son etiquetas documentales, no identificadores de conexión.
- **Aprobación de ejecución:** la identificación/aprobación del destino no autoriza esta auditoría. Antes de ejecutarla se requiere aprobación explícita separada del responsable del entorno para este procedimiento y su ventana.
- **Precondición y parada:** confirmar que la sesión está conectada al destino lógico aprobado por un mecanismo operativo independiente, sin registrar host ni cadena de conexión en la evidencia. Si no se puede verificar el destino, la aprobación o la lectura de los catálogos, detenerse sin cambiar de rol, elevar privilegios ni consultar datos de negocio.
- **Modo:** ejecutar únicamente el siguiente bloque de lectura en una sesión autorizada. La transacción es de solo lectura y se revierte al final; el bloque contiene únicamente consultas a catálogos y funciones de comprobación de privilegios.

```sql
BEGIN TRANSACTION READ ONLY;

WITH RECURSIVE inherited_roles AS (
	SELECT role_row.oid AS role_oid,
				 role_row.rolname AS role_name,
				 ARRAY[role_row.oid]::oid[] AS role_path_oids,
				 ARRAY[role_row.rolname]::text[] AS role_path_names
	FROM pg_catalog.pg_roles AS role_row
	WHERE role_row.rolname = 'authenticated'

	UNION ALL

	SELECT granted_role.oid,
				 granted_role.rolname,
				 inherited.role_path_oids || granted_role.oid,
				 inherited.role_path_names || granted_role.rolname
	FROM inherited_roles AS inherited
	JOIN pg_catalog.pg_auth_members AS membership
		ON membership.member = inherited.role_oid
	 AND membership.inherit_option
	JOIN pg_catalog.pg_roles AS granted_role
		ON granted_role.oid = membership.roleid
	WHERE NOT granted_role.oid = ANY(inherited.role_path_oids)
),
table_grants AS (
	SELECT namespace_row.nspname AS schema_name,
				 relation.relname AS table_name,
				 privilege.grantee,
				 privilege.grantor,
				 privilege.privilege_type,
				 privilege.is_grantable,
				 'table'::text AS grant_scope
	FROM pg_catalog.pg_class AS relation
	JOIN pg_catalog.pg_namespace AS namespace_row
		ON namespace_row.oid = relation.relnamespace
	CROSS JOIN LATERAL pg_catalog.aclexplode(
		COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
	) AS privilege
	WHERE namespace_row.nspname = 'public'
		AND relation.relname IN ('payments', 'payment_attempts')
		AND relation.relkind = 'r'
),
column_grants AS (
	SELECT namespace_row.nspname AS schema_name,
				 relation.relname AS table_name,
				 attribute.attname AS column_name,
				 privilege.grantee,
				 privilege.grantor,
				 privilege.privilege_type,
				 privilege.is_grantable,
				 'column'::text AS grant_scope
	FROM pg_catalog.pg_class AS relation
	JOIN pg_catalog.pg_namespace AS namespace_row
		ON namespace_row.oid = relation.relnamespace
	JOIN pg_catalog.pg_attribute AS attribute
		ON attribute.attrelid = relation.oid
	 AND attribute.attnum > 0
	 AND NOT attribute.attisdropped
	CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
	WHERE namespace_row.nspname = 'public'
		AND relation.relname IN ('payments', 'payment_attempts')
		AND relation.relkind = 'r'
),
all_grants AS (
	SELECT schema_name, table_name, NULL::text AS column_name,
				 grantee, grantor, privilege_type, is_grantable, grant_scope
	FROM table_grants
	UNION ALL
	SELECT schema_name, table_name, column_name,
				 grantee, grantor, privilege_type, is_grantable, grant_scope
	FROM column_grants
)
SELECT grant_row.schema_name,
			 grant_row.table_name,
			 grant_row.column_name,
			 CASE WHEN grant_row.grantee = 0
						THEN 'PUBLIC'
						ELSE grantee_role.rolname
			 END AS grantee,
			 pg_catalog.pg_get_userbyid(grant_row.grantor) AS granting_role,
			 grant_row.privilege_type,
			 grant_row.grant_scope,
			 grant_row.is_grantable,
			 CASE WHEN grant_row.grantee = 0 THEN 'PUBLIC'
						WHEN grant_row.grantee = subject_role.oid THEN 'direct'
						ELSE 'inherited'
			 END AS membership_scope,
			 inherited.role_path_names
FROM all_grants AS grant_row
LEFT JOIN pg_catalog.pg_roles AS grantee_role
	ON grantee_role.oid = grant_row.grantee
LEFT JOIN pg_catalog.pg_roles AS subject_role
	ON subject_role.rolname = 'authenticated'
LEFT JOIN inherited_roles AS inherited
	ON inherited.role_oid = grant_row.grantee
WHERE grant_row.grantee = 0
	 OR grant_row.grantee IN (SELECT role_oid FROM inherited_roles)
ORDER BY grant_row.schema_name, grant_row.table_name,
				 grant_row.grant_scope, grant_row.column_name,
				 grantee, grant_row.privilege_type, inherited.role_path_names;

SELECT namespace_row.nspname AS schema_name,
			 relation.relname AS table_name,
			 pg_catalog.has_table_privilege(
				 'authenticated', relation.oid, 'SELECT'
			 ) AS effective_table_select,
			 attribute.attname AS column_name,
			 pg_catalog.has_column_privilege(
				 'authenticated', relation.oid, attribute.attnum, 'SELECT'
			 ) AS effective_column_select
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace_row
	ON namespace_row.oid = relation.relnamespace
JOIN pg_catalog.pg_attribute AS attribute
	ON attribute.attrelid = relation.oid
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
WHERE namespace_row.nspname = 'public'
	AND relation.relname IN ('payments', 'payment_attempts')
	AND relation.relkind = 'r'
ORDER BY relation.relname, attribute.attnum;

ROLLBACK;
```

- **Lectura del resultado:** conservar el inventario de grantee, rol concedente, tabla/columna, privilegio, alcance tabla/columna, grantabilidad y membresía heredada. La segunda consulta informa por separado el `SELECT` efectivo de tabla y de cada columna; cualquier `effective_table_select = true` significa que `authenticated` puede leer todas las columnas de esa tabla; en ese caso, los grants por columna no reducen su acceso efectivo. La segunda consulta es la evidencia decisiva del privilegio efectivo; la primera consulta es el inventario explicativo de grants y rutas de herencia.
- **Estado:** procedimiento propuesto, no ejecutado; cualquier ejecución requiere la aprobación separada indicada arriba.

Antes de considerar esos grants, auditar los privilegios efectivos de `authenticated`, incluidos grants `SELECT` a nivel de tabla concedidos directamente, a `PUBLIC` o a roles heredados por membresía. Si la auditoría confirma un grant amplio, revocarlo del grantee exacto que lo concede y verificar de nuevo los privilegios efectivos. Un grant `SELECT` por columna no revoca ni limita un permiso `SELECT` ya concedido a nivel de tabla. No afirmar que las demás columnas quedan ocultas hasta verificar los permisos efectivos; no ejecutar esta auditoría ni revocaciones como parte de esta propuesta.

```sql
BEGIN;

CREATE POLICY payments_select_own_order
ON public.payments FOR SELECT TO authenticated
USING (EXISTS (
	SELECT 1
	FROM public.orders AS own_order
	WHERE own_order.id = payments.order_id
		AND own_order.user_id = (SELECT auth.uid())
));

CREATE POLICY payment_attempts_select_own_order
ON public.payment_attempts FOR SELECT TO authenticated
USING (EXISTS (
	SELECT 1
	FROM public.orders AS own_order
	WHERE own_order.id = payment_attempts.order_id
		AND own_order.user_id = (SELECT auth.uid())
));

GRANT SELECT (order_id, status)
	ON public.payments TO authenticated;
GRANT SELECT (order_id, attempt_number, status, session_state)
	ON public.payment_attempts TO authenticated;

COMMIT;
```

No conceder acceso a `anon`, `INSERT`, `UPDATE`, `DELETE`, columnas de correlación ni `payment_events`. Mantener RLS habilitado. La ruta consulta pedido, pago e intento con el mismo token del usuario y devuelve `404` uniforme cuando el pedido no es visible. El SQL anterior es solo un borrador de permisos directos; no se ha convertido en migración ni ejecutado.

### Comparación de lecturas bajo RLS

| Diseño | Proyección y permisos | Ventajas y límites |
| --- | --- | --- |
| SELECT directo a tablas | `orders.id/status` ya está autorizado para `authenticated`. Para `payments`: solo `order_id/status`. Para `payment_attempts`: solo `order_id/attempt_number/status/session_state`. En ambas tablas, policy `SELECT TO authenticated` con `EXISTS` sobre `orders` y `orders.user_id = (SELECT auth.uid())`. | Menos objetos y fácil de probar. Requiere grants por columna, no grant de tabla; cada consulta debe llevar el JWT de sesión y todas las filas quedan filtradas por RLS. |
| Vista `security_invoker` | Vista de proyección fija con `orders.id/status`, `payments.status`, y el intento más reciente por `attempt_number` con `status/session_state`. Grant `SELECT` solo a `authenticated` y policy owner en las tablas base. | Contrato de lectura estable y una sola petición. `security_invoker = true` mantiene los permisos y RLS del llamador; no permite omitir los grants mínimos de columnas base ni sustituye las policies. Staging usa PostgreSQL 17, por lo que la característica existe en el motor configurado localmente; debe verificarse en el destino aprobado antes de aplicar. |
| RPC `SECURITY INVOKER` | Función de solo lectura que recibe `p_order_id`, retorna únicamente los campos anteriores, filtra con `auth.uid()` y tiene `search_path = ''`. Revocar `EXECUTE` de `PUBLIC`/`anon`; concederlo a `authenticated`. | Encapsula el resultado y puede devolver una lectura consistente en una llamada. Sigue necesitando grants `SELECT` sobre las columnas base y policies RLS; `SECURITY INVOKER` no bypassa RLS. No usar `SECURITY DEFINER` para evitar los permisos base. |

Las tres opciones quedan pendientes de elección y aprobación; este documento no elige, autoriza ni implementa ninguna. En todas, la sesión del usuario y su JWT deben llegar a la lectura, `service_role` no participa y el resultado quedaría limitado a `orders.id/status`, `payments.status` y `payment_attempts.status/session_state` (con `order_id` y `attempt_number` solo donde sean necesarios para filtrar/ordenar).

### Permisos y políticas por opción

- **SELECT directo:** `authenticated` recibe grants de columna solo para `payments(order_id, status)` y `payment_attempts(order_id, attempt_number, status, session_state)`. Las policies `SELECT` de ambas tablas exigen una fila en `orders` con el mismo `order_id` y `user_id = (SELECT auth.uid())`. `orders` conserva su grant de columnas y policy `orders_select_own` existentes. Supabase considera los grants por columna una función avanzada y no los recomienda para la mayoría de los proyectos. Revisar y revocar cualquier `SELECT` a nivel de tabla: esos privilegios pueden seguir dando acceso a todas las columnas aunque se limite el grant por columna.
- **Vista `security_invoker`:** conceder `SELECT` sobre la vista solo a `authenticated`; exponer únicamente `order_id`, `order_status`, `payment_status`, `attempt_status` y `session_state` (sin IDs ni datos del proveedor). Las tablas base mantienen los mismos grants de columna mínimos y policies de propietario descritos para SELECT directo: `security_invoker` aplica los privilegios y RLS del llamador, no los sustituye.
- **RPC `SECURITY INVOKER`:** declarar `SET search_path = ''` y usar referencias totalmente calificadas a tablas y esquemas. Ejecutar explícitamente `REVOKE EXECUTE ... FROM PUBLIC, anon` para la firma exacta y conceder `EXECUTE` solo a `authenticated`. La función acepta únicamente el ID del pedido como filtro, comprueba `auth.uid()` no nulo, filtra por propietario y devuelve la misma proyección mínima. Las tablas base mantienen los grants mínimos y policies RLS de propietario; `SECURITY INVOKER` no los sustituye ni evita revisar privilegios `SELECT` existentes a nivel de tabla.

Supabase recomienda `SECURITY INVOKER` por defecto. `SECURITY DEFINER` no es un atajo: corre con los privilegios de su creador y puede saltarse RLS. No se propone para esta lectura. Si se presentara como excepción en una propuesta futura separada, deberá justificar por qué invoker no basta, comprobar en el cuerpo `auth.uid()` contra el propietario antes de leer, devolver solo los campos mínimos y restringir explícitamente `EXECUTE` (revocar de `PUBLIC`/`anon` y conceder solo al rol autorizado); además requerirá revisión de seguridad y pruebas específicas. No usar `service_role` como alternativa.

### Pruebas pgTAP por opción

- **Comunes:** con dos usuarios/pedidos sintéticos, cambiar `SET LOCAL ROLE authenticated` y los claims JWT; A solo ve A y B solo ve B. Confirmar que `anon` no ve filas, que usuarios no autenticados no ejecutan la lectura y que ninguna llamada cambia filas. Verificar que `reference`, `transaction_id`, `provider_session_id`, `checkout_url`, tokens/errores internos y `payment_events` continúan inaccesibles, y que no hay `INSERT`/`UPDATE`/`DELETE` para roles cliente.
- **SELECT directo:** `has_column_privilege` permite únicamente las columnas declaradas; los `SELECT` cruzados devuelven cero filas por RLS en `payments` y `payment_attempts`.
- **Vista `security_invoker`:** inspeccionar `reloptions` para confirmar `security_invoker=true`; verificar `SELECT` de la vista solo para `authenticated`, que los permisos de columnas base siguen siendo mínimos y que el aislamiento entre usuarios se conserva a través de la vista.
- **RPC `SECURITY INVOKER`:** comprobar `prosecdef = false`, `search_path` fijo/vacío, `EXECUTE` solo para `authenticated`, rechazo de `auth.uid()` nulo y cero filas al pedir el ID de otro usuario; comprobar también permisos mínimos/RLS en las tablas base.
- **Excepción `SECURITY DEFINER`, si se propusiera después:** añadir pruebas separadas para la comprobación explícita de `auth.uid()`/propietario, denegación sin sesión y con propietario ajeno, `EXECUTE` revocado a `PUBLIC`/`anon` y otorgado solo al rol previsto, además de confirmar el alcance de bypass RLS y los campos retornados.

Los tests SQL actuales del repo usan bloques `DO`; no se encontró un patrón pgTAP en los tests locales. Confirmar runner/extensión pgTAP y preparar fixtures aislados antes de escribir una prueba ejecutable. No se ha creado ni ejecutado una migración o prueba nueva.

## Correlación y bloqueo de aprobación

Los campos documentados no demuestran todavía una correlación completa en todos los casos:

| Campo o respuesta | Hecho documentado disponible para esta revisión | Consecuencia |
| --- | --- | --- |
| `transaction.payment_link_id` en el ejemplo de webhook | El ejemplo señalado muestra `null`; además, no se debe asumir que el campo aparece en todas las transacciones. | No permite buscar una sesión en ese evento. El handler actual falla cerrado si falta y debe permanecer intacto. |
| `signature.properties` | La lista de propiedades firmadas puede variar por evento. El checksum solo autentica los valores enumerados en esa lista. | No asumir que `payment_link_id` está firmado en todos los eventos. Sin ese campo no hay correlación probada y no se procesa. |
| ID devuelto al crear un payment link (`data.id`) | El código local persiste ese ID como `provider_session_id`. | Vincula el intento con el link, pero por sí solo no vincula una transacción recibida después. |
| `transaction.reference` | Puede aparecer en el evento, pero no prueba que el valor corresponda inequívocamente al intento interno. | No usarlo para marcar pagado ni como fallback de correlación. |
| GET de transacción o de payment link | La guía disponible no garantiza que la respuesta recupere el vínculo link-transacción en todos los casos. | No implementar lookup alternativo ni asumir una relación no garantizada. |

Así, según el código actual, el RPC de procesamiento solo se invoca para eventos donde el `payment_link_id` no nulo está incluido en `signature.properties`, la firma cubre ese valor, coincide con una sesión persistida única y pasan las comprobaciones transaccionales existentes. La verificación general del checksum no crea por sí misma esa relación. Ese comportamiento condicionado del código no demuestra una integración E2E con Wompi. Cuando el campo sea `null`, esté ausente de las propiedades firmadas, no haya coincidencia o un GET no demuestre el vínculo inequívoco, se detiene y no se marca pagado. El retorno, un ID enviado por el navegador, `sku` y `transaction.reference` no son fallbacks. Esta comparación parte de los campos indicados para esta revisión; no se consultó documentación externa ni se probó contra Wompi. El handler y la lógica de pago no se modifican.

Bloqueo para avanzar: demostrar, con contrato documentado y posteriormente una prueba Sandbox aprobada, una relación autenticada, única e inmutable `transacción -> payment_link_id -> intento -> payment/order`. Si `payment_link_id` puede ser nulo o las propiedades de firma no lo incluyen, demostrar además una respuesta GET garantizada que parta de `transaction.id` autenticado y recupere el vínculo sin ambigüedad. No basta con observar un caso exitoso aislado ni con que `transaction.reference` coincida casualmente. Sin esa evidencia, no hay alternativa autorizada ni aprobación automática.

Las pruebas locales siguen aislando Wompi y Supabase con mocks. Mantener casos para URL permitida/no permitida, retorno sin efecto sobre el estado, `payment_link_id` nulo/ausente/no firmado, lookup sin coincidencia/error, `transaction.reference` y SKU señuelo, ID de navegador no confiable, checksum inválido, repetición, evento atrasado e importes/moneda que no coinciden. Un webhook de ejemplo con `payment_link_id: null` debe permanecer rechazado sin llamadas de procesamiento.

### Evento con firma válida y sin correlación

Si el checksum es válido pero `payment_link_id` es nulo, no está incluido en las propiedades firmadas o el lookup no puede demostrar una relación única con la sesión/intento/pedido, el evento no se procesa y no se marca pagado. Registrar el motivo como una categoría operativa acotada (por ejemplo, “correlación ausente/no verificable”), sin guardar el cuerpo del webhook, checksum, secretos, datos personales ni valores de referencia del proveedor en logs ordinarios.

La respuesta HTTP es una decisión operativa pendiente de aprobación. La referencia de Wompi indicada para esta integración dice que puede reintentar hasta tres veces cuando no recibe `200`; el handler actual responde `503` ante una correlación no resuelta. Un no-200 puede provocar nuevas entregas, pero no hay evidencia de que el reintento resuelva una correlación permanentemente ausente o no firmada. Un `200` detendría los reintentos del proveedor, por lo que requeriría decidir previamente cómo queda registrado y revisable el evento no correlacionado. No se elige aquí entre responder 200 o no-200: aprobar antes criterios para distinguir fallos transitorios/permanentes, registro seguro, reintentos, revisión manual e idempotencia. Mantener bloqueado el procesamiento hasta esa decisión y hasta demostrar la correlación; no cambiar ahora el handler ni su respuesta.

## Plan E2E Sandbox/staging (no ejecutado)

**Recursos:** proyecto Supabase dedicado a staging (DB/Auth/Storage), deployment Vercel Preview aislado con hostname HTTPS, cuenta/ambiente Sandbox de Wompi, claves de prueba y secreto de eventos guardados solo en variables server-side, usuario cliente ficticio y producto sintético con stock controlado. No usar credenciales ni datos de Production, ni datos de tarjeta reales.

**Aprobaciones previas:** aprobación específica para confirmar el proyecto Supabase y deployment Preview de destino; otra aprobación para aplicar migraciones únicamente a ese staging; otra para escribir variables Sandbox/allowlist y configurar allí el endpoint HTTPS del webhook; y aprobación explícita antes de crear fixtures, pedido, enlace o transacción. Cada acción remota debe esperar su aprobación correspondiente. Production requiere autorización independiente.

**Secuencia prevista:**

1. Ejecutar y revisar primero las pruebas locales mockeadas; confirmar aislamiento de Preview y Supabase antes de cualquier escritura.
2. Tras aprobación, aplicar solo migraciones revisadas en staging, incluidas las policies/grants y pgTAP aprobados, y preparar usuario/producto sintéticos. Verificar que una sesión lee solo sus propios estados; si la migración o las pruebas RLS no están aprobadas y pasan localmente, detener la E2E.
3. Antes de crear pagos, resolver el bloqueo de correlación con documentación y evidencia de Sandbox aprobada. Si el evento presenta `payment_link_id: null` y no existe un vínculo alternativo garantizado, detener la prueba antes de procesar el pago.
4. Solo tras aprobación separada, configurar las dos variables de retorno en Preview/staging y registrar el callback HTTPS del webhook Sandbox. Confirmar URL allowlisted en la creación del link y rechazo de un origen no permitido. No cambiar callbacks en esta fase.
5. Tras aprobación explícita, crear una orden sintética y payment link Sandbox; completar estados Sandbox aprobado, rechazado y cancelado/expirado con medios de prueba del proveedor. El retorno no puede cambiar el estado persistido.
6. Verificar checksum y correlación únicamente si el contrato soporta un vínculo inequívoco; además probar ID nulo/ausente/no firmado, ID desconocido, `transaction.reference`/SKU señuelo, ID de navegador, importe/moneda distintos, duplicados y eventos fuera de orden. Confirmar que casos sin correlación no invocan el procesador.
7. Guardar evidencia sin secretos ni datos personales: request IDs, resultado HTTP, estado antes/después y resultado de pruebas; no copiar payloads con datos sensibles a logs.

**Recursos y escrituras previstas:** proyecto Supabase dedicado de staging y deployment Preview aislado; cuenta/ambiente Wompi Sandbox, credenciales de prueba y secreto de eventos solo server-side; webhook HTTPS de staging. Las escrituras futuras incluyen migraciones/policies aprobadas, usuario Auth y fixtures sintéticos, pedido/pago/intento, payment link y transacción Sandbox, variables de Preview, registro de webhook y eventos/estados procesados. Cada grupo requiere aprobación específica. Ninguna de estas escrituras se ha realizado.

**Limpieza prevista, con aprobación:** cancelar por la API autorizada los pedidos de prueba pendientes y liberar reservas mediante el flujo existente; esperar expiración o usar una operación de anulación Sandbox documentada y aprobada para enlaces/transacciones. No editar estados ni expiraciones directamente. Retirar variables Preview y el callback Sandbox de staging solo con aprobación de limpieza. Conservar historial de idempotencia/eventos; borrar fixtures solo si las relaciones y retención lo permiten y se aprobó expresamente. No resetear ni eliminar el proyecto. Production queda fuera del plan y requiere autorización independiente.

### Preparación de E2E Sandbox real (pendiente de aprobación)

**Identificación de destino y aprobación:**

- Proyecto/base de datos Supabase de staging aislado: `Urban-Sport-Store-Staging`.
- Deployment Preview aislado con HTTPS público: `urban-sport-st-git-611c92-probandoelproyectos-projects-5992bb30`.
- Responsable aprobador: `Aprendiz code`.
- Fecha de aprobación: `2026-10-12`.

**Precondiciones:** staging aislado aprobado; deployment Preview con HTTPS público; proyecto Supabase dedicado a staging; endpoint `/api/webhooks/wompi` accesible públicamente; y cuenta Wompi Sandbox. No continuar si falta alguna condición o no se confirma el aislamiento.

**Secretos y llaves (solo nombres, valores no incluidos):** `WOMPI_ENVIRONMENT=sandbox`, `WOMPI_API_BASE_URL=https://sandbox.wompi.co/v1`, `WOMPI_PUBLIC_KEY` con prefijo `pub_test_`, `WOMPI_PRIVATE_KEY` con prefijo `prv_test_` y `WOMPI_EVENTS_SECRET` de eventos Sandbox. Configurarlos únicamente como variables server-side del backend de staging; nunca en el frontend, repositorio ni archivos locales.

**Webhook:** registrar en Wompi Sandbox una URL HTTPS pública que termine en `/api/webhooks/wompi`. No usar `localhost`.

**Bloqueo previo a crear pagos:** resolver y aprobar una correlación autenticada, única e inmutable entre transacción, payment link, intento y pedido. Si `payment_link_id` es nulo o no está firmado, debe existir un mecanismo GET garantizado que recupere el vínculo sin ambigüedad. Hasta demostrarlo, no crear pedidos, payment links ni transacciones de prueba.

**Casos E2E previstos:** aprobado; rechazado; cancelado/expirado; evento duplicado; reintento; importe o moneda incorrectos; checksum inválido; `payment_link_id` nulo, ausente o no firmado; ID desconocido; y evento sin correlación. El retorno del navegador no confirma el pago ni cambia el estado.

**Aprobaciones requeridas:** una aprobación para el destino staging; otra para configurar variables/secretos Sandbox; otra para registrar el webhook; y otra para crear pedidos, payment links y transacciones de prueba. Production queda fuera y requiere autorización independiente.

**Estado:** plan preparatorio, no ejecutado.

### Plan de verificación en Preview aislado (propuesto, no ejecutado)

**Requisitos del Preview:** entorno dedicado e independiente de Production, con dominio propio HTTPS. No debe contener secretos de Production ni conectarse a Supabase o Wompi de Production. Usar únicamente datos sintéticos y destinos Sandbox aprobados; no registrar hosts, credenciales ni valores de entorno en la evidencia.

**Aprobaciones separadas requeridas:**

1. Aprobar la creación y el despliegue del Preview aislado.
2. Aprobar la configuración de variables no sensibles requeridas por el despliegue.
3. Aprobar por separado cualquier secreto Sandbox, solo si resulta necesario; nunca reutilizar secretos de Production.
4. Aprobar la ejecución de pruebas contra ese Preview, incluidos los casos que escriben datos sintéticos o interactúan con Sandbox.

**Checklist post-deploy:**

1. Confirmar que Vercel informa exactamente 12 funciones serverless y guardar evidencia del conteo.
2. Confirmar que `/api/webhooks/wompi` aparece como función independiente y no se enruta por `/api/orders`.
3. Para cada ruta del mapa, enviar el método, query string, body y headers previstos; verificar el ID/acción que recibe el dispatcher y comprobar códigos y cuerpos de éxito y error. Cubrir `POST /api/auth/login`, `POST /api/auth/register`, `GET/PATCH/DELETE /api/admin/categories/:categoryId`, `PATCH/DELETE /api/admin/products/:productId`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel`, `POST /api/orders/:id/payment-session` y `POST /api/webhooks/wompi`.
4. Verificar específicamente que los rewrites mantienen método HTTP, body, headers relevantes y query strings originales al añadir los parámetros de despacho.
5. Usar exclusivamente usuarios y registros sintéticos aprobados; comprobar limpieza conforme al plan Sandbox y conservar evidencia sin secretos ni datos personales.

**Criterio de fallo:** si Vercel detecta más o menos de 12 funciones, el webhook deja de ser independiente, una ruta cambia su contrato o un rewrite altera método, body, headers o query string, detener las pruebas y revertir el despliegue de Preview. No continuar hacia Production.

**Estado:** plan de Preview propuesto, no ejecutado.
