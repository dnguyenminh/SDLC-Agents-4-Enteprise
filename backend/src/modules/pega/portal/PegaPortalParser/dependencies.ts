/**
 * Dependency extraction for Pega UI rules (Section/Harness/FlowAction/Portal/Skin).
 * Extracted from PegaPortalParser (BR-18) — pure functions; no behavior change.
 */

import type { UnresolvedDependency } from '../../models.js';

export function extractDependencies(json: Record<string, unknown>, pxObjClass: string): UnresolvedDependency[] {
  const deps: UnresolvedDependency[] = [];

  if (pxObjClass === 'Rule-HTML-Section') {
    const layouts = Array.isArray(json.pyLayouts) ? (json.pyLayouts as Record<string, unknown>[]) : [];
    extractLayoutDeps(layouts, deps);
  }

  if (pxObjClass === 'Rule-HTML-Harness') {
    for (const key of ['pyHeader', 'pyContent', 'pyFooter']) {
      const sub = json[key];
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        const sectionJson = sub as Record<string, unknown>;
        const subLayouts = Array.isArray(sectionJson.pyLayouts) ? (sectionJson.pyLayouts as Record<string, unknown>[]) : [];
        extractLayoutDeps(subLayouts, deps);
      }
    }
  }

  if (pxObjClass === 'Rule-HTML-FlowAction') {
    const layouts = Array.isArray(json.pyLayouts) ? (json.pyLayouts as Record<string, unknown>[]) : [];
    extractLayoutDeps(layouts, deps);
  }

  if (pxObjClass === 'Rule-Portal') {
    const portals = Array.isArray(json.pyPortals) ? (json.pyPortals as string[]) : [];
    for (const p of portals) {
      deps.push({ ruleType: 'Rule-Portal', className: '@baseclass', ruleName: p });
    }
  }

  if (pxObjClass === 'Rule-Portal-Skin') {
    const portalRef = json.pyPortal as string;
    if (portalRef) {
      deps.push({ ruleType: 'Rule-Portal', className: '@baseclass', ruleName: portalRef });
    }
  }

  return deps;
}

export function extractLayoutDeps(layouts: Record<string, unknown>[], deps: UnresolvedDependency[]): void {
  for (const layout of layouts) {
    const when = (layout.when as string) || (layout.pyWhen as string);
    if (when && when.trim()) {
      deps.push({ ruleType: 'Rule-Declare-When', className: '@baseclass', ruleName: when.trim() });
    }
    const children = Array.isArray(layout.children) ? (layout.children as Record<string, unknown>[]) : [];
    if (children.length > 0) {
      extractLayoutDeps(children, deps);
    }
  }
}
