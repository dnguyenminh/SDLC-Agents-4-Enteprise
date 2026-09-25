/**
 * SA4E-223 — Visualforce parser unit tests (regex/generic, wasmPath=null).
 */
import { describe, it, expect } from 'vitest';
import VisualforceParser from '../visualforce-parser.js';

const parser = new VisualforceParser(null, 'visualforce');

describe('VisualforceParser', () => {
  it('VF-1: <apex:page controller> -> VisualforcePage symbol + uses relationship', () => {
    const source = '<apex:page controller="MyCtrl">\n  content\n</apex:page>';
    const result = parser.parse(source, 'force-app/main/default/pages/MyPage.page');
    const sym = result.symbols.find(s => s.kind === 'visualforce_page');
    expect(sym).toBeDefined();
    expect(sym!.name).toBe('MyPage');
    expect(sym!.signature).toBe('VisualforcePage: MyPage');
    expect(sym!.modifiers).toEqual(['visualforce', 'page']);
    const rel = result.relationships.find(r => r.kind === 'uses');
    expect(rel).toBeDefined();
    expect(rel!.targetSymbol).toBe('MyCtrl');
  });

  it('VF-2: .component (VF) -> VisualforceComponent symbol', () => {
    const source = '<apex:component controller="OtherCtrl"/>';
    const result = parser.parse(source, 'force-app/main/default/components/MyComp.component');
    const sym = result.symbols.find(s => s.kind === 'class');
    expect(sym).toBeDefined();
    expect(sym!.signature).toBe('VisualforceComponent: MyComp');
    expect(sym!.modifiers).toEqual(['visualforce', 'component']);
  });

  it('VF-3: multi-line attrs still resolved', () => {
    const source = '<apex:page\n  controller="MultiLineCtrl"\n  extensions="ExtA,ExtB">\n</apex:page>';
    const result = parser.parse(source, 'force-app/main/default/pages/M.page');
    expect(result.symbols).toHaveLength(1);
    const rels = result.relationships.map(r => `${r.kind}->${r.targetSymbol}`).sort();
    expect(rels).toContain('uses->MultiLineCtrl');
    expect(rels).toContain('apex-import->ExtA');
    expect(rels).toContain('apex-import->ExtB');
  });

  it('VF/ERR: empty / non-markup -> no crash, empty symbols', () => {
    expect(parser.parse('', 'x.page').symbols).toEqual([]);
    expect(parser.parse('<html><body>x</body></html>', 'x.page').symbols).toEqual([]);
  });

  it('getSupportedExtensions', () => {
    expect(parser.getSupportedExtensions().sort()).toEqual(['.component', '.page']);
  });
});
