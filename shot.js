const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  await page.goto(process.argv[2], { waitUntil: 'networkidle' });
  await page.screenshot({ path: process.argv[3], fullPage: true });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
