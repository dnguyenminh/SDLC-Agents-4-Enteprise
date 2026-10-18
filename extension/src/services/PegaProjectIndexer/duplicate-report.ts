/**
 * PegaProjectIndexer — duplicate-version report (SA4E-155).
 * Groups fetched rules by FQN and logs which rules appear with multiple versions.
 */

export interface VersionEntry { versions: string[]; sources: string[]; }

type LogFn = (msg: string) => void;

/** Group by FQN = pxObjClass:pyClassName:name (same logic as PegaSymbolParser) */
function buildVersionMap(rules: Record<string, unknown>[]): Map<string, VersionEntry> {
    const versionMap = new Map<string, VersionEntry>();
    for (const rule of rules) {
        const ruleType = String(rule.pxObjClass || '');
        const className = String(rule.pyClassName || '@baseclass');
        const name = String(rule.pyActivityName || rule.pyModelName || rule.pyRuleName || rule.pyLabel || '');
        const version = String(rule.pyRuleSetVersion || '');
        const source = String((rule as any)._sourceClass || className);
        const fqn = `${ruleType}:${className}:${name}`;
        if (!versionMap.has(fqn)) { versionMap.set(fqn, { versions: [], sources: [] }); }
        const entry = versionMap.get(fqn)!;
        entry.versions.push(version);
        entry.sources.push(source);
    }
    return versionMap;
}

/**
 * SA4E-155: Log rules that have multiple versions in the fetched set.
 * Groups by FQN (pxObjClass:pyClassName:ruleName) which is the dedup key used by ingestRule.
 */
export function logDuplicateVersions(rules: Record<string, unknown>[], log: LogFn): void {
    const versionMap = buildVersionMap(rules);

    const duplicates = Array.from(versionMap.entries())
        .filter(([, data]) => data.versions.length > 1)
        .sort((a, b) => b[1].versions.length - a[1].versions.length);

    if (duplicates.length === 0) {
        log(`[Pega Indexer] ✅ No duplicate versions found — all ${versionMap.size} FQNs are unique.`);
        return;
    }

    const totalWasted = rules.length - versionMap.size;
    log(`\n=== DUPLICATE VERSIONS REPORT ===`);
    log(`Total fetched rules: ${rules.length}`);
    log(`Unique FQNs: ${versionMap.size}`);
    log(`Rules with multiple occurrences: ${duplicates.length}`);
    log(`Wasted fetches (overwritten by dedup): ${totalWasted}`);

    // Categorize: same-version duplicates (inheritance) vs real multi-version
    const inherited = duplicates.filter(([, d]) => new Set(d.versions).size === 1);
    const multiVersion = duplicates.filter(([, d]) => new Set(d.versions).size > 1);

    logMultiVersion(multiVersion, log);
    logInherited(inherited, log);

    log(`=== END DUPLICATE VERSIONS REPORT ===\n`);
}

function logMultiVersion(multiVersion: [string, VersionEntry][], log: LogFn): void {
    if (multiVersion.length === 0) { return; }
    log(`\n⚠️ REAL multi-version rules (API not filtering latest): ${multiVersion.length}`);
    for (const [fqn, data] of multiVersion.slice(0, 20)) {
        const uniqueVersions = [...new Set(data.versions)].join(', ');
        log(`  ${fqn} — ${data.versions.length} entries, unique versions: [${uniqueVersions}]`);
    }
}

function logInherited(inherited: [string, VersionEntry][], log: LogFn): void {
    if (inherited.length === 0) { return; }
    log(`\n📋 Inherited duplicates (same rule fetched from ${inherited.length} class expansions):`);
    for (const [fqn, data] of inherited.slice(0, 10)) {
        log(`  ${fqn} — fetched ${data.versions.length}x (version: ${data.versions[0]})`);
    }
    if (inherited.length > 10) {
        log(`  ... and ${inherited.length - 10} more inherited duplicates`);
    }
}
