export function resolveApiBaseUrl(inputUrl?: string): string {
  const configured = (inputUrl ?? import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

  if (!configured) {
    if (import.meta.env.DEV) {
      throw new Error('VITE_API_URL no está configurado. Define la URL del backend local, por ejemplo: http://127.0.0.1:3000/api');
    }
    return '/api';
  }

  const normalized = configured.replace(/\/index$/i, '');

  if (normalized.includes('/api')) {
    const apiIndex = normalized.lastIndexOf('/api');
    const base = normalized.slice(0, apiIndex);
    return `${base}/api`;
  }

  return `${normalized}/api`;
}

export function buildApiUrl(path: string, inputUrl?: string): string {
  const baseUrl = resolveApiBaseUrl(inputUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
