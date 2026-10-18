/**
 * SA4E-169 — HTML assembly for the Enrichment Dashboard webview.
 * The document is composed from three byte-exact fragments (head/styles,
 * body markup, script) so the webview HTML stays identical to the original
 * single-template implementation.
 */
import type { DashboardData } from './types';
import { bodyFragment, headFragment } from './html-markup';
import { scriptFragment } from './html-script';

/** Build full HTML for the webview with embedded SVG chart + JS. */
export function buildHtml(data: DashboardData): string {
  return `${headFragment()}${bodyFragment(data)}${scriptFragment(data)}`;
}
