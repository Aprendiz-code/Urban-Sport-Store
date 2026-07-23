import { ApiError } from './errors.js';

export function requireEmail(body: any) {
  if (!body || typeof body.email !== 'string' || !body.email.trim()) {
    throw new ApiError(400, 'A valid email is required.');
  }
  return body.email.trim();
}
