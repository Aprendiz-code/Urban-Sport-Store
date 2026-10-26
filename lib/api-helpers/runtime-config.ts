export type DeploymentEnvironment = 'development' | 'preview' | 'production';
export type WompiMode = 'sandbox' | 'production';

type RuntimeEnvironment = Record<string, string | undefined>;

export class RuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigurationError';
  }
}

export interface SupabaseRuntimeConfig {
  deploymentEnvironment: DeploymentEnvironment;
  url: string;
  anonKey: string;
  serviceRoleKey: string | null;
}

export interface WompiRuntimeConfig {
  mode: WompiMode;
  eventEnvironment: 'test' | 'prod';
  apiBaseUrl: string;
  publicKey: string;
  privateKey: string;
}

function requiredValue(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeConfigurationError(`Required environment variable ${name} is missing or empty.`);
  }
  return value.trim();
}

function optionalValue(environment: RuntimeEnvironment, name: string): string | null {
  const value = environment[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function getDeploymentEnvironment(
  environment: RuntimeEnvironment = process.env,
): DeploymentEnvironment {
  const value = environment.VERCEL_ENV;
  if (value === undefined) {
    if (environment.VERCEL === '1') {
      throw new RuntimeConfigurationError('VERCEL_ENV is missing in a Vercel deployment.');
    }
    return 'development';
  }
  if (value === '') {
    throw new RuntimeConfigurationError('VERCEL_ENV must not be empty.');
  }
  if (value === 'development' || value === 'preview' || value === 'production') return value;
  throw new RuntimeConfigurationError('VERCEL_ENV must be development, preview, or production.');
}

export function getSupabaseRuntimeConfig(
  environment: RuntimeEnvironment = process.env,
): SupabaseRuntimeConfig {
  const deploymentEnvironment = getDeploymentEnvironment(environment);
  const urlName = deploymentEnvironment === 'production'
    ? 'SUPABASE_URL_PRODUCTION'
    : 'SUPABASE_URL';
  const url = requiredValue(environment, urlName);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new RuntimeConfigurationError(`${urlName} must be a valid URL.`);
  }
  if (parsedUrl.protocol !== 'https:' && deploymentEnvironment === 'production') {
    throw new RuntimeConfigurationError(`${urlName} must use HTTPS in Vercel Production.`);
  }

  return {
    deploymentEnvironment,
    url,
    anonKey: requiredValue(environment, 'SUPABASE_ANON_KEY'),
    serviceRoleKey: optionalValue(environment, 'SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getWompiRuntimeConfig(
  environment: RuntimeEnvironment = process.env,
): WompiRuntimeConfig {
  const modeValue = requiredValue(environment, 'WOMPI_ENVIRONMENT');
  if (modeValue !== 'sandbox' && modeValue !== 'production') {
    throw new RuntimeConfigurationError('WOMPI_ENVIRONMENT must be sandbox or production.');
  }

  const mode: WompiMode = modeValue;
  const deploymentEnvironment = getDeploymentEnvironment(environment);
  if (mode === 'production' && deploymentEnvironment !== 'production') {
    throw new RuntimeConfigurationError(
      'WOMPI_ENVIRONMENT=production is allowed only when VERCEL_ENV=production.',
    );
  }

  const apiUrlName = mode === 'sandbox'
    ? 'WOMPI_API_BASE_URL'
    : 'WOMPI_API_BASE_URL_PRODUCTION';
  const publicKeyName = mode === 'sandbox'
    ? 'WOMPI_PUBLIC_KEY'
    : 'WOMPI_PUBLIC_KEY_PRODUCTION';
  const privateKeyName = mode === 'sandbox'
    ? 'WOMPI_PRIVATE_KEY'
    : 'WOMPI_PRIVATE_KEY_PRODUCTION';
  const publicKeyPrefix = mode === 'sandbox' ? 'pub_test_' : null;
  const privateKeyPrefix = mode === 'sandbox' ? 'prv_test_' : null;

  const configuredApiUrl = requiredValue(environment, apiUrlName);
  let parsedApiUrl: URL;
  try {
    parsedApiUrl = new URL(configuredApiUrl);
  } catch {
    throw new RuntimeConfigurationError(`${apiUrlName} must be a valid URL.`);
  }

  const path = parsedApiUrl.pathname.replace(/\/+$/, '');
  const hostAllowed = mode === 'sandbox'
    ? parsedApiUrl.hostname === 'sandbox.wompi.co'
    : parsedApiUrl.hostname.endsWith('.wompi.co')
      && parsedApiUrl.hostname !== 'sandbox.wompi.co';
  if (parsedApiUrl.protocol !== 'https:'
    || !hostAllowed
    || parsedApiUrl.port
    || parsedApiUrl.username
    || parsedApiUrl.password
    || parsedApiUrl.search
    || parsedApiUrl.hash
    || (path !== '' && path !== '/v1')) {
    const hostRequirement = mode === 'sandbox'
      ? 'https://sandbox.wompi.co/v1'
      : 'a verified HTTPS Wompi production host ending in .wompi.co';
    throw new RuntimeConfigurationError(
      `${apiUrlName} must use ${hostRequirement} without credentials, port, query, or fragment.`,
    );
  }

  const publicKey = requiredValue(environment, publicKeyName);
  const privateKey = requiredValue(environment, privateKeyName);
  if (publicKeyPrefix && !publicKey.startsWith(publicKeyPrefix)) {
    throw new RuntimeConfigurationError(`${publicKeyName} has an invalid key prefix for ${mode}.`);
  }
  if (privateKeyPrefix && !privateKey.startsWith(privateKeyPrefix)) {
    throw new RuntimeConfigurationError(`${privateKeyName} has an invalid key prefix for ${mode}.`);
  }

  return {
    mode,
    eventEnvironment: mode === 'sandbox' ? 'test' : 'prod',
    apiBaseUrl: `${parsedApiUrl.origin}/v1`,
    publicKey,
    privateKey,
  };
}

export function getWompiPaymentSessionsEnabled(
  environment: RuntimeEnvironment = process.env,
): boolean {
  const value = environment.WOMPI_PAYMENT_SESSIONS_ENABLED;
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export function getWompiEventsSecret(
  mode: WompiMode,
  environment: RuntimeEnvironment = process.env,
): string {
  if (mode === 'production') {
    return requiredValue(environment, 'WOMPI_EVENTS_KEY_PRODUCTION');
  }

  const selectedName = environment.WOMPI_SANDBOX_EVENTS_SECRET !== undefined
    ? 'WOMPI_SANDBOX_EVENTS_SECRET'
    : 'WOMPI_EVENTS_SECRET';
  return requiredValue(environment, selectedName);
}

export function getWompiReturnUrl(
  config: WompiRuntimeConfig,
  environment: RuntimeEnvironment = process.env,
): string | undefined {
  if (config.mode !== 'sandbox') return undefined;

  const configuredUrl = optionalValue(environment, 'WOMPI_SANDBOX_RETURN_URL');
  const allowedOrigins = new Set(
    (environment.WOMPI_SANDBOX_RETURN_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (!configuredUrl || allowedOrigins.size === 0) return undefined;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || url.pathname !== '/checkout/return') return undefined;

    const originAllowed = [...allowedOrigins].some((origin) => {
      try {
        const allowlistedUrl = new URL(origin);
        return allowlistedUrl.protocol === 'https:'
          && allowlistedUrl.origin === origin
          && url.origin === allowlistedUrl.origin;
      } catch {
        return false;
      }
    });

    return originAllowed ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}