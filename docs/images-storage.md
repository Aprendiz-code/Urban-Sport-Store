# Almacenamiento de imágenes

**Flujo de imágenes de productos:** el formulario administrativo selecciona y previsualiza archivos locales, y los envía al guardar mediante `POST /api/admin/product-images`. El endpoint existente exige sesión Bearer vigente y permiso `products.write`, valida MIME, firma y tamaño (5 MB), sube al bucket `products` y devuelve el path. La UI convierte ese path en URL pública con el cliente configurado y guarda `main_image` más `images` como un arreglo de URLs permanentes. La disponibilidad real depende de que el backend tenga Supabase Storage configurado y los permisos efectivos del bucket permitan la operación.

El límite es de **10 imágenes adicionales** en `images`, además de una imagen principal en `main_image` (11 fotos totales como máximo). Quitar una foto en el formulario solo elimina su referencia del producto; no borra objetos de Storage.

Si el upload termina pero falla el guardado de metadata, el archivo queda huérfano en Storage. El formulario conserva las URLs ya subidas para permitir reintentar sin repetir esos uploads. No se ejecuta limpieza automática: identificar referencias sin uso requiere auditar productos y archivos compartidos, disponer de backup y revisar manualmente antes de cualquier eliminación.

Las pruebas locales no verifican una creación autorizada real, persistencia tras recargar ni disponibilidad de las URLs en producción.

## Adaptador filesystem local

`lib/server/storage-provider.ts` contiene `LocalStorageProvider` para un servidor con filesystem persistente. El adaptador:

- acepta JPEG, PNG y WebP validando firmas básicas de bytes y MIME declarado;
- limita archivos a 5 MB;
- genera nombres UUID sin reutilizar el nombre recibido;
- restringe áreas a productos, categorías y banners;
- valida las rutas de borrado para evitar path traversal;
- devuelve `publicPath: null` porque todavía no hay una ruta de lectura/servido de archivos.

El adaptador está probado en directorios temporales, pero no está conectado a endpoints ni a la UI. **No usarlo en funciones serverless de Vercel:** su filesystem puede ser efímero y no constituye almacenamiento durable. Antes de conectarlo se necesita un servidor/volumen persistente, backup, antivirus/escaneo según riesgo y una ruta pública/privada con control de acceso adecuado.

## Proveedor Supabase Storage

`SupabaseStorageProvider` está preparado como tipo/clase no configurada y rechaza operaciones. El endpoint administrativo de imágenes usa el cliente server-side autenticado, no esa clase. El endpoint no crea buckets. Antes de habilitar o diagnosticar un proyecto se necesita:

- reconciliar migraciones y verificar las policies Storage efectivas;
- endpoint backend autenticado y autorizado mediante perfil activo;
- whitelist de bucket/paths, límite de tamaño, MIME verificado y auditoría;
- nunca exponer service-role/secret key al browser ni usar `VITE_*` para secretos.

No quitar referencias de imágenes existentes hasta verificar que no estén usadas por catálogo/home y disponer de backup. Cargar metadata y servir archivos son operaciones distintas.
