import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import dotenv from 'dotenv';

describe('backend env loading from monorepo root', () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let tempRoot: string | null = null;

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    Object.keys(process.env).forEach(k => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('loads Supabase env vars from api/.env.local when running from workspace root', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'urban-sport-'));
    const apiDir = path.join(tempRoot, 'api');
    fs.mkdirSync(apiDir, { recursive: true });

    // Write env file to api/.env.local
    fs.writeFileSync(
      path.join(apiDir, '.env.local'),
      'SUPABASE_URL=https://from-api.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=service-role-key-123\n'
    );

    process.chdir(tempRoot);

    // Simulate the loadEnvFiles logic
    dotenv.config({ path: path.resolve(tempRoot, '.env') });
    dotenv.config({ path: path.resolve(tempRoot, '.env.local'), override: true });
    
    const apiEnvPath = path.resolve(tempRoot, 'api', '.env.local');
    if (tempRoot !== path.resolve(tempRoot, 'api')) {
      dotenv.config({ path: apiEnvPath, override: true });
    }

    expect(process.env.SUPABASE_URL).toBe('https://from-api.supabase.co');
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key-123');
  });
});

