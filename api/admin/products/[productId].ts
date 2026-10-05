import { jsonError, jsonResponse, jsonSupabaseError, ApiError } from '../../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.ts';
import { requirePermission } from '../../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../../lib/api-helpers/auth.ts';
import { normalizeProductUpdates } from '../../../lib/api-helpers/product-helpers.ts';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PRODUCT_STORAGE_BUCKET = 'products';
const PRODUCT_STORAGE_LOOKUP_PAGE_SIZE = 1000;

function getProductStoragePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();
  if (candidate.startsWith(`${PRODUCT_STORAGE_BUCKET}/`)) return candidate;

  try {
    const pathname = new URL(candidate).pathname;
    for (const accessType of ['public', 'sign', 'authenticated']) {
      const marker = `/storage/v1/object/${accessType}/${PRODUCT_STORAGE_BUCKET}/`;
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex < 0) continue;
      const path = pathname.slice(markerIndex + marker.length);
      return decodeURIComponent(path);
    }
  } catch {
    return null;
  }

  return null;
}

function getProductStoragePaths(product: any, imageRows: any[] = []): string[] {
  const values = [product.main_image, product.image, ...(Array.isArray(product.images) ? product.images : []), ...imageRows.map((row) => row.path)];
  return [...new Set(values.map(getProductStoragePath).filter((path): path is string => Boolean(path)))];
}

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new ApiError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function extractProductId(req: any): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await requireAuthenticatedUser(req);

    const productId = extractProductId(req);
    if (!productId) {
      throw new ApiError(400, 'Missing productId');
    }
    if (!UUID_PATTERN.test(productId)) {
      throw new ApiError(400, 'Invalid productId.');
    }

    const permission = req.method === 'PATCH'
      ? 'products.write'
      : req.method === 'DELETE'
        ? 'products.archive'
        : null;
    if (!permission) return jsonError(res, 405, 'Method not allowed.');
    await requirePermission(user, permission);

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'Request body must be an object.');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
        if (Object.keys(body).length !== 1 || typeof body.is_active !== 'boolean') {
          throw new ApiError(400, 'Availability updates must contain only a boolean is_active field.');
        }

        const { data: beforeData, error: beforeError } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('id', productId)
          .maybeSingle();
        if (beforeError) {
          return jsonSupabaseError(res, '[Admin Products] Product lookup before availability update failed', beforeError, 'Unable to load product before updating availability.');
        }
        if (!beforeData) {
          return jsonError(res, 404, 'Product not found.');
        }

        const { data, error } = await supabaseAdmin
          .from('products')
          .update({ is_active: body.is_active })
          .eq('id', productId)
          .select('*')
          .maybeSingle();
        if (error) {
          return jsonSupabaseError(res, '[Admin Products] Product availability update failed', error, 'Unable to update product availability.');
        }
        if (!data) {
          return jsonError(res, 404, 'Product not found.');
        }

        await supabaseAdmin.from('audit_logs').insert({
          actor_id: user.id,
          action: body.is_active ? 'activate_product' : 'deactivate_product',
          entity: 'product',
          entity_id: productId,
          entity_id_uuid: productId,
          before_data: beforeData,
          after_data: data,
        });

        return jsonResponse(res, { data });
      }

      const updates = await normalizeProductUpdates(body);
      if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'No update fields provided');
      }

      // Get before state
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (beforeError) {
        return jsonSupabaseError(res, '[Admin Products] Product lookup before update failed', beforeError, 'Unable to load product before update.');
      }
      if (!beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      if ('main_image' in updates || 'images' in updates) {
        const mainImage = updates.main_image ?? beforeData.main_image;
        const images = updates.images ?? beforeData.images;
        if (!mainImage && !(Array.isArray(images) && images.length > 0)) {
          throw new ApiError(400, 'El producto debe conservar al menos una imagen.');
        }
      }

      const { data, error } = await supabaseAdmin.from('products').update(updates).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonSupabaseError(res, '[Admin Products] Product update failed', error, 'Unable to update product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'update_product',
        entity: 'product',
        entity_id: productId,
        entity_id_uuid: productId,
        before_data: beforeData,
        after_data: data,
      });

      return jsonResponse(res, { data });
    }

    if (req.method === 'DELETE') {
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (beforeError) {
        return jsonSupabaseError(res, '[Admin Products] Product lookup before archive failed', beforeError, 'Unable to load product before archive.');
      }
      if (!beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      const { data: productImageRows, error: imageRowsError } = await supabaseAdmin
        .from('product_images')
        .select('path')
        .eq('product_id', productId);
      if (imageRowsError) {
        return jsonSupabaseError(res, '[Admin Products] Product image lookup before delete failed', imageRowsError, 'Unable to load product images before deletion.');
      }
      const candidateStoragePaths = getProductStoragePaths(beforeData, productImageRows ?? []);
      const sharedStoragePaths = new Set<string>();
      const orderImagePaths: string[] = [];
      const categoryImagePaths: string[] = [];

      const orderImageRows: any[] = [];
      for (let offset = 0; ; offset += PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) {
        const { data: page, error } = await supabaseAdmin
          .from('order_items')
          .select('image_path')
          .eq('product_id', productId)
          .order('id', { ascending: true })
          .range(offset, offset + PRODUCT_STORAGE_LOOKUP_PAGE_SIZE - 1);
        if (error) {
          return jsonSupabaseError(res, '[Admin Products] Product order image lookup failed', error, 'Unable to check historical order images.');
        }
        orderImageRows.push(...(page ?? []));
        if (!page || page.length < PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) break;
      }
      for (const orderItem of orderImageRows) {
        const path = getProductStoragePath(orderItem.image_path);
        if (path && candidateStoragePaths.includes(path)) {
          sharedStoragePaths.add(path);
          orderImagePaths.push(path);
        }
      }

      const categoryRows: any[] = [];
      for (let offset = 0; ; offset += PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) {
        const { data: page, error } = await supabaseAdmin
          .from('categories')
          .select('image, image_url')
          .order('id', { ascending: true })
          .range(offset, offset + PRODUCT_STORAGE_LOOKUP_PAGE_SIZE - 1);
        if (error) {
          return jsonSupabaseError(res, '[Admin Products] Shared category image lookup failed', error, 'Unable to check shared category images.');
        }
        categoryRows.push(...(page ?? []));
        if (!page || page.length < PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) break;
      }
      for (const category of categoryRows) {
        for (const imageValue of [category.image, category.image_url]) {
          const path = getProductStoragePath(imageValue);
          if (path && candidateStoragePaths.includes(path)) {
            sharedStoragePaths.add(path);
            categoryImagePaths.push(path);
          }
        }
      }

      if (candidateStoragePaths.length > 0) {
        const { data: sharedImageRows, error: sharedImageRowsError } = await supabaseAdmin
          .from('product_images')
          .select('path')
          .in('path', candidateStoragePaths)
          .neq('product_id', productId);
        if (sharedImageRowsError) {
          return jsonSupabaseError(res, '[Admin Products] Shared product image lookup failed', sharedImageRowsError, 'Unable to check shared product images.');
        }
        for (const imageRow of sharedImageRows ?? []) {
          const path = getProductStoragePath(imageRow.path);
          if (path) sharedStoragePaths.add(path);
        }

        for (let offset = 0; ; offset += PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) {
          const { data: otherProducts, error: otherProductsError } = await supabaseAdmin
            .from('products')
            .select('main_image, images')
            .neq('id', productId)
            .order('id', { ascending: true })
            .range(offset, offset + PRODUCT_STORAGE_LOOKUP_PAGE_SIZE - 1);
          if (otherProductsError) {
            return jsonSupabaseError(res, '[Admin Products] Shared product image lookup failed', otherProductsError, 'Unable to check shared product images.');
          }

          for (const otherProduct of otherProducts ?? []) {
            for (const path of getProductStoragePaths(otherProduct)) {
              if (candidateStoragePaths.includes(path)) sharedStoragePaths.add(path);
            }
          }
          if (!otherProducts || otherProducts.length < PRODUCT_STORAGE_LOOKUP_PAGE_SIZE) break;
        }
      }

      const sharedPaths = [...sharedStoragePaths];
      const storagePaths = candidateStoragePaths.filter((path) => !sharedStoragePaths.has(path));

      const { data, error } = await supabaseAdmin
        .from('products')
        .delete()
        .eq('id', productId)
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '23503') {
          return jsonError(res, 409, 'No se puede eliminar permanentemente porque el producto tiene carritos u otros registros asociados. Utiliza "Desactivar producto" en su lugar.');
        }
        return jsonSupabaseError(res, '[Admin Products] Product delete failed', error, 'Unable to delete product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      const storageCleanup: {
        status: 'completed' | 'failed';
        attempted_paths: string[];
        removed_paths: string[];
        shared_paths: string[];
        error?: string;
      } = {
        status: 'completed',
        attempted_paths: storagePaths,
        removed_paths: storagePaths,
        shared_paths: sharedPaths,
      };

      if (storagePaths.length > 0) {
        try {
          const { data: removedFiles, error: storageError } = await supabaseAdmin.storage
            .from(PRODUCT_STORAGE_BUCKET)
            .remove(storagePaths);
          if (storageError) {
            storageCleanup.status = 'failed';
            storageCleanup.error = typeof storageError.message === 'string' ? storageError.message : 'Storage rechazó la limpieza.';
            storageCleanup.removed_paths = (removedFiles ?? []).flatMap((file: any) => typeof file?.name === 'string' ? [file.name] : []);
          }
        } catch (storageError: any) {
          storageCleanup.status = 'failed';
          storageCleanup.error = typeof storageError?.message === 'string' ? storageError.message : 'Falló la limpieza de Storage.';
          storageCleanup.removed_paths = [];
        }
      }

      const afterData = { id: productId, deleted: true, storage_cleanup: storageCleanup };
      const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'delete_product',
        entity: 'product',
        entity_id: productId,
        entity_id_uuid: productId,
        before_data: {
          ...beforeData,
          product_image_paths: (productImageRows ?? []).map((row: any) => row.path).filter(Boolean),
          order_image_paths: [...new Set(orderImagePaths)],
          category_image_paths: [...new Set(categoryImagePaths)],
        },
        after_data: afterData,
      });
      if (auditError) {
        console.error('[Admin Products] Product deletion audit insert failed', {
          code: auditError.code,
          message: auditError.message,
          productId,
        });
      }

      if (storageCleanup.status === 'failed' || auditError || sharedPaths.length > 0) {
        return jsonResponse(res, {
          data: {
            ...afterData,
            audit_recorded: !auditError,
          },
        }, 207);
      }

      res.statusCode = 204;
      return res.end();
    }

    return jsonError(res, 405, 'Method not allowed.');
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    if (error && typeof error === 'object' && 'code' in error) {
      return jsonSupabaseError(res, '[Admin Products] Request failed', error, 'Unable to handle product request.');
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
