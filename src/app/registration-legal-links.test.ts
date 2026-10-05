import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const loginPage = appSource.slice(
  appSource.indexOf('function LoginPage('),
  appSource.indexOf('function PasswordRecoveryPage('),
);

describe('registration legal links', () => {
  it('uses the public in-app legal routes when URL overrides are not configured', () => {
    expect(loginPage).toContain('import.meta.env.VITE_TERMS_URL?.trim() || STORE_CONFIG.termsPath');
    expect(loginPage).toContain('import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || STORE_CONFIG.privacyPolicyPath');
    expect(appSource).toContain('if (pathname === "/terminos-y-condiciones") return "terms";');
    expect(appSource).toContain('if (pathname === "/politica-de-privacidad") return "privacy";');
  });

  it('shows linked terms without blocking signup on environment configuration or consent state', () => {
    expect(loginPage).toContain('Al crear una cuenta, aceptas nuestros');
    expect(loginPage).toContain('href={termsUrl}');
    expect(loginPage).toContain('href={privacyPolicyUrl}');
    expect(loginPage).not.toContain('acceptedPolicies');
    expect(loginPage).not.toContain('policiesAvailable');
    expect(loginPage).not.toContain('El registro estará disponible cuando se configuren');
    expect(loginPage).toContain('disabled={loading}');
    expect(loginPage).toMatch(/id="auth-name"\s+required/);
    expect(loginPage).toMatch(/id="auth-email"[\s\S]{0,100}required/);
    expect(loginPage).toMatch(/id="auth-password"[\s\S]{0,100}required/);
  });
});