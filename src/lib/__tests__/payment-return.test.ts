import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPaymentReturnDestination,
  isPaymentReturnPath,
} from '../payment-return';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generic payment return', () => {
  it('recognizes only the generic return pathname and ignores result parameters', () => {
    const url = new URL('https://store.example/checkout/return?success=true&approved=true');
    expect(isPaymentReturnPath(url.pathname)).toBe(true);
    expect(isPaymentReturnPath('/checkout')).toBe(false);
  });

  it('offers account or login based on the existing session', () => {
    expect(getPaymentReturnDestination(true)).toBe('account');
    expect(getPaymentReturnDestination(false)).toBe('login');
  });
});
