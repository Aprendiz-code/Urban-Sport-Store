export function jsonResponse(res: any, payload: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function jsonError(res: any, status: number, message: string) {
  jsonResponse(res, { ok: false, error: { code: status, message } }, status);
}
