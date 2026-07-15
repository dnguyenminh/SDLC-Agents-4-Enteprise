import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', msg => logs.push(msg.text()));
page.on('pageerror', err => logs.push('ERROR: ' + err.message));

await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});
await page.locator('.nav-item:has-text("Graph")').click();
await page.waitForTimeout(12000);

const state = await page.evaluate(() => {
  const lod = window.__lodManager;
  if (!lod) return { error: 'No LOD', hasClass: typeof window.LODManager !== 'undefined' };
  return { initialized: lod._initialized, clusters: lod._clusters.size, visible: lod._visibleNodes.size, config: lod._config };
});
console.log('\n=== LOD STATE ===');
console.log(JSON.stringify(state, null, 2));

if (state.initialized && state.clusters > 0) {
  console.log('\n=== EXPANDING cluster-000 ===');
  const r = await page.evaluate(() => {
    const lod = window.__lodManager;
    if (lod._rafId) { cancelAnimationFrame(lod._rafId); lod._rafId = null; }
    const cam = lod._graph.camera().position;
    const cluster = lod._clusters.get('cluster-000');
    if (!cluster) return { error: 'not found', keys: [...lod._clusters.keys()].slice(0,3) };
    cam.x = cluster.center.x; cam.y = cluster.center.y; cam.z = cluster.center.z;
    return { ok: lod.expandCluster('cluster-000'), state: cluster.state };
  });
  console.log(JSON.stringify(r));

  await page.waitForTimeout(3000);

  const after = await page.evaluate(() => {
    const lod = window.__lodManager;
    const c = lod._clusters.get('cluster-000');
    return { state: c?.state, loaded: c?.__childrenLoaded, children: c?.childNodeIds?.length, visible: lod._visibleNodes.size, graphNodes: lod._graph.graphData().nodes.length };
  });
  console.log('\nAfter expand:', JSON.stringify(after, null, 2));

  console.log('\n=== ZOOM OUT ===');
  const col = await page.evaluate(() => {
    const lod = window.__lodManager;
    const cam = lod._graph.camera().position;
    cam.x = 9999; cam.y = 9999; cam.z = 9999;
    lod._checkDistances();
    const c = lod._clusters.get('cluster-000');
    return { state: c?.state, visible: lod._visibleNodes.size };
  });
  console.log(JSON.stringify(col));

  await page.waitForTimeout(1000);
  const fin = await page.evaluate(() => {
    const lod = window.__lodManager;
    const c = lod._clusters.get('cluster-000');
    return { state: c?.state, visible: lod._visibleNodes.size, graphNodes: lod._graph.graphData().nodes.length };
  });
  console.log('Final:', JSON.stringify(fin));
}

const errs = logs.filter(l => l.includes('ERROR') || l.includes('error') || l.includes('[LOD]'));
if (errs.length) { console.log('\n=== LOGS ==='); errs.slice(0,20).forEach(l => console.log(l)); }

await browser.close();
process.exit(0);
