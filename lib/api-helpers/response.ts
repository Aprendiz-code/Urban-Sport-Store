export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(res: any, payload: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function jsonError(res: any, status: number, message: string) {
  jsonResponse(res, { ok: false, error: { code: status, message } }, status);
}

export function jsonSupabaseError(res: any, context: string, error: any, fallback: string) {
  const code = typeof error?.code === 'string' ? error.code : 'SUPABASE_ERROR';
  const message = typeof error?.message === 'string' ? error.message : fallback;
  const details = typeof error?.details === 'string' ? error.details : undefined;
  const hint = typeof error?.hint === 'string' ? error.hint : undefined;
  const status = code === '42501'
    ? 403
    : code === '23505'
      ? 409
      : code.startsWith('22') || ['23502', '23503', '23514'].includes(code)
        ? 400
        : 500;

  console.error(context, { code, message, details, hint });
  jsonResponse(res, {
    ok: false,
    error: { code, message, ...(details ? { details } : {}), ...(hint ? { hint } : {}) },
  }, status);
}
