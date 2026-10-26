import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getDeploymentEnvironment,
  getSupabaseRuntimeConfig,
  getWompiEventsSecret,
  getWompiPaymentSessionsEnabled,
  getWompiReturnUrl,
  getWompiRuntimeConfig,
  RuntimeConfigurationError,
} from '../../lib/api-helpers/runtime-config.js';

function sandboxEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: 'production',
    SUPABASE_URL: 'https://sandbox-project.supabase.co',
    SUPABASE_URL_PRODUCTION: 'https://production-project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
    WOMPI_ENVIRONMENT: 'sandbox',
    WOMPI_API_BASE_URL: 'https://sandbox.wompi.co/v1',
    WOMPI_PUBLIC_KEY: 'pub_test_sandbox-unit-test',
    WOMPI_PRIVATE_KEY: 'prv_test_sandbox-unit-test',
    WOMPI_API_BASE_URL_PRODUCTION: 'https://production.wompi.co/v1',
    WOMPI_PUBLIC_KEY_PRODUCTION: 'pub_prod_production-unit-test',
    WOMPI_PRIVATE_KEY_PRODUCTION: 'prv_prod_production-unit-test',
    WOMPI_SANDBOX_EVENTS_SECRET: 'sandbox-events-unit-test',
    WOMPI_EVENTS_SECRET: 'legacy-sandbox-events-unit-test',
    WOMPI_EVENTS_KEY_PRODUCTION: 'production-events-unit-test',
    ...overrides,
  };
}

function productionEnvironment(overrides: Record<string, string | undefined> = {}) {
  return sandboxEnvironment({
    VERCEL_ENV: 'production',
    WOMPI_ENVIRONMENT: 'production',
    ...overrides,
  });
}

