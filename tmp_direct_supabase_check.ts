import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('Missing env');
}

const client = createClient(url, key, { auth: { persistSession: false } });
const id = '4b7b080f-19f9-4884-a789-37aae5c8e8f0';

const { data, error } = await client.from('products').update({ description: 'direct-update-test' }).eq('id', id).select('*').maybeSingle();
console.log(JSON.stringify({ data, error }, null, 2));
