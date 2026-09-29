import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

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

test('sidebar links navigate to admin sections', async ({ page }) => {
  await page.goto(BASE_URL);
  // Login as admin (env or fallback)
  await page.getByRole('button', { name: /menu de usuario|abrir menú|usuario|perfil/i }).first().click();
  await page.getByText('Iniciar sesión').click();
  await page.fill('input[name="email"]', process.env.E2E_ADMIN_EMAIL ?? 'urbansportstore@outlook.com');
  await page.fill('input[name="password"]', process.env.E2E_ADMIN_PASSWORD ?? 'N4xF8jZ2wP9qL5vT');
  await page.getByRole('button', { name: /iniciar sesión|entrar|submit|log in/i }).first().click();
  await expect(page.locator('text=Administrador')).toBeVisible({ timeout: 15000 });

  for (const link of SIDEBAR) {
    const sidebarButton = page.locator('aside').getByRole('button', { name: link.label });
    await expect(sidebarButton).toBeVisible({ timeout: 15000 });
    await sidebarButton.click();
    await expect(page.locator(`text=${link.label}`)).toBeVisible({ timeout: 15000 });
  }
});
