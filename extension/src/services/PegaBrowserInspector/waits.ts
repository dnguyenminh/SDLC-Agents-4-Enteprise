/**
 * Shared wait helpers for the PegaBrowserInspector collaborators (SA4E-95).
 * Moved verbatim from the original monolith — same sleeps and timeouts.
 */

import { type Page, type HTTPResponse } from "puppeteer-core";

/** Wait for Pega loading indicators to clear, then for DOM mutations to settle. */
export async function waitForPegaRender(page: Page | null): Promise<void> {
  if (!page) return;
  try {
    await page.waitForFunction(() => {
      const l = document.querySelector(".loading-indicator, #pzLoading, .pega-busy");
      return !l || (l as HTMLElement).style.display === "none";
    }, { timeout: 15_000 });
  } catch (err) { console.debug('[PegaBrowserInspector] no loader :', (err as Error).message); }
  await page.waitForFunction(() => new Promise<boolean>((resolve) => {
    let t: ReturnType<typeof setTimeout>;
    const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { o.disconnect(); resolve(true); }, 1000); });
    o.observe(document.body, { childList: true, subtree: true });
    t = setTimeout(() => { o.disconnect(); resolve(true); }, 3000);
  }), { timeout: 10_000 });
}

/**
 * Poll until the popup HTML capture is populated (max 10s, 300ms interval),
 * then detach the response handler.
 */
export async function waitForPopupCapture(
  page: Page, handler: (resp: HTTPResponse) => Promise<void>, captured: { html: string },
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!captured.html && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
  }
  page.off("response", handler);
}
