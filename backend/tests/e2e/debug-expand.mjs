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

// Log camera distance to nearest cluster every 0.5s
await page.evaluate(() => {
  const lod = window.__lodManager;
  const orig = lod._checkDistances.bind(lod);
  let count = 0;
  lod._checkDistances = function() {
    if (count++ % 30 === 0) {
      const cam = this._graph.camera().position;
      let nearest = Infinity, nearestId = '';
      for (const [id, cluster] of this._clusters) {
        const d = this._distance(cam, cluster.center);
        if (d < nearest) { nearest = d; nearestId = id; }
      }
      const states = [...this._clusters.values()].map(c => c.state[0]).join('');
      console.log(`[LOD] cam=(${cam.x.toFixed(0)},${cam.y.toFixed(0)},${cam.z.toFixed(0)}) nearest=${nearestId} dist=${nearest.toFixed(0)} expandThr=${this._config.expandThreshold} states=${states}`);
    }
    orig.call(this);
  };
});

console.log('\nZoom in toward nodes in the browser window...');
await page.waitForTimeout(60000);
await browser.close();
