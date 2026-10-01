import { test, expect } from '@playwright/test';

const SIDEBAR = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'homepage', label: 'Página principal' },
  { id: 'products', label: 'Productos' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'coupons', label: 'Cupones' },
  { id: 'reports', label: 'Reportes' },
  { id: 'activity', label: 'Actividad' },
  { id: 'settings', label: 'Ajustes' },
];

test('sidebar links navigate to admin sections', async ({ page, baseURL }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Requires dedicated E2E admin credentials.');
  await page.goto(baseURL!);
  await page.click('text=Iniciar sesión');
  await page.fill('input[name="email"]', process.env.E2E_ADMIN_EMAIL!);
  await page.fill('input[name="password"]', process.env.E2E_ADMIN_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');

  for (const link of SIDEBAR) {
    await page.click(`text=${link.label}`);
    await expect(page).toHaveURL(new RegExp(`adminSection=${link.id}`));
  }
});
