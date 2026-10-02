# Almacenamiento de imágenes

**Estado actual:** las operaciones de carga/borrado desde el navegador están desactivadas. Las imágenes existentes pueden seguir mostrándose por URL/ruta registrada, pero no se afirma que una nueva carga funcione.

## Adaptador filesystem local

`lib/server/storage-provider.ts` contiene `LocalStorageProvider` para un servidor con filesystem persistente. El adaptador:

- acepta JPEG, PNG y WebP validando firmas básicas de bytes y MIME declarado;
- limita archivos a 5 MB;
- genera nombres UUID sin reutilizar el nombre recibido;
- restringe áreas a productos, categorías y banners;
- valida las rutas de borrado para evitar path traversal;
- devuelve `publicPath: null` porque todavía no hay una ruta de lectura/servido de archivos.

El adaptador está probado en directorios temporales, pero no está conectado a endpoints ni a la UI. **No usarlo en funciones serverless de Vercel:** su filesystem puede ser efímero y no constituye almacenamiento durable. Antes de conectarlo se necesita un servidor/volumen persistente, backup, antivirus/escaneo según riesgo y una ruta pública/privada con control de acceso adecuado.

## Alternativa Supabase Storage

`SupabaseStorageProvider` está preparado como tipo/clase no configurada y rechaza operaciones. No crea buckets ni sube/baja archivos. Para activarlo se necesita:

- reconciliar migraciones y verificar las policies Storage efectivas;
- endpoint backend autenticado y autorizado mediante perfil activo;
- whitelist de bucket/paths, límite de tamaño, MIME verificado y auditoría;
- nunca exponer service-role/secret key al browser ni usar `VITE_*` para secretos.

No quitar referencias de imágenes existentes hasta verificar que no estén usadas por catálogo/home y disponer de backup. Cargar metadata y servir archivos son operaciones distintas.
