# Asistente Urban Sport

## Arquitectura

- El frontend monta una sola instancia de `src/app/components/ShoppingAssistant.tsx` desde `src/app/App.tsx`.
- `POST /api/assistant/chat` funciona en el servidor local mediante `api/index.ts` y en Vercel mediante `api/assistant.ts`.
- Vercel reescribe `/api/assistant/chat` a `/api/assistant`; la regla SPA no debe procesar esa petición.
- Las búsquedas por talla, presupuesto, marca y categoría se resuelven desde `/api/products` sin Groq.
- Las consultas comparativas o interpretativas pueden usar Groq. Solo se envían una pregunta corta, hasta cuatro mensajes de contexto mínimo y hasta tres productos reales.
- El chatbot no modifica el carrito, el checkout ni crea pedidos.
- Las tallas del catálogo se presentan como "tallas listadas". El proyecto no confirma inventario por variante.

## Variables del servidor

Solo configura estas variables en el servidor, sin prefijo `VITE_`:

```env
GROQ_API_KEY=
GROQ_MODEL=
```

No uses el valor de `GROQ_API_KEY` en el frontend ni lo copies a archivos versionados. `api/.env.example` contiene nombres ficticios, no credenciales.

No pudimos verificar mediante la red de esta sesión qué modelos están habilitados en tu cuenta ni sus límites Free. Por eso el proyecto no fija ningún identificador. En Groq Cloud debes:

1. Abrir Projects y la clave API asociada al proyecto correcto.
2. Abrir Models o Playground y confirmar los modelos disponibles para esa cuenta.
3. Copiar exactamente el identificador mostrado, por ejemplo un identificador de chat compatible con `chat/completions`.
4. Asignarlo al valor de `GROQ_MODEL` en Vercel.
5. Confirmar la cuota Free, los límites por minuto y por día antes de realizar una prueba real.

No se activan pagos ni facturación desde esta implementación.

## Prueba local

En una terminal:

```powershell
pnpm run dev
```

En otra terminal:

```powershell
cd api
$env:GROQ_API_KEY=""
$env:GROQ_MODEL=""
pnpm run dev
```

Sin clave o modelo, el chat responde desde catálogo, políticas o respaldo. Para una prueba real local:

```powershell
cd api
$env:GROQ_API_KEY="tu-clave-secreta-del-servidor"
$env:GROQ_MODEL="identificador-copiado-de-groq"
pnpm run dev
```

No imprimas ni ejecutes la clave en los logs.

## Pruebas locales

```powershell
pnpm test
pnpm run typecheck
pnpm --dir api run typecheck
pnpm run e2e -- shopping-assistant.spec.ts
```

Las pruebas del endpoint simulan Groq con respuestas HTTP controladas. No prueban una cuenta real ni consumen cuota.

## Validación real en Vercel Preview

1. En Vercel, abrir Settings → Environment Variables.
2. Confirmar que `GROQ_API_KEY` existe y está asignada a Preview; no asignarla a frontend.
3. Confirmar `GROQ_MODEL` en Preview con el identificador vigente copiado de tu cuenta Groq.
4. Confirmar que la variable corresponde al proyecto de este repositorio y a la rama usada por el Preview.
5. Si la rama crea un Preview nuevo, forzar un redeploy tras guardar las variables.
6. Abrir el Preview y enviar una consulta comparativa que requiera interpretación.
7. Revisar la etiqueta visible: `Groq`, `Catálogo`, `Política verificable` o `Respuesta de respaldo`.
8. Probar también sin clave usando un Preview separado o quitando temporalmente la configuración, sin subir secretos al repositorio.
9. Para errores HTTP 429, timeout o proveedor caído, confirmar que el chat muestra opciones locales o respaldo y mantiene WhatsApp.

En Vercel, el contador por IP es una protección best-effort dentro de cada instancia. No se presenta como límite distribuido entre instancias.

## Envíos, pagos y cambios

La implementación no muestra un umbral de envío gratis hasta que una única política vigente lo confirme. No usa el texto antiguo de `$300.000` ni de `$250.000` como dato confirmado.

- Envíos: cobertura, tarifa y plazo se confirman con la cotización vigente para destino y artículos.
- Cambios/devoluciones: referencia a 30 días desde la entrega y condiciones del empaque.
- Seguimiento, reclamos y garantías: derivación a WhatsApp; el chat no afirma haber consultado el pedido.
- Pagos: no solicita ni registra tarjetas, contraseñas o documentos.

## WhatsApp

El panel mantiene visible:

`https://wa.me/573157760273?text=Hola%2C%20vengo%20de%20Urban%20Sport%20Store%20y%20necesito%20ayuda%20con%20una%20compra.`

El enlace solo prepara el mensaje. No envía el mensaje ni adjunta el historial.
