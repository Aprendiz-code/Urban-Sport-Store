import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'urbansportstore@outlook.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'N4xF8jZ2wP9qL5vT';

test('admin end-to-end: login, products CRUD, homepage heroTitle update and audit logs', async ({ page }) => {
  const productName = `E2E Product ${Date.now()}`;
  const updatedProductName = `${productName} (edited)`;
  const heroTitle = `E2E Home Hero ${Date.now()}`;

  // Instrumentación global: registrar requests/responses desde el inicio
  const debugDirRoot = path.join(process.cwd(), 'temp', 'e2e-debug');
  await mkdir(debugDirRoot, { recursive: true });
  const requests: Array<any> = [];
  const responses: Array<any> = [];
  page.on('request', (r) => {
    try { requests.push({ url: r.url(), method: r.method(), postData: r.postData?.(), headers: r.headers() }); } catch (e) { requests.push({ url: r.url(), method: r.method() }); }
  });
  page.on('response', async (r) => {
    try {
      const txt = await r.text().catch(() => null);
      responses.push({ url: r.url(), status: r.status(), statusText: r.statusText(), body: txt });
    } catch (e) { responses.push({ url: r.url(), status: r.status() }); }
  });

  await page.goto(BASE_URL);

  // dump initial network after page load
  const initialTs = Date.now();
  await writeFile(path.join(debugDirRoot, `network_initial_${initialTs}.json`), JSON.stringify({ requests, responses }, null, 2));
  const initialDom = await page.content();
  await writeFile(path.join(debugDirRoot, `dom_after_load_${initialTs}.html`), initialDom);
  await page.screenshot({ path: path.join(debugDirRoot, `screenshot_after_load_${initialTs}.png`), fullPage: true });
  await page.getByRole('button', { name: /menu de usuario|abrir menú|usuario|perfil/i }).first().click();
  await page.getByText('Iniciar sesión').click();
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión|entrar|submit|log in/i }).first().click();

  await expect(page.locator('text=Administrador')).toBeVisible({ timeout: 15000 });
  const productsSidebarButton = page.locator('aside').getByRole('button', { name: 'Productos' });
  await expect(productsSidebarButton).toBeVisible({ timeout: 15000 });
  await productsSidebarButton.click();
  await page.click('button:has-text("Nuevo producto")');
  await page.locator('input[placeholder="Ej: Nike Air Force 1"]').waitFor({ timeout: 15000 });

  await page.locator('input[placeholder="Ej: Nike Air Force 1"]').fill(productName);
  await page.locator('input[placeholder="Ej: Nike"]').fill('E2E Brand');
  await page.locator('label', { hasText: /Precio/i }).locator('xpath=following-sibling::div//input').fill('19900');
  await page.locator('label', { hasText: /Stock/i }).locator('xpath=following-sibling::input').fill('15');
  await page.locator('input[placeholder="Ej: NKE-AF1-001"]').fill(`E2E-SKU-${Date.now()}`);
  await page.locator('label', { hasText: /Categor[ií]a/i }).locator('xpath=following-sibling::select').selectOption({ label: 'Zapatos' });
  await page.getByPlaceholder('Pega una URL pública (ej: https://example.com/image.jpg)').fill('https://example.com/image.jpg');

  // Instrumentación: las listeners de requests/responses ya están registradas arriba

  // instrumentar fetch/XHR en la página para capturar llamadas que no pasan por Playwright listeners
  await page.evaluate(() => {
    (window as any).__e2e_calls = [];
    const oldFetch = window.fetch;
    window.fetch = function(...args) {
      try { (window as any).__e2e_calls.push({ type: 'fetch', args }); } catch (e) {}
      return oldFetch.apply(this, args as any);
    } as typeof fetch;
    const OldXhr = (window as any).XMLHttpRequest;
    function X() {
      const xhr = new OldXhr();
      const open = xhr.open;
      const send = xhr.send;
      (xhr as any).open = function(method: any, url: any) { (xhr as any).__e2e_xhr = { method, url }; return open.apply(xhr, arguments as any); };
      (xhr as any).send = function(body: any) { try { (window as any).__e2e_calls.push({ type: 'xhr', method: (xhr as any).__e2e_xhr?.method, url: (xhr as any).__e2e_xhr?.url, body }); } catch (e) {} ; return send.apply(xhr, arguments as any); };
      return xhr;
    }
    try { (window as any).XMLHttpRequest = X as any; } catch (e) {}
  });

  // click + capture POST to /api/admin/products (wait up to 7s)
  await page.getByRole('button', { name: /crear producto|crear|nuevo producto|✅ Crear producto/i }).first().click();
  const createResp = await Promise.race([
    page.waitForResponse((r) => r.url().includes('/api/admin/products') && r.request().method() === 'POST', { timeout: 7000 }).catch(() => null),
    (async () => { await page.waitForTimeout(7000); return null; })(),
  ]);

  const ts = Date.now();
  await writeFile(path.join(debugDirRoot, `network_after_submit_${ts}.json`), JSON.stringify({ requests, responses }, null, 2));

  // Read in-page instrumented calls (fetch/XHR) and persist
  const inPageCalls = await page.evaluate(() => (window as any).__e2e_calls || []);
  await writeFile(path.join(debugDirRoot, `inpage_calls_${ts}.json`), JSON.stringify(inPageCalls, null, 2));

  let createdBody: any = {};
  if (createResp) {
    try { createdBody = await createResp.json(); } catch (e) { try { const t = await createResp.text(); createdBody = { text: t }; } catch { createdBody = { error: String(e) }; } }
    await writeFile(path.join(debugDirRoot, `create_response_${ts}.json`), JSON.stringify({ url: createResp.url(), status: createResp.status(), body: createdBody }, null, 2));
  } else {
    await writeFile(path.join(debugDirRoot, `create_response_${ts}.json`), JSON.stringify({ note: 'no create response observed', requestsLen: requests.length, responsesLen: responses.length }, null, 2));
  }

  // dump DOM and screenshot after submit
  const domHtml = await page.content();
  await writeFile(path.join(debugDirRoot, `dom_after_create_${ts}.html`), domHtml);
  await page.screenshot({ path: path.join(debugDirRoot, `screenshot_after_create_${ts}.png`), fullPage: true });

  const createdName = createdBody?.data?.name ?? productName;
  const productText = page.locator(`text=${createdName}`).first();
  await expect(productText).toBeVisible({ timeout: 15000 });
  const productRow = productText.locator('xpath=ancestor::tr[1]');
  await productRow.getByRole('button', { name: /editar|editar producto/i }).first().click();
  await page.getByLabel('Nombre *').fill(updatedProductName);
  await page.getByRole('button', { name: /guardar cambios|💾 Guardar cambios|guardar/i }).first().click();
  await expect(page.locator('tr', { hasText: updatedProductName })).toBeVisible({ timeout: 15000 });

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('tr', { hasText: updatedProductName }).getByRole('button', { name: /eliminar|borrar/i }).first().click();
  await expect(page.locator('tr', { hasText: updatedProductName })).toHaveCount(0, { timeout: 15000 });

  const homepageSidebarButton = page.locator('aside').getByRole('button', { name: 'Página principal' });
  await homepageSidebarButton.click();
  await expect(page.getByLabel('Título hero')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Título hero').fill(heroTitle);
  await page.click('button:has-text("Guardar contenido")');
  await expect(page.getByLabel('Título hero')).toHaveValue(heroTitle, { timeout: 15000 });

  const activitySidebarButton = page.locator('aside').getByRole('button', { name: 'Actividad' });
  await activitySidebarButton.click();
  await page.getByRole('button', { name: /actualizar|update/i }).first().click();
  await expect(page.locator('text=update_home_content')).toBeVisible({ timeout: 15000 });
});
