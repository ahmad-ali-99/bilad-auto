// اختبار التطبيق الموبايل ببناء الإنتاج داخل Chromium (نفس محرك WebView)
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const DIST = '/home/user/bilad-auto/solar-pricing-mobile/dist';
const SCRATCH = '/tmp/claude-0/-home-user-bilad-auto/9e70cfa2-1e4c-589a-841a-b3eda9a7444a/scratchpad';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(DIST, p);
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8931, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 400, height: 850 } }); // مقاس موبايل
page.on('console', (msg) => { if (msg.type() === 'error') console.log('PAGE_ERROR:', msg.text()); });
page.on('pageerror', (err) => console.log('PAGE_EXCEPTION:', err.message));

await page.goto('http://127.0.0.1:8931/');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SCRATCH}/m1_splash.png` });

// دخول
await page.click('.splash-enter-btn');
await page.waitForTimeout(800);

// تعبئة العرض: 28 / 15 / 15 / 8
const inputs = page.locator('.big-inputs input');
await inputs.nth(0).fill('28');
await inputs.nth(1).fill('15');
await inputs.nth(2).fill('15');
await inputs.nth(3).fill('8');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SCRATCH}/m2_quote_top.png` });

const totalText = await page.locator('.total-badge').textContent().catch(() => 'NO_TOTAL');
console.log('TOTAL_BADGE:', totalText);

const breakdown = await page.locator('.muted').filter({ hasText: 'للتغذية' }).first().textContent().catch(() => 'NO_BREAKDOWN');
console.log('PANEL_BREAKDOWN:', breakdown);

// حفظ العرض ثم التأكد بقائمة العروض
await page.locator('button', { hasText: 'حفظ العرض' }).click();
await page.waitForTimeout(1200);

// شاشة المخزون
await page.locator('.mobile-bottomnav button', { hasText: 'المخزون' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${SCRATCH}/m3_inventory.png` });

// شاشة العروض
await page.locator('.mobile-bottomnav button', { hasText: 'العروض' }).click();
await page.waitForTimeout(700);
const quoteRow = await page.locator('table.data-table tbody tr').first().textContent().catch(() => 'NO_ROWS');
console.log('SAVED_QUOTE_ROW:', quoteRow.slice(0, 120));
await page.screenshot({ path: `${SCRATCH}/m4_quotes.png` });

// إعادة تحميل الصفحة للتأكد من ثبات الحفظ (persistence عبر IndexedDB على الويب)
await page.reload();
await page.waitForTimeout(2000);
await page.click('.splash-enter-btn');
await page.waitForTimeout(600);
await page.locator('.mobile-bottomnav button', { hasText: 'العروض' }).click();
await page.waitForTimeout(700);
const persisted = await page.locator('table.data-table tbody tr').first().textContent().catch(() => 'NO_ROWS_AFTER_RELOAD');
console.log('PERSISTED_QUOTE_ROW:', persisted.slice(0, 120));

await browser.close();
server.close();
console.log('MOBILE_TEST_DONE');
