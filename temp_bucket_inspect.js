const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envText = fs.readFileSync('api/.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(Boolean).map(line => {
  const [k, ...rest] = line.split('=');
  return [k.trim(), rest.join('=')];
}));
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  try {
    const buckets = await client.storage.listBuckets();
    console.log(JSON.stringify(buckets, null, 2));
  } catch (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
})();
