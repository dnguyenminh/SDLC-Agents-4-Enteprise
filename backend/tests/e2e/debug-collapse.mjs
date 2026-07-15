import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => { if(msg.text().includes('[LOD]')) console.log('CONSOLE:', msg.text()); });

await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});
await page.locator('.nav-item:has-text("Graph")').click();
await page.waitForFunction(() => !!window.__lodManager, { timeout: 40000 });

console.log('\n=== INITIAL STATE ===');
let state = await page.evaluate(() => {
  const lod = window.__lodManager;
  const clusters = [...lod._clusters.entries()].map(([id,c]) => ({ id, state: c.state, children: c.childNodeIds.length }));
  return { clusters: clusters.slice(0, 3), total: clusters.length, visible: lod._visibleNodes.size };
});
console.log(JSON.stringify(state, null, 2));

// Stop tick, expand first cluster
console.log('\n=== EXPANDING ===');
const expandResult = await page.evaluate(() => {
  const lod = window.__lodManager;
  if (lod._rafId) { cancelAnimationFrame(lod._rafId); lod._rafId = null; }
  const cam = lod._graph.camera().position;
  const [id, cluster] = [...lod._clusters.entries()][0];
  cam.x = cluster.center.x; cam.y = cluster.center.y; cam.z = cluster.center.z;
  const ok = lod.expandCluster(id);
  return { ok, id, state: cluster.state };
});
console.log(JSON.stringify(expandResult));

await page.waitForTimeout(600);

const afterExpand = await page.evaluate(() => {
  const lod = window.__lodManager;
  const [id, cluster] = [...lod._clusters.entries()][0];
  return { id, state: cluster.state, visible: lod._visibleNodes.size };
});
console.log('After expand wait:', JSON.stringify(afterExpand));

// Move camera far and check
console.log('\n=== ZOOM OUT + _checkDistances ===');
const collapseDebug = await page.evaluate(() => {
  const lod = window.__lodManager;
  const [id, cluster] = [...lod._clusters.entries()][0];
  const cam = lod._graph.camera().position;
  const centroid = lod._getExpandedCentroid(cluster);
  cam.x = 9999; cam.y = 9999; cam.z = 9999;
  const dist = lod._distance(cam, centroid);
  const shouldCollapse = dist > lod._config.collapseThreshold && !cluster.interacting;
  lod._checkDistances();
  return { 
    stateBefore: cluster.state === 'EXPANDED' ? 'WAS_EXPANDED' : cluster.state,
    stateAfter: cluster.state, 
    dist: Math.round(dist), 
    threshold: lod._config.collapseThreshold,
    shouldCollapse,
    interacting: cluster.interacting,
    animating: lod._animation.isAnimating(id),
  };
});
console.log(JSON.stringify(collapseDebug, null, 2));

await page.waitForTimeout(600);

const afterCollapse = await page.evaluate(() => {
  const lod = window.__lodManager;
  const [id, cluster] = [...lod._clusters.entries()][0];
  return { id, finalState: cluster.state, visible: lod._visibleNodes.size };
});
console.log('Final state:', JSON.stringify(afterCollapse));

await browser.close();
process.exit(0);
