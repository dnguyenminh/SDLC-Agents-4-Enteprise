import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => { if(msg.text().includes('[LOD]')) console.log('CONSOLE:', msg.text()); });
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

// Login
await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});

// Graph
await page.locator('.nav-item:has-text("Graph")').click();
console.log('Navigated to Graph, waiting 30s...');
await page.waitForTimeout(30000);

const lod = await page.evaluate(() => !!(window).__lodManager);
console.log('LOD available after 30s:', lod);

if (!lod) {
  const check = await page.evaluate(() => ({
    hasLODClass: typeof window.LODManager !== 'undefined',
    canvasCount: document.querySelectorAll('canvas').length,
  }));
  console.log('Debug:', check);
}

await browser.close();
process.exit(0);
