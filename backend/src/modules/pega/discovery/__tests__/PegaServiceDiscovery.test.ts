import { describe, it, expect, vi } from 'vitest';
import { PegaServiceDiscovery, augmentRuleReferences } from '../PegaServiceDiscovery.js';
import type { DataPageRow } from '../PegaCodeIntelClient.js';
import type { LinkedRule } from '../PegaServiceMethodLinker.js';

const AG_ROWS: DataPageRow[] = [{ pyAccessGroup: 'HRAppsV2:Administrators', pzInsKey: 'AG!1' }];
const SP_ROWS: DataPageRow[] = [{ pyServiceType: 'Rule-Service-REST', pyServicePackage: 'CodeIntelligence', pyAccessGroup: 'HRAppsV2:Administrators', pzInsKey: 'SP!1' }];
const METHOD_ROWS: DataPageRow[] = [{
  pyMethodName: 'QueryRuleData', pzInsKey: 'M!1',
  pxObjClass: 'Rule-Service-REST', pyPrimaryPageClass: 'CodeIntelligence-Int',
  pyPOSTServiceActivity: 'QueryRuleData', pyResponseDataTransform: 'RespDT',
}];

describe('PegaServiceDiscovery', () => {
  function makeClient() {
    return {
      listDataPage: vi.fn(async (name: string): Promise<DataPageRow[]> => {
        if (name === 'D_pzAccessGroupsByApplication') return AG_ROWS;
        if (name === 'D_SvcPkgsInAvailableCurrentApp') return SP_ROWS;
        if (name === 'D_ServiceMethods') return METHOD_ROWS;
        return [];
      }),
    } as any;
  }

  it('walks access groups -> service packages -> methods and extracts links', async () => {
    const indexRule = vi.fn(async () => ({ status: 'success', fqn: 'x' }));
    const downloadRule = vi.fn(async () => ({ ruleJson: METHOD_ROWS[0] as Record<string, unknown> }));
    const discovery = new PegaServiceDiscovery(
      { downloadRule, indexRule }, 'https://host/prweb/api/CodeIntelligence/v1', undefined, makeClient(),
    );

    const report = await discovery.run({
      codeIntelBase: 'https://host/prweb/api/CodeIntelligence/v1',
      appName: 'HRAppsV2', appVersion: '01.01', projectId: 'P1', index: true,
    });

    expect(report.accessGroups).toContain('HRAppsV2:Administrators');
    expect(report.servicePackages).toBe(1);
    expect(report.methods).toHaveLength(1);
    expect(report.methods[0].links.map((l: LinkedRule) => l.ruleName)).toEqual(['QueryRuleData']);
    expect(report.totalLinks).toBe(1);
    expect(indexRule).toHaveBeenCalledOnce();
  });

  it('augments pxRuleReferences with discovered links', () => {
    const json: Record<string, unknown> = { pxObjClass: 'Rule-Service-REST' };
    augmentRuleReferences(json, [
      { ruleName: 'GetCandidate', ruleType: 'Rule-Obj-Activity', role: 'processing-activity', appliesTo: 'C' },
    ]);
    const refs = json.pxRuleReferences as Record<string, unknown>[];
    expect(refs[0]).toMatchObject({ pxRuleObjClass: 'Rule-Obj-Activity', pyRuleName: 'GetCandidate' });
  });
});
