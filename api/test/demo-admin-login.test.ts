import { describe, expect, it } from 'vitest';
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_LEGACY_EMAIL,
  DEMO_ADMIN_LEGACY_PASSWORD,
  getDemoAdminUser,
} from '../../src/lib/supabase-auth';

describe('demo admin auth fallback', () => {
  it('accepts the active demo admin credentials used to preview the admin panel', () => {
    const demoUser = getDemoAdminUser(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    expect(demoUser).not.toBeNull();
    expect(demoUser?.email).toBe(DEMO_ADMIN_EMAIL);
    expect(demoUser?.app_metadata?.role).toBe('ADMIN');
    expect(demoUser?.app_metadata?.isAdmin).toBe(true);
  });

  it('keeps the legacy demo credentials working for compatibility', () => {
    const legacyUser = getDemoAdminUser(DEMO_ADMIN_LEGACY_EMAIL, DEMO_ADMIN_LEGACY_PASSWORD);

    expect(legacyUser).not.toBeNull();
    expect(legacyUser?.email).toBe(DEMO_ADMIN_EMAIL);
    expect(legacyUser?.app_metadata?.role).toBe('ADMIN');
  });
});
