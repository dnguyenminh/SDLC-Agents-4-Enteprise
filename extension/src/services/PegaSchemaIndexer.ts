/**
 * PegaSchemaIndexer — Batch generate JSON Schemas from ALL Pega RuleForm harnesses (SA4E-93).
 * Pipeline: Crawl harness list → fetch each harness + sections → backend generates schema → write file.
 */
import type { IndexerHttpClient } from "./IndexerHttpClient";
import type { JsonSchema } from "../models";
import { buildBackendAuthHeaders, withAuthRetry, type IngestAuthProvider } from "../utils/backend-auth-headers";
import { SchemaKbIngester } from "./pega-schema-ingest";

type PegaHttpClientType = InstanceType<typeof import("./PegaHttpClient").PegaHttpClient>;
type ProgressReporter = import("vscode").Progress<{ message?: string }>;

export class PegaSchemaIndexer {
    constructor(
        private readonly httpClient: IndexerHttpClient,
        private readonly log: (msg: string) => void,
        private readonly auth?: IngestAuthProvider,
    ) {}

    /** Generate schemas for all RuleForm harness rule types. */
    async run(
        root: string, report: ProgressReporter,
        pegaClient: PegaHttpClientType,
    ): Promise<string> {
        const { SchemaWriter } = await import("./SchemaWriter");
        const writer = new SchemaWriter();
        const kbIngest = new SchemaKbIngester(this.log);

        report.report({ message: "Crawling Pega RuleForm harnesses..." });
        const harnesses = await this.crawlAllHarnesses(pegaClient);

        if (harnesses.length === 0) {
            return "⚠️ Pega Schema: No RuleForm harnesses found.";
        }

        let success = 0;
        let failed = 0;
        const failures: string[] = [];

        for (let i = 0; i < harnesses.length; i++) {
            const harness = harnesses[i];
            const ruleType = (harness.pyClassName as string) || "";
            if (!ruleType) { failed++; continue; }

            report.report({ message: `[${i + 1}/${harnesses.length}] ${ruleType}...` });

            try {
                const schema = await this.generateForHarness(pegaClient, harness, ruleType);
                await writer.writeSchema(ruleType, schema, root);
                await kbIngest.ingest(ruleType, schema, pegaClient.getPegaEndpoint(), this.httpClient.getBaseUrl());                this.log(`[SchemaGen] ✅ Schema written for ${ruleType}`);
                success++;
            } catch (err: any) {
                this.log(`[SchemaGen] ❌ ${ruleType}: ${err.message}`);
                failures.push(ruleType);
                failed++;
            }
        }

        if (failures.length > 0 && failures.length <= 5) {
            this.log(`[SchemaGen] Failed: ${failures.join(", ")}`);
        }
        return `📐 Pega Rule Schemas: Generated ${success} schemas for ${harnesses.length} rule types` +
            (failed > 0 ? ` (${failed} failed)` : "");
    }

    /** Crawl all Rule-HTML-Harness rules with pyStreamName=RuleForm (paginated). */
    private async crawlAllHarnesses(pegaClient: PegaHttpClientType): Promise<Record<string, unknown>[]> {
        const all: Record<string, unknown>[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const resp = await pegaClient.listRulesByFilter(
                "Rule-HTML-Harness", "pyStreamName", "RuleForm", 200, page,
            );
            all.push(...resp.pxResults);
            hasMore = resp.pxMore;
            page++;
        }
        this.log(`[SchemaGen] Crawled ${all.length} harness summaries in ${page - 1} pages.`);
        return all;
    }

