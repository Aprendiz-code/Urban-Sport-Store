import adminApi from './admin-api';

export function createProductViaAdminApi(adminPayload: Record<string, unknown>) {
  return adminApi.createProductApi(adminPayload as any);
}

export function updateProductViaAdminApi(productId: string, adminUpdates: Record<string, unknown>) {
  return adminApi.updateProductApi(productId, adminUpdates as any);
}

export function deleteProductViaAdminApi(productId: string) {
  return adminApi.deleteProductApi(productId);
}
