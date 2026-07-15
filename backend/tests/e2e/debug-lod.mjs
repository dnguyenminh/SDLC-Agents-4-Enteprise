import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE:', msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});
await page.locator('.nav-item:has-text("Graph")').click();

console.log('Waiting 15s for LOD init...');
await page.waitForTimeout(15000);

const debug = await page.evaluate(() => {
  const lod = window.__lodManager;
  if (!lod) return { lodExists: false, LODClass: typeof window.LODManager };
  const graphData = lod._graph.graphData();
  const first = graphData.nodes[0];
  return {
    lodExists: true,
    initialized: lod._initialized,
    clusterCount: lod._clusters.size,
    visibleNodes: lod._visibleNodes.size,
    graphNodes: graphData.nodes.length,
    graphLinks: graphData.links.length,
    firstNodeId: first?.id,
    firstNodeX: first?.x,
    firstNodeY: first?.y,
    firstNodeZ: first?.z,
    firstNodeIsSuper: first?.__isSuper,
  };
});

console.log('LOD Debug:', JSON.stringify(debug, null, 2));
await browser.close();
process.exit(0);
