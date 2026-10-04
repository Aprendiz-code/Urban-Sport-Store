import { randomUUID } from 'node:crypto';
import { jsonError, jsonResponse, jsonSupabaseError, ApiError } from './response.js';
import { supabaseAdmin } from './supabase.js';
import { requirePermission } from './admin.js';
import { requireAuthenticatedUser } from './auth.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', signature: (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/png', { extension: 'png', signature: (bytes: Buffer) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
  ['image/webp', { extension: 'webp', signature: (bytes: Buffer) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' }],
]);

export function resolveProductStorageBucket(configuredBucket = process.env.SUPABASE_STORAGE_BUCKET): string {
  return configuredBucket?.trim() || 'products';
}

function readImageBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_IMAGE_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(buffer);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new ApiError(413, 'La imagen no puede superar 5 MB.'));
      } else if (size === 0) {
        reject(new ApiError(400, 'Selecciona una imagen para subir.'));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', reject);
  });
}

export async function handleProductImageUpload(req: any, res: any) {
  try {
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed.');
    const user = await requireAuthenticatedUser(req);
    await requirePermission(user, 'products.write');
    if (!supabaseAdmin) throw new ApiError(503, 'El almacenamiento de imágenes no está configurado.');

    const contentType = String(req.headers?.['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const imageType = IMAGE_TYPES.get(contentType);
    if (!imageType) throw new ApiError(415, 'Formato no permitido. Usa JPG, PNG o WebP.');

    const bytes = await readImageBody(req);
    if (!imageType.signature(bytes)) throw new ApiError(415, 'El contenido no coincide con el formato de imagen indicado.');

    const bucket = resolveProductStorageBucket();
    const path = `products/${randomUUID()}.${imageType.extension}`;
    const { data, error } = await supabaseAdmin.storage.from(bucket).upload(path, bytes, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) return jsonSupabaseError(res, '[Admin Products] Storage upload failed', error, 'No se pudo subir la imagen.');

    return jsonResponse(res, { data: { path: data.path } }, 201);
  } catch (error: any) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    if (error && typeof error === 'object' && 'code' in error) {
      return jsonSupabaseError(res, '[Admin Products] Storage request failed', error, 'No se pudo subir la imagen.');
    }
    return jsonError(res, 500, error?.message ?? 'No se pudo subir la imagen.');
  }
}