import { chromium } from 'playwright';

(async () => {
	const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
	const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'urbansportstore@outlook.com';
	const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'N4xF8jZ2wP9qL5vT';

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();

	page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
	page.on('pageerror', err => console.log('[pageerror]', err.message));
	page.on('requestfailed', req => console.log('[reqfailed]', req.url(), req.failure()?.errorText));

	await page.goto(BASE, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1000);

	// Try to open user menu and click "Iniciar sesión"
	const userBtn = await page.$('button[aria-label="Abrir menú de usuario"]');
	console.log('foundUserButton=', !!userBtn);
	if (userBtn) {
		await userBtn.click();
		await page.waitForTimeout(300);
		const loginBtn = await page.$('text=Iniciar sesión');
		console.log('foundLoginLink=', !!loginBtn);
		if (loginBtn) {
			await loginBtn.click();
		}
	}

	// If login form visible, fill
	const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
	const passInput = await page.$('input[type="password"], input[name="password"], input[placeholder*="contrase" i]');
	if (emailInput && passInput) {
		await emailInput.fill(ADMIN_EMAIL);
		await passInput.fill(ADMIN_PASSWORD);
		const submit = await page.$('button[type="submit"], button:has-text("Iniciar sesión")');
		if (submit) await submit.click();
	}

	// wait for admin text
	await page.waitForTimeout(3000);

	const adminVisible = await page.locator('text=Administrador').count();
	console.log('adminVisibleCount=', adminVisible);

	// Dump some useful DOM snippets
	const asideText = await page.locator('aside').first().innerText().catch(() => 'no-aside');
	console.log('asideTextSlice=', asideText.slice(0, 2000));

	// Product table rows
	const rows = await page.locator('tr').allTextContents().catch(() => []);
	console.log('productRowsCount=', rows.length);
	if (rows.length > 0) console.log('firstRow=', rows[0].slice(0, 500));

	await browser.close();
})();
