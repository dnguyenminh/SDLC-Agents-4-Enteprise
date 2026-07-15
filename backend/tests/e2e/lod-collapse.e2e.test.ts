/**
 * E2E Tests — KSA-291: LOD Collapse on Zoom Out
 * Tests real LODManager with real data from server (72k KB entries → 500 graph nodes → LOD clusters).
 * 
 * Run: npx playwright test lod-collapse.e2e.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { BASE_URL, ADMIN_URL } from './setup/e2e-config.js';

test.setTimeout(60000);

async function loginAndInitLOD(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.waitForSelector('.login-box', { timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Login")');
  await page.waitForSelector('.nav-item', { timeout: 10000 });
  await page.locator('.nav-item:has-text("Graph")').click();
  // Wait for LOD to initialize (graph load + 5s delay + clustering)
  await page.waitForFunction(() => !!(window as any).__lodManager, { timeout: 40000 });
}

async function getLODState(page: Page) {
  return page.evaluate(() => {
    const lod = (window as any).__lodManager;
    if (!lod || !lod._initialized) return null;
    const clusters: any[] = [];
    for (const [id, cluster] of lod._clusters as Map<string, any>) {
      clusters.push({ id, state: cluster.state, childCount: cluster.childNodeIds?.length || 0 });
    }
    return {
      clusterCount: lod._clusters.size,
      expandedCount: clusters.filter((c: any) => c.state === 'EXPANDED').length,
      collapsedCount: clusters.filter((c: any) => c.state === 'COLLAPSED').length,
      visibleNodeCount: lod._visibleNodes.size,
      clusters,
    };
  });
}

test.describe('KSA-291: LOD Collapse on Zoom Out', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndInitLOD(page);
  });

  test('E2E-UI-1: Expanded cluster collapses when camera moves far away', async ({ page }) => {
    const state = await getLODState(page);
    expect(state).not.toBeNull();
    expect(state!.clusterCount).toBeGreaterThan(0);

    const target = state!.clusters.find(c => c.state === 'COLLAPSED')!;
    expect(target).toBeDefined();

    // Expand cluster (stop tick to prevent auto-collapse)
    const ok = await page.evaluate((cid) => {
      const lod = (window as any).__lodManager;
      // Stop auto-tick so _checkDistances doesn't interfere
      if (lod._rafId) { cancelAnimationFrame(lod._rafId); lod._rafId = null; }
      return lod.expandCluster(cid);
    }, target.id);
    expect(ok).toBe(true);
    await page.waitForTimeout(500);

    // Verify expanded
    const s2 = await getLODState(page);
    expect(s2!.clusters.find(c => c.id === target.id)?.state).toBe('EXPANDED');

    // Move camera far away and trigger collapse
    await page.evaluate(() => {
      const lod = (window as any).__lodManager;
      const cam = lod._graph.camera().position;
      cam.x = 9999; cam.y = 9999; cam.z = 9999;
      lod._checkDistances();
    });
    await page.waitForTimeout(500);

    // Verify collapse triggered
    const s3 = await getLODState(page);
    const final = s3!.clusters.find(c => c.id === target.id);
    expect(['COLLAPSED', 'COLLAPSING']).toContain(final?.state);
  });

  test('E2E-UI-2: Budget enforcement prevents exceeding maxVisibleNodes', async ({ page }) => {
    // Stop tick, then try to expand ALL clusters — budget should block some
    const result = await page.evaluate(() => {
      const lod = (window as any).__lodManager;
      if (lod._rafId) { cancelAnimationFrame(lod._rafId); lod._rafId = null; }
      const cam = lod._graph.camera().position;
      let attempted = 0, succeeded = 0;
      for (const [id, cluster] of lod._clusters) {
        if (cluster.state !== 'COLLAPSED') continue;
        attempted++;
        cam.x = cluster.center.x; cam.y = cluster.center.y; cam.z = cluster.center.z;
        if (lod.expandCluster(id)) succeeded++;
      }
      return { attempted, succeeded, visible: lod._visibleNodes.size };
    });
    await page.waitForTimeout(500);

    // Budget enforcement works: either blocks some OR collapses farthest to make room
    // Key assertion: visible nodes never exceed maxVisibleNodes
    expect(result.visible).toBeLessThanOrEqual(200);
  });

  test('E2E-UI-3: All clusters start as COLLAPSED', async ({ page }) => {
    const state = await getLODState(page);
    expect(state!.clusterCount).toBeGreaterThan(0);
    expect(state!.collapsedCount).toBe(state!.clusterCount);
    expect(state!.expandedCount).toBe(0);
  });

  test('E2E-UI-4: No stuck clusters after full zoom-out', async ({ page }) => {
    await page.evaluate(() => {
      const lod = (window as any).__lodManager;
      const cam = lod._graph.camera().position;
      let count = 0;
      for (const [id, cluster] of lod._clusters) {
        if (count >= 3) break;
        if (cluster.state !== 'COLLAPSED') continue;
        cam.x = cluster.center.x; cam.y = cluster.center.y; cam.z = cluster.center.z;
        if (lod.expandCluster(id)) count++;
      }
    });
    await page.waitForTimeout(500);

    const s2 = await getLODState(page);
    expect(s2!.expandedCount).toBeGreaterThanOrEqual(1);

    // Zoom far out
    await page.evaluate(() => {
      const lod = (window as any).__lodManager;
      const cam = lod._graph.camera().position;
      cam.x = 99999; cam.y = 99999; cam.z = 99999;
      lod._checkDistances();
    });
    await page.waitForTimeout(500);

    const s3 = await getLODState(page);
    for (const c of s3!.clusters) {
      expect(['COLLAPSED', 'COLLAPSING']).toContain(c.state);
    }
  });

  test('E2E-UI-5: Dynamic centroid uses actual child positions', async ({ page }) => {
    const result = await page.evaluate(() => {
      const lod = (window as any).__lodManager;
      const [, cluster] = [...lod._clusters.entries()][0];
      cluster.state = 'EXPANDED';
      const centroid = lod._getExpandedCentroid(cluster);
      const children = lod._getChildNodes(cluster);
      if (!children.length) return { pass: true };
      const ex = children.reduce((s: number, n: any) => s + (n.x || 0), 0) / children.length;
      const ey = children.reduce((s: number, n: any) => s + (n.y || 0), 0) / children.length;
      const ez = children.reduce((s: number, n: any) => s + (n.z || 0), 0) / children.length;
      return { pass: Math.abs(centroid.x - ex) < 0.01 && Math.abs(centroid.y - ey) < 0.01 && Math.abs(centroid.z - ez) < 0.01 };
    });
    expect(result.pass).toBe(true);
  });
});
