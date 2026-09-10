/**
 * SA4E-??? — PegaServiceDiscovery
 * Orchestrates the discovery walk:
 *   Access Groups -> Service Packages -> Service Methods -> linked Activities.
 * Reuses the existing PegaRuleFetcherService (download by pzInsKey) and the
 * PegaService indexer (store into symbols). The linked-activity extraction is
 * delegated to PegaServiceMethodLinker.
 */

import { extractServiceLinks, type LinkedRule, type PegaServiceType } from './PegaServiceMethodLinker.js';
import { PegaCodeIntelClient, rowInsKey, type DataPageRow } from './PegaCodeIntelClient.js';

/** A single discovered service method and its extracted links. */
export interface MethodLinkReport {
  serviceType: string;
  servicePackage: string;
  accessGroup: string;
  methodName: string;
  insKey?: string;
  links: LinkedRule[];
  indexed: boolean;
  error?: string;
}

/** Aggregate report for one discovery run. */
export interface ServiceDiscoveryReport {
  appName: string;
  appVersion: string;
  accessGroups: string[];
  servicePackages: number;
  methods: MethodLinkReport[];
  totalLinks: number;
  errors: string[];
}

/** Callbacks injected by the caller (keeps this module free of fetch/index internals). */
export interface DiscoveryDeps {
  downloadRule: (insKey: string) => Promise<{ ruleJson: Record<string, unknown> } | null>;
  indexRule: (ruleJson: Record<string, unknown>) => Promise<{ status: string; fqn?: string }>;
}

export interface ServiceDiscoveryOptions {
  codeIntelBase: string;
  appName: string;
  appVersion: string;
  authHeader?: string;
  projectId: string;
  index?: boolean;
  accessGroup?: string;
}

export class PegaServiceDiscovery {
  private readonly client: PegaCodeIntelClient;

  constructor(
    private readonly deps: DiscoveryDeps,
    codeIntelBase: string,
    authHeader?: string,
    client?: PegaCodeIntelClient,
  ) {
    this.client = client ?? new PegaCodeIntelClient(codeIntelBase, authHeader);
  }

  async run(opts: ServiceDiscoveryOptions): Promise<ServiceDiscoveryReport> {
    const report: ServiceDiscoveryReport = {
      appName: opts.appName, appVersion: opts.appVersion,
      accessGroups: [], servicePackages: 0, methods: [], totalLinks: 0, errors: [],
    };

    const agRows = await this.safeList('D_pzAccessGroupsByApplication', {
      AppName: opts.appName, AppVersion: opts.appVersion,
    }, report);
    report.accessGroups = agRows.map(row => String(row.pyAccessGroup ?? rowInsKey(row) ?? '')).filter(Boolean);

    const spRows = await this.safeList('D_SvcPkgsInAvailableCurrentApp', {
      AppName: opts.appName, AppVersion: opts.appVersion,
    }, report);
    report.servicePackages = spRows.length;

    for (const sp of spRows) {
      const spInsKey = rowInsKey(sp);
      let serviceType = String(sp.pyServiceType ?? '');
      let servicePackage = String(sp.pyServicePackage ?? '');
      let accessGroup = String(sp.pyAccessGroup ?? '');
      // The list row often leaves pyServiceType/pyAccessGroup blank; the real
      // values live in the service-package rule JSON — download it to resolve.
      if (spInsKey && (!serviceType || !accessGroup)) {
        try {
          const spJson = await this.client.getRule(spInsKey);
          if (spJson) {
            serviceType = serviceType || String(spJson.pyServiceType ?? '');
            servicePackage = servicePackage || String(spJson.pyServicePackage ?? '');
            accessGroup = accessGroup || String(spJson.pyAccessGroup ?? '');
          }
        } catch (err) {
          report.errors.push(`SP ${spInsKey}: ${(err as Error).message}`);
        }
      }
      if (opts.accessGroup && accessGroup && accessGroup !== opts.accessGroup) continue;

      const methods = await this.safeList('D_ServiceMethods', {
        ServiceType: serviceType, ServicePackage: servicePackage, AccessGroup: accessGroup,
      }, report);

      for (const m of methods) {
        await this.processMethod(m, serviceType, servicePackage, accessGroup, opts, report);
      }
    }
    report.totalLinks = report.methods.reduce((s, m) => s + m.links.length, 0);
    return report;
  }

  private async processMethod(
    methodRow: DataPageRow, serviceType: string, servicePackage: string,
    accessGroup: string, opts: ServiceDiscoveryOptions, report: ServiceDiscoveryReport,
  ): Promise<void> {
    const insKey = rowInsKey(methodRow);
    const methodName = String(methodRow.pyMethodName ?? methodRow.pyServiceName ?? insKey ?? 'unknown');
    const entry: MethodLinkReport = {
      serviceType, servicePackage, accessGroup, methodName, insKey, links: [], indexed: false,
    };
    try {
      if (!insKey) throw new Error('method row missing pzInsKey');
      const downloaded = await this.deps.downloadRule(insKey);
      if (!downloaded) throw new Error('download returned no rule');

      const json = downloaded.ruleJson;
      entry.links = extractServiceLinks(json, serviceType as PegaServiceType, json.pyClassName as string | undefined);

      if (opts.index) {
        augmentRuleReferences(json, entry.links);
        const res = await this.deps.indexRule(json);
        entry.indexed = res.status !== 'skipped' && res.status !== 'error';
      }
    } catch (err) {
      entry.error = (err as Error).message;
      report.errors.push(`${serviceType}/${servicePackage}/${methodName}: ${entry.error}`);
    }
    report.methods.push(entry);
  }

  private async safeList(
    name: string, body: Record<string, unknown>, report: ServiceDiscoveryReport,
  ): Promise<DataPageRow[]> {
    try {
      return await this.client.listDataPage(name, body);
    } catch (err) {
      report.errors.push(`${name}: ${(err as Error).message}`);
      return [];
    }
  }
}

/** Merge discovered service links into pxRuleReferences so downstream edge extraction sees them. */
export function augmentRuleReferences(json: Record<string, unknown>, links: LinkedRule[]): void {
  const existing = Array.isArray(json.pxRuleReferences) ? (json.pxRuleReferences as Record<string, unknown>[]) : [];
  const seen = new Set(existing.map(r => `${r.pxRuleObjClass}:${r.pyRuleName}`));
  for (const link of links) {
    const key = `${link.ruleType}:${link.ruleName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    existing.push({
      pxRuleObjClass: link.ruleType,
      pyRuleName: link.ruleName,
      pxRuleClassName: link.appliesTo ?? '@baseclass',
      pxReferenceType: 'ServiceLink',
      pxRole: link.role,
    });
  }
  json.pxRuleReferences = existing;
}
