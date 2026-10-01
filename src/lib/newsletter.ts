export async function subscribeToNewsletter(email: string): Promise<void> {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
  const apiRoot = !configuredApiUrl
    ? "/api"
    : configuredApiUrl.endsWith("/api")
      ? configuredApiUrl
      : configuredApiUrl.endsWith("/api/v1")
        ? configuredApiUrl.replace(/\/v1$/, "")
        : `${configuredApiUrl}/api`;

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