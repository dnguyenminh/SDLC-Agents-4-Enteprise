import { describe, it, expect } from 'vitest';
import { PegaPortalParser } from '../../portal/PegaPortalParser.js';
import { portalJson, skinJson, navigationJson } from './helpers.js';

describe('PegaPortalParser — Portal with sub-portals and skins', () => {
  const parser = new PegaPortalParser();

  it('parses Portal with sub-portals and skin references', () => {
    const json = portalJson();
    const portal = parser.parsePortal(json);
    expect(portal.pyName).toBe('MyPortal');
    expect(portal.pyLabel).toBe('My Custom Portal');
    expect(portal.pyPortals).toEqual(['SubPortalA', 'SubPortalB']);
    expect(portal.pySkins).toEqual(['CorporateSkin']);
  });

  it('parses portal with empty sub-portals and skins lists', () => {
    const json = portalJson({ pyPortals: [], pySkins: [] });
    const portal = parser.parsePortal(json);
    expect(portal.pyPortals).toEqual([]);
    expect(portal.pySkins).toEqual([]);
  });
});

describe('PegaPortalParser — Skin with visual properties', () => {
  const parser = new PegaPortalParser();

  it('parses Skin with colors, background, and fonts', () => {
    const json = skinJson();
    const skin = parser.parseSkin(json);
    expect(skin.pyName).toBe('CorporateSkin');
    expect(skin.pyColors).toEqual({ primary: '#1976d2', secondary: '#f5f5f5', accent: '#ff5722' });
    expect(skin.pyBackground).toBe('#ffffff');
    expect(skin.pyFonts).toEqual({ heading: 'Roboto', body: 'Open Sans' });
  });

  it('handles skin missing optional properties', () => {
    const json = skinJson({ pyColors: undefined, pyBackground: undefined, pyFonts: undefined });
    const skin = parser.parseSkin(json);
    expect(skin.pyName).toBe('CorporateSkin');
    expect(skin.pyColors).toBeUndefined();
    expect(skin.pyBackground).toBeUndefined();
    expect(skin.pyFonts).toBeUndefined();
  });
});

describe('PegaPortalParser — Navigation with menu items', () => {
  const parser = new PegaPortalParser();

  it('parses Navigation with top-level and nested menu items', () => {
    const json = navigationJson();
    const nav = parser.parseNavigation(json);
    expect(nav.pyName).toBe('MainNav');
    expect(nav.pyMenuItems).toHaveLength(3);
    expect(nav.pyMenuItems[0].label).toBe('Home');
    expect(nav.pyMenuItems[0].url).toBe('/home');
    expect(nav.pyMenuItems[0].icon).toBe('home');
    expect(nav.pyMenuItems[2].label).toBe('Admin');
    expect(nav.pyMenuItems[2].children).toHaveLength(2);
    expect(nav.pyMenuItems[2].children![0].label).toBe('Users');
    expect(nav.pyMenuItems[2].children![0].url).toBe('/admin/users');
    expect(nav.pyMenuItems[2].children![1].label).toBe('Config');
  });

  it('handles navigation with empty menu items', () => {
    const json = navigationJson({ pyMenuItems: [] });
    const nav = parser.parseNavigation(json);
    expect(nav.pyMenuItems).toEqual([]);
  });
});
