import { afterEach, describe, expect, it, vi } from 'vitest';
import { signInWithEmail } from '../../src/lib/supabase-auth';

vi.mock('../../src/lib/supabase-client', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseEnabled: () => false,
}));

describe('demo admin auth fallback security', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires real Supabase configuration and creates no local user', async () => {
    const result = await signInWithEmail('admin@example.test', 'not-a-real-password');

    expect(result.data.user).toBeNull();
    expect(result.error?.message).toContain('configurar Supabase');
  });
});
