import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((acc, line) => {
    const idx = line.indexOf('=');
    if (idx > -1) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      acc[key] = value;
    }
    return acc;
  }, {});

Object.assign(process.env, env);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const email = 'admin@urbansport.test';
const password = 'Admin123!';

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: 'ADMIN', isAdmin: true, full_name: 'Admin Test' },
  app_metadata: { role: 'ADMIN', isAdmin: true },
});

console.log(JSON.stringify({
  data: data ? { id: data.user?.id, email: data.user?.email, app_metadata: data.user?.app_metadata } : null,
  error: error ? { message: error.message, status: error.status } : null,
}, null, 2));
