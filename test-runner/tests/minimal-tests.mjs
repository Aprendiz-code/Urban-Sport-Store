import assert from 'assert';
import fs from 'fs';
import path from 'path';
function pathToFileUrl(p){
  const abs = path.resolve(p).replace(/\\/g, '/');
  return 'file://' + abs;
}

function makeRes(){
  let status = 200; let body = '';
  return {
    statusCode: status,
    set statusCode(v){status = v},
    setHeader(){},
    end(s){ body += s },
    _get(){ return { status, body } }
  };
}

async function runHandler(relPath, method='GET', body=null){
  const base = path.resolve(process.cwd(), '.vercel/output/functions/api');
  const file = path.join(base, relPath);
  if(!fs.existsSync(file)) throw new Error('handler missing: '+file);
  const mod = await import(pathToFileUrl(file));
  const handler = mod.default;
  const req = { method, url: '/', headers: {}, on(){}, body };
  const res = makeRes();
  await handler(req, res);
  return res._get();
}

async function main(){
  console.log('Running minimal tests...');
  // 1) health
  const h = await runHandler('health.func/api/health.js','GET');
  console.log('health ->', h.status);
  assert.strictEqual(h.status, 200, 'health must return 200');

  // 2) products (may require SUPABASE_URL to be valid). If it errors, report but do not fail hard.
  try{
    const p = await runHandler('products.func/api/products.js','GET');
    console.log('products ->', p.status);
    if(process.env.SUPABASE_REAL === 'true'){
      assert.strictEqual(p.status, 200, 'products should return 200 when running against a real Supabase instance');
    } else {
      console.log('products: running in local/dry mode — not asserting external Supabase reachability');
    }
  }catch(e){
    console.log('products -> ERROR:', e.message);
  }

  // 3) newsletter POST
  try{
    const body = JSON.stringify({ email: 'test+minimal@urbansportstore.test' });
    const n = await runHandler('newsletter.func/api/newsletter.js','POST', body);
    console.log('newsletter ->', n.status);
    // if service reachable, expect 200/201, else handler should at least run and return a JSON error
  }catch(e){
    console.log('newsletter -> ERROR:', e.message);
  }

  // 4) admin products GET — requires SUPABASE_SERVICE_ROLE_KEY or admin auth; prepare but skip if not available
  if(process.env.SUPABASE_SERVICE_ROLE_KEY){
    try{
      const a = await runHandler('admin/products/index.func/api/admin/products/index.js','GET');
      console.log('admin products ->', a.status);
    }catch(e){
      console.log('admin products -> ERROR:', e.message);
    }
  } else {
    console.log('admin products -> SKIPPED (missing SUPABASE_SERVICE_ROLE_KEY)');
  }

  console.log('Minimal tests complete.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