    /** Fetch harness + sections, send to backend for schema generation. */
    private async generateForHarness(
        pegaClient: PegaHttpClientType, harness: Record<string, unknown>, ruleType: string,
    ): Promise<JsonSchema> {
        const pzInsKey = harness.pzInsKey as string;
        if (!pzInsKey) { throw new Error("No pzInsKey in harness summary"); }

        const harnessJson = await pegaClient.getRuleByInsKey(pzInsKey);
        const sectionJsons = await this.fetchSections(pegaClient, harnessJson, ruleType);

        const backendUrl = this.httpClient.getBaseUrl();
        // SA4E-362 FR-7 (T-3): root-cause fix — previously NO Authorization header was
        // sent at all (guaranteed 401 under CODE_INTEL_REQUIRE_AUTH). buildBackendAuthHeaders
        // attaches Bearer + X-Project-Id when a token exists (BR-5: empty token → omit).
        const baseHeaders: Record<string, string> = { "Content-Type": "application/json", ...buildBackendAuthHeaders() };
        const res = await withAuthRetry(async (token) => {
            const headers = { ...baseHeaders };
            if (token) { headers["Authorization"] = `Bearer ${token}`; } // fresh token on retry
            return fetch(`${backendUrl}/api/v1/pega/schema/generate`, {
                method: "POST",
                headers,
                body: JSON.stringify({ harnessJson, sectionJsons, ruleType }),
            });
        }, this.auth, this.log, "schema-generate");

        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`Backend ${res.status}: ${errBody.substring(0, 200)}`);
        }
        return ((await res.json()) as { schema: JsonSchema }).schema;
    }

    /** Fetch referenced sections from harness JSON. */
    private async fetchSections(
        pegaClient: PegaHttpClientType, harnessJson: Record<string, unknown>, ruleType: string,
    ): Promise<Record<string, Record<string, unknown>>> {
        const result: Record<string, Record<string, unknown>> = {};

        // Build map: sectionName → appliesTo class (from pxRuleReferences)
        const sectionClassMap = new Map<string, string>();
        const refs = harnessJson.pxRuleReferences;
        if (Array.isArray(refs)) {
            for (const ref of refs) {
                if (!ref || typeof ref !== "object") continue;
                const r = ref as Record<string, unknown>;
                if (r.pxRuleObjClass === "Rule-HTML-Section" && typeof r.pyRuleName === "string") {
                    const cls = (r.pxRuleClassName as string) || ruleType;
                    sectionClassMap.set(r.pyRuleName as string, cls);
                }
            }
        }

        for (const name of this.extractSectionNames(harnessJson)) {
            const appliesTo = sectionClassMap.get(name) || ruleType;
            try {
                const json = await pegaClient.queryRuleByTriple("Rule-HTML-Section", appliesTo, name);
                if (json) { result[name] = json; }
            } catch (err) { console.debug('[PegaSchemaIndexer] section not found — non-fatal :', (err as Error).message); }
        }
        return result;
    }

    /**
     * Parse section references from harness JSON.
     * Strategy: 1) pyTemplateName regex, 2) pySectionBody regex,
     * 3) pxRuleReferences where pxRuleObjClass=Rule-HTML-Section (fallback for stream-rendered harnesses).
     */
    private extractSectionNames(harnessJson: Record<string, unknown>): string[] {
        const names = new Set<string>();
        const raw = JSON.stringify(harnessJson);

        // Strategy 1: pyTemplateName in nested section bodies
        for (const m of raw.matchAll(/"pyTemplateName"\s*:\s*"([^"]+)"/g)) {
            if (m[1] && m[1] !== "undefined" && !m[1].startsWith("pz")) { names.add(m[1]); }
        }

        // Strategy 2: pySectionBody string references
        for (const m of raw.matchAll(/"pySectionBody"\s*:\s*"([^"]+)"/g)) {
            if (m[1] && m[1] !== "undefined") { names.add(m[1]); }
        }

        // Strategy 3: pxRuleReferences with Rule-HTML-Section (covers stream-rendered RuleForms)
        const refs = harnessJson.pxRuleReferences;
        if (Array.isArray(refs)) {
            for (const ref of refs) {
                if (!ref || typeof ref !== "object") continue;
                const r = ref as Record<string, unknown>;
                if (r.pxRuleObjClass === "Rule-HTML-Section" && typeof r.pyRuleName === "string") {
                    const sectionName = r.pyRuleName as string;
                    if (sectionName && !sectionName.startsWith("pz")) {
                        names.add(sectionName);
                    }
                }
            }
        }

        return Array.from(names);
    }
}