describe('server runtime configuration', () => {
  it('selects only Sandbox credentials when the explicit Wompi mode is Sandbox', () => {
    const environment = sandboxEnvironment();
    const config = getWompiRuntimeConfig(environment);

    expect(config).toMatchObject({
      mode: 'sandbox',
      eventEnvironment: 'test',
      apiBaseUrl: 'https://sandbox.wompi.co/v1',
      publicKey: environment.WOMPI_PUBLIC_KEY,
      privateKey: environment.WOMPI_PRIVATE_KEY,
    });
  });

  it('selects only the _PRODUCTION Supabase URL and Wompi credentials in Production', () => {
    const environment = productionEnvironment();
    const supabase = getSupabaseRuntimeConfig(environment);
    const wompi = getWompiRuntimeConfig(environment);

    expect(supabase.url).toBe(environment.SUPABASE_URL_PRODUCTION);
    expect(wompi).toMatchObject({
      mode: 'production',
      eventEnvironment: 'prod',
      apiBaseUrl: 'https://production.wompi.co/v1',
      publicKey: environment.WOMPI_PUBLIC_KEY_PRODUCTION,
      privateKey: environment.WOMPI_PRIVATE_KEY_PRODUCTION,
    });
  });

  it('does not fall back to the legacy Supabase URL in Production', () => {
    expect(() => getSupabaseRuntimeConfig(productionEnvironment({
      SUPABASE_URL_PRODUCTION: undefined,
    }))).toThrow('SUPABASE_URL_PRODUCTION is missing or empty');
  });

  it('does not activate live payments from the Vercel Production deployment alone', () => {
    const environment = sandboxEnvironment({ WOMPI_ENVIRONMENT: undefined });

    expect(getDeploymentEnvironment(environment)).toBe('production');
    expect(() => getWompiRuntimeConfig(environment)).toThrow(
      'Required environment variable WOMPI_ENVIRONMENT is missing or empty.',
    );
  });

  it('rejects missing and empty values without including credential contents in errors', () => {
    expect(() => getWompiRuntimeConfig(sandboxEnvironment({ WOMPI_PRIVATE_KEY: '' })))
      .toThrow('WOMPI_PRIVATE_KEY is missing or empty');
    expect(() => getWompiRuntimeConfig(productionEnvironment({
      WOMPI_PRIVATE_KEY_PRODUCTION: undefined,
    }))).toThrow('WOMPI_PRIVATE_KEY_PRODUCTION is missing or empty');
    expect(() => getSupabaseRuntimeConfig(sandboxEnvironment({ SUPABASE_ANON_KEY: '' })))
      .toThrow('SUPABASE_ANON_KEY is missing or empty');
  });

  it('does not fall back between Sandbox and Production credentials', () => {
    const missingSandboxKey = sandboxEnvironment({
      WOMPI_PUBLIC_KEY: undefined,
      WOMPI_PRIVATE_KEY: undefined,
    });
    const missingProductionKey = productionEnvironment({
      WOMPI_PUBLIC_KEY_PRODUCTION: undefined,
      WOMPI_PRIVATE_KEY_PRODUCTION: undefined,
    });

    expect(() => getWompiRuntimeConfig(missingSandboxKey)).toThrow('WOMPI_PUBLIC_KEY is missing');
    expect(() => getWompiRuntimeConfig(missingProductionKey))
      .toThrow('WOMPI_PUBLIC_KEY_PRODUCTION is missing');
  });

  it('enables payment sessions only for an explicit true value and fails closed otherwise', () => {
    expect(getWompiPaymentSessionsEnabled(sandboxEnvironment({
      WOMPI_PAYMENT_SESSIONS_ENABLED: 'true',
    }))).toBe(true);
    expect(getWompiPaymentSessionsEnabled(sandboxEnvironment({
      WOMPI_PAYMENT_SESSIONS_ENABLED: undefined,
    }))).toBe(false);
    expect(getWompiPaymentSessionsEnabled(sandboxEnvironment({
      WOMPI_PAYMENT_SESSIONS_ENABLED: 'false',
    }))).toBe(false);
    expect(getWompiPaymentSessionsEnabled(sandboxEnvironment({
      WOMPI_PAYMENT_SESSIONS_ENABLED: 'yes',
    }))).toBe(false);
  });

  it('preserves Sandbox event-secret priority and rejects a defined-but-empty preferred value', () => {
    const environment = sandboxEnvironment();
    expect(getWompiEventsSecret('sandbox', environment)).toBe(environment.WOMPI_SANDBOX_EVENTS_SECRET);
    expect(getWompiEventsSecret('sandbox', {
      ...environment,
      WOMPI_SANDBOX_EVENTS_SECRET: undefined,
    })).toBe(environment.WOMPI_EVENTS_SECRET);
    expect(() => getWompiEventsSecret('sandbox', {
      ...environment,
      WOMPI_SANDBOX_EVENTS_SECRET: '',
    })).toThrow('WOMPI_SANDBOX_EVENTS_SECRET is missing or empty');
  });

  it('requires the dedicated production events key and rejects Sandbox fallbacks', () => {
    const environment = productionEnvironment({ WOMPI_EVENTS_KEY_PRODUCTION: undefined });
    expect(() => getWompiEventsSecret('production', environment))
      .toThrow('WOMPI_EVENTS_KEY_PRODUCTION is missing or empty');
  });

  it('rejects Production Wompi mode outside a Vercel Production deployment', () => {
    expect(() => getWompiRuntimeConfig(productionEnvironment({ VERCEL_ENV: 'preview' })))
      .toThrow('WOMPI_ENVIRONMENT=production is allowed only when VERCEL_ENV=production.');
  });

  it('does not accept the Sandbox host for an explicitly selected Production mode', () => {
    expect(() => getWompiRuntimeConfig(productionEnvironment({
      WOMPI_API_BASE_URL_PRODUCTION: 'https://sandbox.wompi.co/v1',
    }))).toThrow('WOMPI_API_BASE_URL_PRODUCTION must use a verified HTTPS Wompi production host');
  });

  it('keeps the return URL Sandbox-only', () => {
    const sandbox = getWompiRuntimeConfig(sandboxEnvironment({
      WOMPI_SANDBOX_RETURN_URL: 'https://store.example/checkout/return',
      WOMPI_SANDBOX_RETURN_ORIGINS: 'https://store.example',
    }));
    const production = getWompiRuntimeConfig(productionEnvironment({
      WOMPI_SANDBOX_RETURN_URL: 'https://store.example/checkout/return',
      WOMPI_SANDBOX_RETURN_ORIGINS: 'https://store.example',
    }));

    expect(getWompiReturnUrl(sandbox, sandboxEnvironment({
      WOMPI_SANDBOX_RETURN_URL: 'https://store.example/checkout/return',
      WOMPI_SANDBOX_RETURN_ORIGINS: 'https://store.example',
    }))).toBe('https://store.example/checkout/return');
    expect(getWompiReturnUrl(production, productionEnvironment({
      WOMPI_SANDBOX_RETURN_URL: 'https://store.example/checkout/return',
      WOMPI_SANDBOX_RETURN_ORIGINS: 'https://store.example',
    }))).toBeUndefined();
  });

  it('does not put backend-only credentials in frontend source', () => {
    const frontendRoot = fileURLToPath(new URL('../../src/', import.meta.url));
    const frontendFiles = readdirSync(frontendRoot, { recursive: true })
      .filter((path): path is string => typeof path === 'string' && /\.(?:[cm]?[jt]sx?)$/.test(path))
      .map((path) => readFileSync(join(frontendRoot, path), 'utf8'));
    const frontendSource = frontendFiles.join('\n');

    for (const backendOnlyName of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL_PRODUCTION',
      'WOMPI_PRIVATE_KEY',
      'WOMPI_PRIVATE_KEY_PRODUCTION',
      'WOMPI_SANDBOX_EVENTS_SECRET',
      'WOMPI_EVENTS_SECRET',
      'WOMPI_EVENTS_KEY_PRODUCTION',
    ]) {
      expect(frontendSource).not.toContain(backendOnlyName);
    }
  });

  it('uses safe errors for invalid configuration', () => {
    expect(() => getWompiRuntimeConfig(sandboxEnvironment({ WOMPI_ENVIRONMENT: 'live' })))
      .toThrow(RuntimeConfigurationError);
    expect(() => getWompiRuntimeConfig(sandboxEnvironment({
      WOMPI_API_BASE_URL: 'https://attacker.example/v1',
    }))).toThrow('WOMPI_API_BASE_URL must use https://sandbox.wompi.co/v1');
  });
});