import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`shopping assistant stays usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/assistant/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message: 'Estas son opciones del catálogo activo. Las tallas son talla listada.',
          source: 'catalog',
          products: [],
          needsWhatsApp: false,
        }),
      });
    });

    await page.goto('/');
    const trigger = page.getByRole('button', { name: '¿Te ayudamos?' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByRole('dialog', { name: 'Asistente Urban Sport' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buscar tenis' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hablar por WhatsApp' }).first()).toBeVisible();

    const panel = await page.getByRole('dialog', { name: 'Asistente Urban Sport' }).boundingBox();
    expect(panel).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width);

    const whatsappLink = page.getByRole('link', { name: 'Hablar por WhatsApp' }).first();
    await expect(whatsappLink).toHaveAttribute('href', /^https:\/\/wa\.me\/573157760273\?text=/);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Asistente Urban Sport' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
