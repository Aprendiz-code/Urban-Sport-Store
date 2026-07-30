import http from 'http';
import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
    console.log('Loaded env from', filePath);
  } catch (e) {
    console.warn('Unable to load env file', filePath, e?.message);
  }
}

// Load api/.env.local relative to project root
const envPath = path.resolve(process.cwd(), 'api', '.env.local');
loadEnvFile(envPath);

import { createClient } from '@supabase/supabase-js';

// Create admin client from env loaded above
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
} else {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing after loading env file');
}

const port = process.env.LOCAL_API_PORT || 4002;

function json(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  try {
    if (req.method === 'POST' && url === '/api/auth/register') {
      if (!supabaseAdmin) return json(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured in process' });
      const body = await parseBody(req);
      const email = body?.email;
      const password = body?.password;
      const name = body?.name ?? '';
      if (!email || !password) return json(res, 400, { error: 'Missing email or password' });

      console.log('Local register request for', email);

      // @ts-ignore
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        user_metadata: { full_name: name },
        email_confirm: true,
      });

      if (error) {
        console.error('Supabase admin createUser error', error.message || error);
        return json(res, 400, { error: error.message || 'Unable to create user' });
      }

      console.log('User created:', data?.user?.id);
      return json(res, 200, { user: data.user ?? null });
    }

    return json(res, 404, { error: 'Not Found' });
  } catch (e) {
    console.error('Handler error', e?.message || e);
    return json(res, 500, { error: e?.message || 'Internal Server Error' });
  }
});

server.listen(port, () => console.log(`Local API runner listening on http://127.0.0.1:${port}`));
