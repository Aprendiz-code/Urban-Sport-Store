import { jsonError, jsonResponse, ApiError } from './api-helpers/response.ts';
import {
  buildCatalogMessage,
  callGroq,
  detectStructuredIntent,
  fetchAssistantProducts,
  resolveGroqModel,
  filterProducts,
  getFallbackMessage,
  getGeneralAnswer,
  getPolicyAnswer,
  sanitizeContext,
  sanitizeText,
  type AssistantResponse,
} from './shopping-assistant.ts';

const MAX_BODY_BYTES = 20_000;
const MAX_REQUESTS_PER_MINUTE = 12;
const GROQ_TIMEOUT_MS = 8_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'La solicitud es demasiado grande.'));
        req.destroy?.();
      }
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

function getClientKey(req: any) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === 'string' ? forwarded : '';
  return value.split(',')[0]?.trim() || req.socket?.remoteAddress || 'local';
}

function checkBestEffortRateLimit(req: any) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  try {
    const body = await parseJsonBody(req);
    const message = sanitizeText(body.message, 800);
    if (!message) throw new ApiError(400, 'Escribe tu consulta para continuar.');
    if (!checkBestEffortRateLimit(req)) {
      return jsonResponse(res, {
        ok: true,
        message: 'Has hecho varias consultas seguidas. Espera un momento; el catálogo y WhatsApp siguen disponibles.',
        source: 'fallback',
        products: [],
        needsWhatsApp: true,
      } satisfies AssistantResponse);
    }

    const general = getGeneralAnswer(message);
    if (general) {
      return jsonResponse(res, {
        ok: true,
        message: general.message,
        source: 'policy',
        products: [],
        needsWhatsApp: general.needsWhatsApp,
      } satisfies AssistantResponse);
    }

    const policy = getPolicyAnswer(message);
    if (policy) {
      return jsonResponse(res, {
        ok: true,
        message: policy.message,
        source: 'policy',
        products: [],
        needsWhatsApp: policy.needsWhatsApp,
      } satisfies AssistantResponse);
    }

    let products: Awaited<ReturnType<typeof fetchAssistantProducts>> = [];
    try {
      products = await fetchAssistantProducts();
    } catch {
      const fallback: AssistantResponse = {
        ok: true,
        message: 'El catálogo no está disponible temporalmente. Puedo explicar categorías, envíos, pagos, cambios o ayudarte a buscar por talla y presupuesto cuando vuelva. Si necesitas una revisión inmediata, también puedes usar WhatsApp.',
        source: 'fallback',
        products: [],
        needsWhatsApp: true,
      };
      return jsonResponse(res, fallback);
    }

    const intent = detectStructuredIntent(message);
    const isStructuredSearch = Boolean(intent.size || intent.budget || intent.brand || intent.category);

    if (isStructuredSearch) {
      const matches = filterProducts(products, message);
      const fallback: AssistantResponse = {
        ok: true,
        message: buildCatalogMessage(matches, message),
        source: 'catalog',
        products: matches,
        needsWhatsApp: matches.length === 0,
      };
      return jsonResponse(res, fallback);
    }

    const relevantProducts = filterProducts(products, message).slice(0, 3);
    const apiKey = typeof process.env.GROQ_API_KEY === 'string' ? process.env.GROQ_API_KEY.trim() : '';
    const configuredModel = typeof process.env.GROQ_MODEL === 'string' ? process.env.GROQ_MODEL.trim() : '';
    const model = configuredModel || await resolveGroqModel(apiKey, GROQ_TIMEOUT_MS);

    if (!apiKey || !model) {
      const fallback: AssistantResponse = {
        ok: true,
        message: `${getFallbackMessage('missing_config')} ${relevantProducts.length ? 'Puedo mostrarte opciones del catálogo mientras tanto.' : 'Intenta buscar por talla, presupuesto, marca o categoría.'}`,
        source: 'fallback',
        products: relevantProducts,
        needsWhatsApp: true,
      };
      return jsonResponse(res, fallback);
    }

    const groq = await callGroq({
      apiKey,
      model,
      question: message,
      context: sanitizeContext(body.context),
      products: relevantProducts,
      timeoutMs: GROQ_TIMEOUT_MS,
    });

    if (groq.kind === 'success') {
      return jsonResponse(res, {
        ok: true,
        message: groq.content,
        source: 'groq',
        products: relevantProducts,
        needsWhatsApp: /asesor|whatsapp|garant|reclamo|pedido|seguimiento/i.test(groq.content),
      } satisfies AssistantResponse);
    }

    const fallback: AssistantResponse = {
      ok: true,
      message: `${getFallbackMessage(groq.kind)} ${relevantProducts.length ? 'Estas opciones pertenecen al catálogo activo.' : ''}`,
      source: 'fallback',
      products: relevantProducts,
      needsWhatsApp: true,
    };
    return jsonResponse(res, fallback);
  } catch (error: any) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    return jsonError(res, 500, 'No fue posible procesar la consulta.');
  }
}
