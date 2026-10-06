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

  it('requires legal consent before signup and preserves both policy links', () => {
    expect(loginPage).toContain('He leído y acepto los');
    expect(loginPage).toContain('href={termsUrl}');
    expect(loginPage).toContain('href={privacyPolicyUrl}');
    expect(loginPage).toContain('id="auth-legal-consent"');
    expect(loginPage).toContain('checked={legalConsent}');
    expect(loginPage).toContain('if (!legalConsent)');
    expect(loginPage).toContain('noValidate={isRegister}');
    expect(loginPage).toContain('Debes aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.');
    expect(loginPage).toContain('disabled={loading}');
    expect(loginPage).toMatch(/id="auth-name"\s+required/);
    expect(loginPage).toMatch(/id="auth-email"[\s\S]{0,100}required/);
    expect(loginPage).toMatch(/id="auth-password"[\s\S]{0,100}required/);
    expect(loginPage).toContain('role="alert" aria-live="assertive"');
    expect(loginPage).toContain('getSignUpErrorMessage(err)');
  });

  it('shows confirmation instructions before checking a profile when signup has no session', () => {
    const confirmationBranch = loginPage.indexOf('if (signUpNeedsConfirmation)');
    const profileLookup = loginPage.indexOf('getProfileAccess(user)', confirmationBranch);

    expect(confirmationBranch).toBeGreaterThan(-1);
    expect(profileLookup).toBeGreaterThan(confirmationBranch);
    expect(loginPage.slice(confirmationBranch, profileLookup)).toContain('Revisa tu correo electrónico para confirmar tu cuenta antes de iniciar sesión.');
  });
});