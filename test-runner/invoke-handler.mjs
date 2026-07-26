import fs from 'fs';
import path from 'path';

function makeRes() {
  let status = 200;
  const headers = {};
  let body = '';
  return {
    setHeader(k,v){headers[k]=v},
    end(s){ body += s; },
    get statusCode(){return status},
    set statusCode(v){status=v},
    _get(){ return { status, headers, body } }
  };
}

async function run(file){
  const mod = await import(pathToFileUrl(file));
  const handler = mod.default;
  const req = { method: 'GET', url: '/' };
  const res = makeRes();
  await handler(req, res);
  return res._get();
}

function pathToFileUrl(p){
  const abs = path.resolve(p).replace(/\\/g, '/');
  return 'file://' + abs;
}

(async ()=>{
  const base = './.vercel/output/functions/api';
  const tests = [
    {path: 'health.func/api/health.js', method: 'GET'},
    {path: 'products.func/api/products.js', method: 'GET'},
    {path: 'newsletter.func/api/newsletter.js', method: 'POST', body: JSON.stringify({email:'test@example.com'})},
    {path: 'admin/products/index.func/api/admin/products/index.js', method: 'GET'}
  ];
  for(const t of tests){
    const p = path.join(base, t.path || t);
    try{
      if(!fs.existsSync(p)){
        console.log(`${t.path || t} - MISSING`);
        continue;
      }
      const out = await runWithOptions(p, t.method || 'GET', t.body);
      console.log(`${t.path || t} -> status=${out.status}; body=${out.body.slice(0,400)}`);
    }catch(e){
      console.log(`${t.path || t} -> ERROR: ${e.message}`);
    }
  }
})();

async function runWithOptions(file, method='GET', body){
  const mod = await import(pathToFileUrl(file));
  const handler = mod.default;
  const req = { method, url: '/', on(event, cb){ if(event==='data'){ if(body) cb(body); } }, headers: {} };
  const res = makeRes();
  await handler(req, res);
  return res._get();
}
