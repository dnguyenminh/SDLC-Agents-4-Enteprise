import { chromium } from 'playwright';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || 48721}`;

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const page = await browser.newPage();
page.on('console', msg => { if(msg.text().includes('[LOD]') || msg.text().includes('Error')) console.log('>', msg.text()); });
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto(`${BASE_URL}/admin`);
await page.waitForSelector('.login-box');
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[placeholder="Password"]', 'admin');
await page.click('button:has-text("Login")');
await page.waitForSelector('.nav-item', {timeout:10000});
await page.locator('.nav-item:has-text("Graph")').click();

console.log('Waiting for LOD init...');
await page.waitForFunction(() => !!window.__lodManager && window.__lodManager._initialized, { timeout: 30000 });
console.log('LOD initialized!');

let state = await page.evaluate(() => {
  const lod = window.__lodManager;
  return { clusters: lod._clusters.size, visible: lod._visibleNodes.size, graphNodes: lod._graph.graphData().nodes.length };
});
console.log('Initial:', JSON.stringify(state));

// Simulate zoom in with mouse wheel
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();

console.log('\n=== ZOOMING IN ===');
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(100);
}
await page.waitForTimeout(3000);

state = await page.evaluate(() => {
  const lod = window.__lodManager;
  const cam = lod._graph.camera().position;
  const expanded = [...lod._clusters.values()].filter(c => c.state === 'EXPANDED').length;
  return { visible: lod._visibleNodes.size, graphNodes: lod._graph.graphData().nodes.length, expanded, camDist: Math.sqrt(cam.x*cam.x + cam.y*cam.y + cam.z*cam.z).toFixed(0) };
});
console.log('After zoom in:', JSON.stringify(state));

console.log('\n=== ZOOMING OUT ===');
for (let i = 0; i < 30; i++) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
}
await page.waitForTimeout(3000);

state = await page.evaluate(() => {
  const lod = window.__lodManager;
  const cam = lod._graph.camera().position;
  const expanded = [...lod._clusters.values()].filter(c => c.state === 'EXPANDED').length;
  const collapsed = [...lod._clusters.values()].filter(c => c.state === 'COLLAPSED').length;
  return { visible: lod._visibleNodes.size, graphNodes: lod._graph.graphData().nodes.length, expanded, collapsed, camDist: Math.sqrt(cam.x*cam.x + cam.y*cam.y + cam.z*cam.z).toFixed(0) };
});
console.log('After zoom out:', JSON.stringify(state));

await page.waitForTimeout(5000);
await browser.close();
process.exit(0);
