/**
 * SA4E-223 — Aura parser unit tests (regex/generic, wasmPath=null).
 */
import { describe, it, expect } from 'vitest';
import AuraParser from '../aura-parser.js';

const parser = new AuraParser(null, 'aura');

describe('AuraParser', () => {
  it('AUR-1: <aura:component implements> -> AuraComponent + implements relationship', () => {
    const source = '<aura:component implements="force:appHostable">\n</aura:component>';
    const result = parser.parse(source, 'force-app/main/default/aura/MyCmp.cmp');
    const sym = result.symbols.find(s => s.kind === 'aura_component');
    expect(sym).toBeDefined();
    expect(sym!.name).toBe('MyCmp');
    expect(sym!.signature).toBe('AuraComponent: MyCmp');
    expect(sym!.modifiers).toEqual(['aura', 'component']);
    const rel = result.relationships.find(r => r.kind === 'implements');
    expect(rel).toBeDefined();
    expect(rel!.targetSymbol).toBe('force:appHostable');
  });

  it('AUR-2: .app / .evt / .intf / .tokens prefixes', () => {
    const app = parser.parse('<aura:application/>', 'x.app');
    expect(app.symbols[0].signature).toBe('AuraApplication: x');
    const evt = parser.parse('<aura:event/>', 'x.evt');
    expect(evt.symbols[0].signature).toBe('AuraEvent: x');
    const intf = parser.parse('<aura:interface/>', 'x.intf');
    expect(intf.symbols[0].signature).toBe('AuraInterface: x');
    const tokens = parser.parse('<aura:tokens/>', 'x.tokens');
    expect(tokens.symbols[0].signature).toBe('AuraTokens: x');
  });

  it('AUR-3: extends -> inherits relationship', () => {
    const source = '<aura:component extends="c:BaseCmp"/>';
    const result = parser.parse(source, 'force-app/main/default/aura/C.cmp');
    const rel = result.relationships.find(r => r.kind === 'inherits');
    expect(rel).toBeDefined();
    expect(rel!.targetSymbol).toBe('c:BaseCmp');
  });

  it('VF/AUR-ERR: empty / unknown root -> no crash, empty symbols', () => {
    expect(parser.parse('', 'x.cmp').symbols).toEqual([]);
    expect(parser.parse('<div>hi</div>', 'x.cmp').symbols).toEqual([]);
  });

  it('getSupportedExtensions', () => {
    expect(parser.getSupportedExtensions().sort()).toEqual(['.app', '.cmp', '.evt', '.intf', '.tokens']);
  });
});
