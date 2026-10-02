export function resolveApiBaseUrl(inputUrl?: string): string {
  const configured = inputUrl?.trim().replace(/\/+$/, '') ?? import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

  if (!configured) {
    if (import.meta.env.DEV) {
      throw new Error('VITE_API_URL no está configurado. Define la URL del backend local, por ejemplo: http://127.0.0.1:3000/api');
    }
    return '/api';
  }

  if (configured.endsWith('/api')) return configured;
  if (configured.endsWith('/api/v1')) return configured.replace(/\/v1$/, '');
  return `${configured}/api`;
}

export function buildApiUrl(path: string, inputUrl?: string): string {
  const baseUrl = resolveApiBaseUrl(inputUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
