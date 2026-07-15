import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.on('console', msg => { if(msg.text().includes('[LOD]')) console.log(msg.text()); });

await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});
await page.locator('.nav-item:has-text("Graph")').click();
await page.waitForFunction(() => !!window.__lodManager, { timeout: 40000 });

// Add debug logging to _checkDistances
await page.evaluate(() => {
  const lod = window.__lodManager;
  const orig = lod._checkDistances.bind(lod);
  let logCount = 0;
  lod._checkDistances = function() {
    const cam = this._graph.camera().position;
    if (logCount++ % 60 === 0) {
      const expanded = [...this._clusters.values()].filter(c => c.state === 'EXPANDED');
      if (expanded.length > 0) {
        for (const c of expanded) {
          const centroid = this._getExpandedCentroid(c);
          const dist = this._distance(cam, centroid);
          console.log(`[LOD] TICK cam=(${cam.x.toFixed(0)},${cam.y.toFixed(0)},${cam.z.toFixed(0)}) cluster=${c.id} dist=${dist.toFixed(0)} threshold=${this._config.collapseThreshold}`);
        }
      }
    }
    orig.call(this);
  };
});

console.log('\nLOD debug active. Interact with graph...');
await page.waitForTimeout(120000);
await browser.close();
