import { randomUUID } from 'node:crypto';
import { ApiError, jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.ts';
import { requireActiveProfile } from '../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.ts';
import { shippingQuoteRequestSchema } from '../../src/lib/commerce-validation.ts';
import {
  calculateCoordinadoraQuote,
  ShippingQuoteUnavailableError,
  type CoordinadoraRate,
  type CoordinadoraProductPackage,
} from '../../src/lib/coordinadora-pricing.ts';

const QUOTE_LIFETIME_MINUTES = 30;

function parseJsonBody(req: any): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return Promise.resolve(req.body);
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.reject(new ApiError(400, 'El cuerpo JSON no es válido.')); }
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
      if (new TextEncoder().encode(body).byteLength > 16384) reject(new ApiError(400, 'La solicitud excede el tamaño máximo permitido.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new ApiError(400, 'El cuerpo JSON no es válido.')); }
    });
    req.on('error', reject);
  });
}

function normalizeLocation(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function toRate(row: Record<string, any>): CoordinadoraRate {
  return {
    originCode: row.origin_code,
    originCity: row.origin_city,
    originDepartment: row.origin_department,
    destinationCode: row.destination_code,
    destinationCity: row.destination_city,
    destinationDepartment: row.destination_department,
    routeCategory: row.route_category,
    minBillableWeightGrams: Number(row.min_billable_weight_grams),
    maxBillableWeightGrams: Number(row.max_billable_weight_grams),
    baseRateCop: Number(row.base_rate_cop),
    handlingType: row.handling_type,
    handlingValue: Number(row.handling_value),
    handlingBasis: row.handling_basis,
    handlingRounding: row.handling_rounding,
    estimatedDeliveryBusinessDays: Number(row.estimated_delivery_business_days),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  try {
    const user = await requireAuthenticatedUser(req);
    await requireActiveProfile(user.id);
    const body = await parseJsonBody(req);
    const validated = shippingQuoteRequestSchema.safeParse(body);
    if (!validated.success) return jsonError(res, 400, validated.error.issues[0]?.message ?? 'La solicitud de cotización no es válida.');

    const normalizedItems = [...validated.data.items].sort((left, right) => left.productId.localeCompare(right.productId));
    const productIds = normalizedItems.map((item) => item.productId);
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, price, is_active, shipping_weight_grams, shipping_length_cm, shipping_width_cm, shipping_height_cm, shipping_declared_value_cop, shipping_units_per_guide')
      .in('id', productIds);
    if (productsError) {
      console.error('[Shipping Quote] Product lookup failed', { code: productsError.code ?? 'SUPABASE_ERROR' });
      return jsonError(res, 503, 'No fue posible validar los artículos para cotizar el envío.');
    }
    const productRows = new Map((products ?? []).map((product: any) => [product.id, product]));
    if (productRows.size !== productIds.length) return jsonError(res, 422, 'Uno o más productos no están disponibles para envío.');

    const productPackages: CoordinadoraProductPackage[] = [];
    let subtotalCop = 0;
    for (const item of normalizedItems) {
      const product = productRows.get(item.productId) as any;
      if (!product || product.is_active !== true) return jsonError(res, 422, 'Uno o más productos no están disponibles para envío.');
      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return jsonError(res, 503, 'El precio de un artículo no está disponible para cotizar.');
      subtotalCop += unitPrice * item.quantity;
      productPackages.push({
        productId: product.id,
        sku: product.sku,
        quantity: item.quantity,
        realWeightGrams: product.shipping_weight_grams === null ? null : Number(product.shipping_weight_grams),
        lengthCm: product.shipping_length_cm === null ? null : Number(product.shipping_length_cm),
        widthCm: product.shipping_width_cm === null ? null : Number(product.shipping_width_cm),
        heightCm: product.shipping_height_cm === null ? null : Number(product.shipping_height_cm),
        declaredValueCop: product.shipping_declared_value_cop === null ? null : Number(product.shipping_declared_value_cop),
        unitsPerGuide: product.shipping_units_per_guide === null ? null : Number(product.shipping_units_per_guide),
      });
    }

    const { data: rateRows, error: ratesError } = await supabaseAdmin
      .from('shipping_rates')
      .select('*')
      .eq('carrier', 'coordinadora')
      .eq('is_active', true);
    if (ratesError) {
      console.error('[Shipping Quote] Rate lookup failed', { code: ratesError.code ?? 'SUPABASE_ERROR' });
      return jsonError(res, 503, 'La configuración de tarifas de envío no está disponible.');
    }

    const matchingLocationRates = (rateRows ?? []).filter((row: any) => (
      normalizeLocation(row.destination_city) === normalizeLocation(validated.data.address.city)
      && normalizeLocation(row.destination_department) === normalizeLocation(validated.data.address.state)
    ));
    if (matchingLocationRates.length === 0) {
      return jsonResponse(res, {
        ok: false,
        error: { code: 422, message: 'Coordinadora no tiene cobertura configurada para esta dirección.' },
        data: { quote: null, coverage: { covered: false }, currency: 'COP' },
      }, 422);
    }
    if (validated.data.address.country !== 'CO') {
      return jsonResponse(res, {
        ok: false,
        error: { code: 422, message: 'La cobertura configurada es únicamente para Colombia.' },
        data: { quote: null, coverage: { covered: false }, currency: 'COP' },
      }, 422);
    }

    const now = new Date();
    const availableRates = matchingLocationRates.filter((row: any) => row.valid_from <= bogotaDate(now) && row.valid_until >= bogotaDate(now));
    const candidates: Array<{ row: any; calculation: ReturnType<typeof calculateCoordinadoraQuote> }> = [];
    for (const row of availableRates) {
      try {
        candidates.push({
          row,
          calculation: calculateCoordinadoraQuote({
            address: validated.data.address,
            products: productPackages,
            rate: toRate(row),
            now,
          }),
        });
      } catch (error) {
        if (!(error instanceof ShippingQuoteUnavailableError)) throw error;
      }
    }
    if (candidates.length === 0) {
      return jsonResponse(res, {
        ok: false,
        error: { code: 422, message: availableRates.length === 0
          ? 'No hay una tarifa activa y vigente para esta ruta.'
          : 'No hay una tarifa única aplicable al destino y peso de este pedido.' },
        data: { quote: null, coverage: { covered: true }, currency: 'COP' },
      }, 422);
    }
    if (candidates.length > 1) return jsonError(res, 409, 'Hay más de una tarifa activa aplicable; un administrador debe corregir la configuración.');

    const [{ row, calculation }] = candidates;
    const quoteId = randomUUID();
    const expiresAt = new Date(now.getTime() + QUOTE_LIFETIME_MINUTES * 60_000).toISOString();
    const addressSnapshot = validated.data.address;
    const itemsSnapshot = normalizedItems;
    const productsSnapshot = productPackages.map((item) => ({ ...item }));
    const quoteSnapshot = {
      id: quoteId,
      provider: 'coordinadora',
      currency: 'COP',
      amountCop: calculation.amountCop,
      coverage: { covered: true, originCode: calculation.originCode, destinationCode: calculation.destinationCode },
      estimatedDeliveryBusinessDays: calculation.estimatedDeliveryBusinessDays,
      billableWeightGrams: calculation.billableWeightGrams,
      packageCount: calculation.packageCount,
      packageBreakdown: calculation.packageBreakdown,
      subtotalCop,
      rateId: row.id,
      rate: calculation.rateSnapshot,
      address: addressSnapshot,
      items: itemsSnapshot,
      products: productsSnapshot,
      expiresAt,
    };
    const { error: insertError } = await supabaseAdmin.from('shipping_quotes').insert({
      id: quoteId,
      user_id: user.id,
      carrier: 'coordinadora',
      currency: 'COP',
      amount_cop: calculation.amountCop,
      covered: true,
      estimated_delivery_business_days: calculation.estimatedDeliveryBusinessDays,
      billable_weight_grams: calculation.billableWeightGrams,
      package_count: calculation.packageCount,
      origin_code: calculation.originCode,
      destination_code: calculation.destinationCode,
      address_snapshot: addressSnapshot,
      items_snapshot: itemsSnapshot,
      products_snapshot: productsSnapshot,
      subtotal_cop: subtotalCop,
      rate_id: row.id,
      rate_snapshot: calculation.rateSnapshot,
      quote_snapshot: quoteSnapshot,
      expires_at: expiresAt,
      status: 'issued',
    });
    if (insertError) {
      console.error('[Shipping Quote] Quote persistence failed', { code: insertError.code ?? 'SUPABASE_ERROR' });
      return jsonError(res, 503, 'No fue posible registrar la cotización.');
    }

    return jsonResponse(res, {
      ok: true,
      data: {
        quote: {
          id: quoteId,
          provider: 'coordinadora',
          currency: 'COP',
          amountCop: calculation.amountCop,
          subtotalCop,
          coverage: { covered: true, originCode: calculation.originCode, destinationCode: calculation.destinationCode },
          estimatedDelivery: {
            minBusinessDays: calculation.estimatedDeliveryBusinessDays,
            maxBusinessDays: calculation.estimatedDeliveryBusinessDays,
          },
          expiresAt,
        },
      },
    }, 201);
  } catch (error: any) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    console.error('[Shipping Quote] Unexpected failure', { code: error?.code ?? 'UNKNOWN' });
    return jsonError(res, 500, 'No fue posible cotizar el envío.');
  }
}

function bogotaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export { QUOTE_LIFETIME_MINUTES, toRate, bogotaDate };