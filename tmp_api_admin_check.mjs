import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://geapxdyyfmygqrqfnier.supabase.co';
const anon = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlYXB4ZHl5Zm15Z3FycWZuaWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NDYwNjksImV4cCI6MjEwMDMyMjA2OX0.9-Mrkcrr-u5ghCe6UpK3B-11P62fYEqwlHzRXalh5O0';
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const email = 'urbansportstore@outlook.com';
const password = 'N4xF8jZ2wP9qL5vT';
const { data, error } = await client.auth.signInWithPassword({ email, password });
if (error) {
  console.error(JSON.stringify({ step: 'signin', error: error.message }, null, 2));
  process.exit(1);
}

const token = data.session?.access_token;
if (!token) {
  console.error(JSON.stringify({ step: 'signin', error: 'missing token' }, null, 2));
  process.exit(1);
}

const base = 'http://127.0.0.1:3000/api/admin';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const timestamp = Date.now();
const productName = `API E2E Product ${timestamp}`;
const sku = `API-E2E-SKU-${timestamp}`;

const createResp = await fetch(`${base}/products`, { method: 'POST', headers, body: JSON.stringify({ name: productName, price: 19900, category: 'Zapatos', stock: 15, description: 'created via real api', sku }) });
const createBody = await createResp.text();
console.log(JSON.stringify({ step: 'create', status: createResp.status, body: createBody }, null, 2));

const listResp = await fetch(`${base}/products`, { headers });
const listBody = await listResp.text();
console.log(JSON.stringify({ step: 'list', status: listResp.status, body: listBody }, null, 2));
