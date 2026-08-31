import { describe, it, expect } from 'vitest';
import { extractServiceLinks } from '../PegaServiceMethodLinker.js';

describe('PegaServiceMethodLinker', () => {
  it('extracts REST verb-specific service activities', () => {
    const json = {
      pxObjClass: 'Rule-Service-REST',
      pyPrimaryPageClass: 'CodeIntelligence-Int',
      pyPOSTServiceActivity: 'QueryRuleData',
      pyPOSTFallbackActivity: 'FallbackAct',
      pyGETServiceActivity: '',
    };
    const links = extractServiceLinks(json, 'Rule-Service-REST');
    expect(links).toContainEqual({
      ruleName: 'QueryRuleData', ruleType: 'Rule-Obj-Activity', role: 'POST-processing-activity', appliesTo: 'CodeIntelligence-Int',
    });
    expect(links).toContainEqual({
      ruleName: 'FallbackAct', ruleType: 'Rule-Obj-Activity', role: 'POST-fallback-activity', appliesTo: 'CodeIntelligence-Int',
    });
  });

  it('extracts SOAP top-level processing activity', () => {
    const json = {
      pxObjClass: 'Rule-Service-SOAP',
      pyClassName: 'TGB-HRApps-Int',
      pyActivityName: 'ProcessClaim',
      pyResponseDataTransform: 'OutDT',
    };
    const links = extractServiceLinks(json, 'Rule-Service-SOAP');
    expect(links).toContainEqual({
      ruleName: 'ProcessClaim', ruleType: 'Rule-Obj-Activity', role: 'processing-activity', appliesTo: 'TGB-HRApps-Int',
    });
    expect(links).toContainEqual({
      ruleName: 'OutDT', ruleType: 'Rule-Obj-Model', role: 'response-transform', appliesTo: 'TGB-HRApps-Int',
    });
  });

  it('uses generic fallback for unknown service types', () => {
    const json = { pxObjClass: 'Rule-Service-CUSTOM', pyClassName: 'My-Class', pyActivityName: 'DoWork' };
    const links = extractServiceLinks(json, 'Rule-Service-CUSTOM');
    expect(links).toEqual([
      { ruleName: 'DoWork', ruleType: 'Rule-Obj-Activity', role: 'processing-activity', appliesTo: 'My-Class' },
    ]);
  });

  it('deduplicates links across pyMethods[]', () => {
    const json = {
      pyClassName: 'C',
      pyMethods: [
        { pyActivityName: 'Shared' },
        { pyActivityName: 'Shared' },
      ],
    };
    const links = extractServiceLinks(json, 'Rule-Service-REST');
    expect(links.filter(l => l.ruleName === 'Shared')).toHaveLength(1);
  });

  it('returns empty for method with no links', () => {
    expect(extractServiceLinks({ pyClassName: 'C' }, 'Rule-Service-FILE')).toEqual([]);
  });
});
