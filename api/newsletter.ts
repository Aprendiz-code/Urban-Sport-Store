import { jsonResponse, jsonError, ApiError } from '../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../lib/api-helpers/supabase.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        reject(new ApiError(400, 'El cuerpo de la solicitud no es válido.'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  try {
    const body = await parseJsonBody(req);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : undefined;

    if (!email || !EMAIL_REGEX.test(email)) {
      throw new ApiError(400, 'El correo electrónico no es válido.');
    }

    if (!supabaseAdmin) {
      throw new ApiError(503, 'El newsletter no está disponible temporalmente.');
    }

    const { error } = await supabaseAdmin.from('newsletter_subscribers').insert({
      email,
      source: source || null,
      status: 'ACTIVE',
    });

    if (error) {
      const message = error.message || 'Unable to subscribe to newsletter.';
      const details = String(error.details ?? '').toLowerCase();
      const duplicate =
        error.code === '23505' ||
        /duplicate/.test(message.toLowerCase()) ||
        /already exists/.test(message.toLowerCase()) ||
        /already subscribed/.test(details);

      if (duplicate) {
        throw new ApiError(409, 'Este correo ya está suscrito.');
      }
      console.error('Newsletter subscription failed:', error.code ?? 'unknown');
      throw new ApiError(500, 'No fue posible completar la suscripción.');
    }

    return jsonResponse(res, { data: { subscribed: true, email, source: source ?? null } }, 201);
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, 'No fue posible completar la suscripción.');
  }
}
