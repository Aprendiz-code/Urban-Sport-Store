import { resolveApiBaseUrl } from './api-config';

export async function subscribeToNewsletter(email: string): Promise<void> {
  const apiRoot = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

  const response = await fetch(`${apiRoot}/newsletter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source: "homepage" }),
  });
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "No se pudo registrar el correo. Intenta nuevamente.");
  }
}