import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../api-config';

describe('resolveApiBaseUrl', () => {
  it('normalizes nested admin routes back to the backend API root', () => {
    expect(resolveApiBaseUrl('https://example.com/api/admin/products/index')).toBe('https://example.com/api');
    expect(resolveApiBaseUrl('https://example.com/api/admin/products')).toBe('https://example.com/api');
    expect(resolveApiBaseUrl('https://example.com/api/v1')).toBe('https://example.com/api');
    expect(resolveApiBaseUrl('/api/admin/products/index')).toBe('/api');
    expect(resolveApiBaseUrl('https://example.com')).toBe('https://example.com/api');
  });
});
