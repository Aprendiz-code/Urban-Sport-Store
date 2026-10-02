# Flujo local de administración de categorías y productos

Esta guía valida el flujo sin tocar datos remotos ni crear registros reales en Supabase.

## 1) Iniciar backend local

```bash
cd api
npm install
npm run dev
```

El servicio debe quedar disponible en:

```text
http://127.0.0.1:3000
```

## 2) Verificar health check

```bash
curl http://127.0.0.1:3000/api/health
```

Respuesta esperada:

```json
{ "ok": true, "service": "urbansport-api" }
```

## 3) Iniciar frontend local

Desde la raíz del proyecto:

```bash
pnpm install
pnpm dev
```

El frontend quedará en:

```text
http://127.0.0.1:5173
```

## 4) Variables y configuración esperadas

Sin mostrar secretos ni credenciales, la configuración segura es:

```env
VITE_API_URL=http://127.0.0.1:3000/api
```

La prioridad de resolución en Vite es:

1. `.env.local`
2. `.env.development`
3. `.env`

La app usa proxy local en Vite para `/api` hacia `http://127.0.0.1:3000`, y el backend local responde con CORS para `localhost` y `127.0.0.1` en el puerto 5173.

## 5) Flujo manual de administración

1. Inicia sesión con un usuario administrador real.
2. Abre el panel de administración.
3. En la sección de categorías, verifica que se cargan las categorías reales del backend.
4. Comprueba que cada opción muestra `category.name` en el selector y que el valor interno es `category.id`.
5. Abre el formulario de producto.
6. Selecciona una categoría y comprueba que el valor persiste como UUID de la categoría.
7. Intenta guardar con categoría vacía y verás el mensaje: `Selecciona una categoría válida.`
8. Intenta guardar con el backend apagado y verifica que el mensaje de conexión sea claro.
9. No crees ni edites registros reales en Supabase durante la prueba.

## 6) Validaciones importantes

- El formulario debe bloquear guardar si `category_id` no es un UUID válido.
- El campo de categoría debe estar vacío o inválido por defecto antes de elegir una categoría.
- El selector solo debe habilitar la creación de productos cuando haya categorías cargadas.
- Si la carga de categorías falla, la UI debe mostrar un mensaje de error y no permitir guardar.

## 7) Recomendación de comprobación local

```bash
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/categories
curl -i http://127.0.0.1:3000/api/products
```

Estas peticiones son solo lectura y no escriben datos remotos.

## 8) Resumen de campos obligatorios del formulario

- Nombre
- SKU
- Precio mayor que 0
- Stock mayor o igual a 0
- category_id UUID válido
- Imagen principal o al menos una imagen en galería

## 9) Reglas de seguridad para esta validación

- No ejecutes `supabase db push`.
- No uses `SUPABASE_SERVICE_ROLE_KEY` en scripts de prueba.
- No modifiques categorías o productos reales de Supabase.
- No ejecutes migraciones ni despliegues.
