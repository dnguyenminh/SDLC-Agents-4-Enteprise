/**
 * pega-discover.ts — CLI to discover a Pega app's service surface and print the
 * linked activities per service method. No DB required (discovery + link only).
 *
 * Env:
 *   PEGA_CODEINTEL_URL  e.g. https://host/prweb/api/CodeIntelligence/v1
 *   PEGA_APP_NAME      e.g. HRAppsV2
 *   PEGA_APP_VERSION   e.g. 01.01
 *   PEGA_AUTH          Authorization header value (e.g. Bearer ... or Basic ...)
 *   PEGA_ACCESS_GROUP  optional filter
 *
 * Run: npx tsx backend/scripts/pega-discover.ts
 */
import { PegaCodeIntelClient, rowInsKey } from '../src/modules/pega/discovery/index.js';
import { extractServiceLinks, type PegaServiceType } from '../src/modules/pega/discovery/index.js';

/** Derive a readable method name from a service-method pzInsKey. */
function methodNameFromInsKey(insKey: string): string {
  const m = insKey.match(/V1!([^ #]+)/);
  return m ? m[1] : insKey;
}

async function main(): Promise<void> {
  const base = process.env.PEGA_CODEINTEL_URL;
  const appName = process.env.PEGA_APP_NAME;
  const appVersion = process.env.PEGA_APP_VERSION;
  const auth = process.env.PEGA_AUTH;
  if (!base || !appName || !appVersion) {
    console.error('Missing PEGA_CODEINTEL_URL / PEGA_APP_NAME / PEGA_APP_VERSION');
    process.exit(1);
  }

  const client = new PegaCodeIntelClient(base, auth);

  const ag = await client.listDataPage('D_pzAccessGroupsByApplication', { AppName: appName, AppVersion: appVersion });
  console.log(`\n== Access Groups (${ag.length}) ==`);
  for (const r of ag) console.log(`  ${r.pyAccessGroup ?? rowInsKey(r)}`);

  const sp = await client.listDataPage('D_SvcPkgsInAvailableCurrentApp', { AppName: appName, AppVersion: appVersion });
  console.log(`\n== Service Packages (${sp.length}) ==`);

  for (const s of sp) {
    let serviceType = String(s.pyServiceType ?? '');
    let servicePackage = String(s.pyServicePackage ?? '');
    let accessGroup = String(s.pyAccessGroup ?? '');
    const spInsKey = rowInsKey(s);
    if (spInsKey && (!serviceType || !accessGroup)) {
      const spJson = await client.getRule(spInsKey);
      if (spJson) {
        serviceType = serviceType || String(spJson.pyServiceType ?? '');
        servicePackage = servicePackage || String(spJson.pyServicePackage ?? '');
        accessGroup = accessGroup || String(spJson.pyAccessGroup ?? '');
      }
    }
    console.log(`\n-- ${serviceType} / ${servicePackage} / ${accessGroup}`);
    const methods = await client.listDataPage('D_ServiceMethods', {
      ServiceType: serviceType, ServicePackage: servicePackage, AccessGroup: accessGroup,
    });
    for (const m of methods) {
      const insKey = rowInsKey(m);
      const methodName = String(m.pyMethodName ?? methodNameFromInsKey(insKey ?? ''));
      let links: ReturnType<typeof extractServiceLinks> = [];
      if (insKey) {
        const json = await client.getRule(insKey);
        if (json) {
          links = extractServiceLinks(json, serviceType as PegaServiceType, json.pyPrimaryPageClass as string | undefined);
        }
      }
      console.log(`   method ${methodName} ->`);
      for (const l of links) console.log(`      [${l.role}] ${l.ruleType} :: ${l.ruleName} (${l.appliesTo ?? '@baseclass'})`);
      if (!links.length) console.log('      (no linked activities detected)');
    }
  }
}

main().catch((err) => { console.error('Discovery failed:', err); process.exit(1); });
