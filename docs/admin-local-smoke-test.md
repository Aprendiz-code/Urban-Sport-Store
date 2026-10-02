# Smoke test manual local: admin, categorías y formulario de producto

Este documento describe una comprobación visual y manual del panel admin en local. No autoriza la creación real de productos ni la escritura en Supabase. El objetivo es validar la UX, validaciones, mensajes y recuperación ante errores sin tocar datos remotos ni ejecutar migraciones.

## 1) Pre-requisitos

- Backend local ejecutándose en el puerto correcto.
- Frontend local ejecutándose en el puerto correcto.
- Health check respondiendo con `200 OK`.
- Usuario administrador real disponible y activo.
- Navegador en modo incógnito recomendado para evitar sesiones previas.

## 2) URLs exactas

Usar estas rutas en local:

- Frontend local: `http://127.0.0.1:5173`
- Backend health check: `http://127.0.0.1:3000/api/health`
- Login: `http://127.0.0.1:5173/login`
- Admin: `http://127.0.0.1:5173/admin`
- Sección de categorías: `http://127.0.0.1:5173/admin?adminSection=categories` o la sección equivalente dentro del panel admin si la UI la expone como vista interna.
- Sección de crear producto: `http://127.0.0.1:5173/admin?adminSection=products` o la opción de “Nuevo producto” dentro del panel.

> Si la navegación del proyecto usa rutas internas o query params distintos, seguir la estructura visual del panel admin y apuntar a la misma sección funcional. No cambiar puertos ni rutas del proyecto.

## 3) Smoke tests de autenticación

### 3.1 Usuario no autenticado no debe acceder a admin

- Abrir `http://127.0.0.1:5173/admin` en modo incógnito.
- Verificar que la aplicación redirige o muestra una pantalla de acceso.
- Confirmar que no se ve el dashboard admin ni contenido de administración.
- Registrar resultado: pasa/falla.

### 3.2 Usuario normal no debe administrar productos

- Iniciar sesión con un usuario autenticado no administrador.
- Intentar abrir la sección admin o de productos.
- Confirmar que la UI bloquea el acceso o muestra mensaje de permisos.
- Registrar resultado: pasa/falla.

### 3.3 Usuario admin activo puede abrir dashboard

- Iniciar sesión con el usuario administrador real.
- Abrir `http://127.0.0.1:5173/admin`.
- Confirmar que aparece el dashboard del panel admin.
- Registrar resultado: pasa/falla.

### 3.4 Logout elimina acceso visual

- Hacer logout desde la UI.
- Intentar acceder a la ruta admin nuevamente.
- Confirmar que desaparece el acceso al dashboard y vuelve al flujo de login o acceso restringido.
- Registrar resultado: pasa/falla.

### 3.5 Recargar la página conserva o restaura sesión según el flujo real

- Iniciar sesión como admin.
- Recargar `http://127.0.0.1:5173/admin`.
- Confirmar que la aplicación mantiene o restaura la sesión según el comportamiento real del proyecto.
- No pedir ni mostrar tokens ni credenciales.
- Registrar resultado: pasa/falla.

## 4) Smoke tests de categorías

### 4.1 La lista carga

- Abrir la sección de categorías del panel admin.
- Confirmar que aparecen categorías en la interfaz.
- Revisar que no hay estado de carga infinito o pantalla vacía sin explicación.
- Registrar resultado: pasa/falla.

### 4.2 Los nombres se ven correctamente

- Comprobar que cada categoría muestra su nombre legible y no un identificador técnico.
- Verificar que el texto visible corresponde a `category.name`.
- Registrar resultado: pasa/falla.

### 4.3 Si hay error, aparece un mensaje legible

- Simular o confirmar caso de carga fallida (por ejemplo, backend apagado o respuesta no disponible).
- Verificar que se vea un mensaje claro, breve y legible para el usuario.
- No mostrar stack traces ni secretos.
- Registrar resultado: pasa/falla.

### 4.4 No se usa UUID como texto visible

- Inspeccionar visualmente la lista.
- Confirmar que los nombres visibles no son UUIDs ni identificadores internos.
- Registrar resultado: pasa/falla.

### 4.5 El selector de producto muestra `category.name`

- Abrir el formulario de crear producto.
- Revisar el selector de categoría.
- Confirmar que el usuario ve nombres legibles, no UUIDs.
- Registrar resultado: pasa/falla.

## 5) Smoke tests del formulario de producto sin guardar

### 5.1 Abrir formulario

- Abrir la sección de productos.
- Pulsar “Nuevo producto” o equivalente.
- Confirmar que se abre el formulario de creación.
- Registrar resultado: pasa/falla.

### 5.2 Confirmar campos obligatorios

Revisar que el formulario tenga los campos mínimos esperados:
- Nombre
- SKU
- Precio
- Stock
- Categoría
- Imagen principal o galería visible

Registrar resultado: pasa/falla.

### 5.3 Intentar enviar vacío

- Dejar el formulario vacío.
- Pulsar guardar o enviar.
- Confirmar que la validación bloquea la acción.
- Registrar resultado: pasa/falla.

### 5.4 Confirmar validación de nombre

- Dejar el nombre vacío.
- Intentar guardar.
- Confirmar que aparece error de nombre requerido.
- Registrar resultado: pasa/falla.

### 5.5 Confirmar validación de SKU

