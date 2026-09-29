import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
console.log('title=', await page.title());
console.log('bodyText=', (await page.locator('body').innerText()).slice(0, 2000));
console.log('buttonCount=', await page.locator('button').count());
console.log('hasUserMenu=', await page.locator('button[aria-label="Abrir menú de usuario"]').count());
await browser.close();
