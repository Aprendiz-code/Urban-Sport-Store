import { describe, expect, it } from 'vitest';
import { calculateCoordinadoraQuote, ShippingQuoteUnavailableError } from '../coordinadora-pricing';

const rate = {
  originCode: '11001000',
  originCity: 'Bogotá',
  originDepartment: 'Cundinamarca',
  destinationCode: '11001000',
  destinationCity: 'Bogotá',
  destinationDepartment: 'Cundinamarca',
  routeCategory: 'Local',
  minBillableWeightGrams: 1000,
  maxBillableWeightGrams: 2000,
  baseRateCop: 9000,
  handlingType: 'percentage' as const,
  handlingValue: 1,
  handlingBasis: 'declared_value' as const,
  handlingRounding: 'exact' as const,
  estimatedDeliveryBusinessDays: 1,
  validFrom: '2026-10-13',
  validUntil: '2026-12-31',
};

const product = {
  productId: '11111111-1111-4111-8111-111111111111',
  sku: 'STAGING-SYNTH-001',
  quantity: 1,
  realWeightGrams: 1000,
  lengthCm: 20,
  widthCm: 20,
  heightCm: 10,
  declaredValueCop: 1000,
  unitsPerGuide: 1,
};

describe('Coordinadora local quote calculation', () => {
  it('prices the configured Bogotá package from its volumetric weight and declared value', () => {
    const quote = calculateCoordinadoraQuote({
      address: { city: 'BOGOTA', state: 'Cundinamarca', country: 'CO' },
      products: [product],
      rate,
      now: new Date('2026-10-13T17:00:00.000Z'),
    });

    expect(quote).toMatchObject({
      amountCop: 9010,
      billableWeightGrams: 1600,
      packageCount: 1,
      routeCategory: 'Local',
      estimatedDeliveryBusinessDays: 1,
      originCode: '11001000',
      destinationCode: '11001000',
    });
  });

  it('rejects destinations without the configured coverage', () => {
    expect(() => calculateCoordinadoraQuote({
      address: { city: 'Cali', state: 'Valle del Cauca', country: 'CO' },
      products: [product],
      rate,
      now: new Date('2026-10-13T17:00:00.000Z'),
    })).toThrow(ShippingQuoteUnavailableError);
  });

  it('rejects package weight outside the selected band and incomplete logistics data', () => {
    expect(() => calculateCoordinadoraQuote({
      address: { city: 'Bogotá', state: 'Cundinamarca', country: 'CO' },
      products: [{ ...product, lengthCm: 30 }],
      rate,
      now: new Date('2026-10-13T17:00:00.000Z'),
    })).toThrow(/peso facturable/);
    expect(() => calculateCoordinadoraQuote({
      address: { city: 'Bogotá', state: 'Cundinamarca', country: 'CO' },
      products: [{ ...product, declaredValueCop: null }],
      rate,
      now: new Date('2026-10-13T17:00:00.000Z'),
    })).toThrow(/datos logísticos/);
  });

  it('rejects expired tariff configuration', () => {
    expect(() => calculateCoordinadoraQuote({
      address: { city: 'Bogotá', state: 'Cundinamarca', country: 'CO' },
      products: [product],
      rate,
      now: new Date('2027-01-01T12:00:00.000Z'),
    })).toThrow(/no está vigente/);
  });
});