- Completar nombre pero dejar SKU vacío.
- Intentar guardar.
- Confirmar que aparece error de SKU requerido.
- Registrar resultado: pasa/falla.

### 5.6 Confirmar validación de categoría

- Dejar categoría sin seleccionar.
- Intentar guardar.
- Confirmar que aparece error de categoría inválida o requerida.
- Registrar resultado: pasa/falla.

### 5.7 Confirmar validación de precio 0

- Poner precio `0` o dejarlo en 0.
- Intentar guardar.
- Confirmar que aparece error de precio mayor a 0.
- Registrar resultado: pasa/falla.

### 5.8 Confirmar validación de stock negativo

- Poner stock negativo.
- Intentar guardar.
- Confirmar que aparece error de stock negativo.
- Registrar resultado: pasa/falla.

### 5.9 Confirmar validación de imagen requerida

- Completar los demás campos y dejar sin imagen.
- Intentar guardar.
- Confirmar que aparece error indicando que se requiere una imagen.
- Registrar resultado: pasa/falla.

### 5.10 Elegir una categoría y verificar texto visible

- Seleccionar una categoría del dropdown.
- Confirmar que el texto visible es el nombre de la categoría, no un UUID.
- Verificar que la UI refleja la selección clara y consistente.
- Registrar resultado: pasa/falla.

### 5.11 Inspeccionar visualmente el value interno sin enviar el formulario

- Usar las herramientas del navegador para inspeccionar el control select o el formulario.
- Comprobar que el valor seleccionado corresponde al identificador interno (`category.id` UUID) y no al texto visible.
- Confirmar que el formulario usa el UUID internamente para la lógica de persistencia, aunque el usuario vea el nombre.
- No enviar el formulario ni guardar nada.
- Registrar resultado: pasa/falla.

## 6) Smoke test de error de red

### 6.1 Detener backend local

- Apagar el backend local.
- Mantener el frontend abierto en el navegador.

### 6.2 Intentar abrir/admin o disparar acción no destructiva

- Intentar entrar a la sección admin o categoría/producto.
- Disparar una acción sin escritura, por ejemplo abrir una vista o cargar la lista.
- Confirmar que aparece un mensaje amigable de conexión o error de carga.

### 6.3 Verificar claridad del mensaje

- Comprobar que no aparecen stack traces, secretos, headers, tokens ni trazas internas.
- Confirmar que el mensaje es legible para el usuario final.
- Registrar resultado: pasa/falla.

### 6.4 Reiniciar backend

- Levantar de nuevo el backend local.
- Volver a la UI.
- Confirmar que la interfaz se recupera y vuelve a funcionar.
- Registrar resultado: pasa/falla.

## 7) Smoke test móvil

Probar en al menos estos anchos:
- 320 px
- 360 px
- 375 px
- 390 px
- 430 px

### Validaciones en móvil

- Botones con tamaño mínimo de 44 px.
- Inputs y selects visibles y no cortados.
- Validaciones y mensajes no quedan ocultos.
- Panel admin sin scroll horizontal involuntario.
- Formularios y listas siguen legibles y navegables.
- Registrar resultado: pasa/falla.

## 8) Checklist de resultados

Usar esta plantilla durante la prueba:

- [ ] Backend local en ejecución
- [ ] Frontend local en ejecución
- [ ] Health check responde `200 OK`
- [ ] Usuario admin disponible
- [ ] Navegador en incógnito recomendado
- [ ] Login correcto
- [ ] Acceso admin con usuario autenticado
- [ ] Acceso denegado a usuario no admin
- [ ] Logout borra acceso visual
- [ ] Recarga mantiene o restaura sesión según flujo real
- [ ] Categorías cargan
- [ ] Nombres visibles y legibles
- [ ] Error de carga muestra mensaje amigable
- [ ] No se muestran UUIDs como texto visible
- [ ] Selector de producto usa `category.name`
- [ ] Formulario abre correctamente
- [ ] Validación de nombre
- [ ] Validación de SKU
- [ ] Validación de categoría
- [ ] Validación de precio 0
- [ ] Validación de stock negativo
- [ ] Validación de imagen requerida
- [ ] Selección de categoría conserva nombre visible con UUID interno
- [ ] Error de red muestra mensaje amigable
- [ ] Recuperación tras reinicio del backend
- [ ] Layout móvil correcto en 320/360/375/390/430 px
- [ ] Botones mínimos 44 px
- [ ] Sin scroll horizontal involuntario

### Observaciones

- ¿Qué fue visible?:
- ¿Hubo algún bloqueo visual?:
- ¿La acción se comportó como se esperaba?:

### Error de consola

- Error observado (sin copiar datos sensibles):
- Endpoint afectado (solo status + ruta, sin headers ni tokens):
- Mensaje de usuario visible:

### Request fallida

- Status: 
- Endpoint: 
- Metodo: 
- Resultado esperado: 
- Resultado real: 

## 9) Criterio final

Este smoke test valida la experiencia visual y funcional del panel admin en local. No autoriza la creación, edición ni eliminación real de productos en Supabase.

La creación real de productos queda bloqueada hasta:
- rotar secretos y credenciales,
- reconciliar el historial de migraciones,
- validar políticas y permisos remotos,
- y realizar la operación con el proceso y seguridad correctos.

Este smoke test es solo de verificación local de interfaz y validaciones, no de persistencia real.
