export interface CoordinadoraProductPackage {
  productId: string;
  sku: string;
  quantity: number;
  realWeightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  declaredValueCop: number | null;
  unitsPerGuide: number | null;
}

export interface CoordinadoraRate {
  originCode: string;
  originCity: string;
  originDepartment: string;
  destinationCode: string;
  destinationCity: string;
  destinationDepartment: string;
  routeCategory: string;
  minBillableWeightGrams: number;
  maxBillableWeightGrams: number;
  baseRateCop: number;
  handlingType: 'percentage' | 'fixed';
  handlingValue: number;
  handlingBasis: 'declared_value' | 'per_guide';
  handlingRounding: 'exact' | 'nearest_peso' | 'up_peso' | 'down_peso';
  estimatedDeliveryBusinessDays: number;
  validFrom: string;
  validUntil: string;
}

export interface CoordinadoraQuoteAddress {
  city: string;
  state: string;
  country: string;
}

export interface CoordinadoraQuoteCalculation {
  amountCop: number;
  billableWeightGrams: number;
  packageCount: number;
  routeCategory: string;
  estimatedDeliveryBusinessDays: number;
  originCode: string;
  destinationCode: string;
  rateSnapshot: CoordinadoraRate;
  packageBreakdown: Array<{
    productId: string;
    sku: string;
    declaredValueCop: number;
    billableWeightGrams: number;
    baseRateCop: number;
    handlingAmountCop: number;
    quantity: number;
  }>;
}

export class ShippingQuoteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippingQuoteUnavailableError';
  }
}

function normalizeLocation(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function roundHandling(value: number, rule: CoordinadoraRate['handlingRounding']): number {
  if (rule === 'nearest_peso') return Math.round(value);
  if (rule === 'up_peso') return Math.ceil(value);
  if (rule === 'down_peso') return Math.floor(value);
  return value;
}

export function calculateCoordinadoraQuote(input: {
  address: CoordinadoraQuoteAddress;
  products: CoordinadoraProductPackage[];
  rate: CoordinadoraRate;
  now?: Date;
}): CoordinadoraQuoteCalculation {
  const { address, products, rate } = input;
  const now = input.now ?? new Date();
  const currentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  if (address.country.toUpperCase() !== 'CO'
    || normalizeLocation(address.city) !== normalizeLocation(rate.destinationCity)
    || normalizeLocation(address.state) !== normalizeLocation(rate.destinationDepartment)) {
    throw new ShippingQuoteUnavailableError('Coordinadora no tiene cobertura configurada para esta dirección.');
  }
  if (currentDate < rate.validFrom || currentDate > rate.validUntil) {
    throw new ShippingQuoteUnavailableError('La tarifa de Coordinadora no está vigente.');
  }
  if (products.length === 0 || !Number.isSafeInteger(rate.baseRateCop) || rate.baseRateCop <= 0) {
    throw new ShippingQuoteUnavailableError('No hay una tarifa de Coordinadora válida para este pedido.');
  }

  let amountCop = 0;
  let packageCount = 0;
  let totalBillableWeightGrams = 0;
  const packageBreakdown: CoordinadoraQuoteCalculation['packageBreakdown'] = [];

  for (const product of products) {
    const packageValues = [
      product.realWeightGrams,
      product.lengthCm,
      product.widthCm,
      product.heightCm,
      product.declaredValueCop,
      product.unitsPerGuide,
    ];
    if (packageValues.some((value) => value === null || !Number.isFinite(value) || value <= 0)
      || !Number.isSafeInteger(product.quantity)
      || product.quantity < 1
      || product.unitsPerGuide !== 1) {
      throw new ShippingQuoteUnavailableError(`Faltan datos logísticos válidos para ${product.sku}.`);
    }

    const realWeightGrams = product.realWeightGrams as number;
    const declaredValueCop = product.declaredValueCop as number;
    const volumetricWeightGrams = (product.lengthCm as number)
      * (product.widthCm as number)
      * (product.heightCm as number)
      * 1000 / 2500;
    const billableWeightGrams = Math.max(realWeightGrams, volumetricWeightGrams);

    if (billableWeightGrams < rate.minBillableWeightGrams
      || billableWeightGrams > rate.maxBillableWeightGrams) {
      throw new ShippingQuoteUnavailableError(`El peso facturable de ${product.sku} no coincide con el rango de esta tarifa.`);
    }

    const handlingBeforeRounding = rate.handlingType === 'percentage'
      ? (rate.handlingBasis === 'declared_value'
        ? declaredValueCop * rate.handlingValue / 100
        : rate.baseRateCop * rate.handlingValue / 100)
      : rate.handlingValue;
    const handlingAmountCop = roundHandling(handlingBeforeRounding, rate.handlingRounding);
    amountCop += (rate.baseRateCop + handlingAmountCop) * product.quantity;
    packageCount += product.quantity;
    totalBillableWeightGrams += billableWeightGrams * product.quantity;
    packageBreakdown.push({
      productId: product.productId,
      sku: product.sku,
      declaredValueCop,
      billableWeightGrams,
      baseRateCop: rate.baseRateCop,
      handlingAmountCop,
      quantity: product.quantity,
    });
  }

  return {
    amountCop,
    billableWeightGrams: totalBillableWeightGrams,
    packageCount,
    routeCategory: rate.routeCategory,
    estimatedDeliveryBusinessDays: rate.estimatedDeliveryBusinessDays,
    originCode: rate.originCode,
    destinationCode: rate.destinationCode,
    rateSnapshot: rate,
    packageBreakdown,
  };
}