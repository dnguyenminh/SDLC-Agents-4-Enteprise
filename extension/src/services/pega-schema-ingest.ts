/**
 * pega-schema-ingest — KB ingestion of generated Pega rule schemas via the
 * backend MCP endpoint. Extracted from PegaSchemaIndexer (BR-18); payload
 * shape, headers and timeout unchanged.
 */
import type { JsonSchema } from "../models";
import { getEffectiveScope } from "../utils/scope-detector";

/**
 * Ingests schemas into KB so agents can use them for rule validation.
 * The "first ingest debug" log fires once per ingester instance.
 */
export class SchemaKbIngester {
    private _ingestLogged = false;

    constructor(private readonly log: (msg: string) => void) {}

    async ingest(ruleType: string, schema: JsonSchema, pegaEndpoint: string, backendUrl: string): Promise<void> {
        try {
            const content = JSON.stringify(schema);
            const serverHost = new URL(pegaEndpoint).hostname;
            const ingestArgs = {
                content: `PEGA_SCHEMA | ruleType=${ruleType} | server=${pegaEndpoint} | fields=${Object.keys(schema.properties || {}).length} | ${content}`,
                summary: `Pega Rule Schema: ${ruleType} (${Object.keys(schema.properties || {}).length} fields)`,
                type: "PEGA_SCHEMA",
                source: `pega-schema/${ruleType}`,
                tags: `pega,schema,${ruleType},${serverHost}`,
                scope: getEffectiveScope(),
            };
            // Use MCP endpoint via Node http (same pattern as syncCodeSymbols)
            const url = `${backendUrl}/mcp`;
            const mcpPayload = {
                jsonrpc: "2.0",
                id: Date.now(),
                method: "tools/call",
                params: { name: "mem_ingest", arguments: ingestArgs },
            };
            const http = await import("http");
            const { getProjectId } = await import("../extension");
            const pid = getProjectId();
            const body = JSON.stringify(mcpPayload);
            const parsedUrl = new URL(url);
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Content-Length": Buffer.byteLength(body).toString(),
            };
            if (pid) { headers["X-Project-Id"] = pid; }
            const result = await new Promise<{ ok: boolean; body: string; status: number }>((resolve) => {
                const req = http.default.request(
                    { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname, method: "POST", headers },
                    (res) => { let data = ""; res.on("data", (c: any) => { data += c; }); res.on("end", () => resolve({ ok: res.statusCode === 200, body: data, status: res.statusCode || 0 })); },
                );
                req.on("error", (e) => resolve({ ok: false, body: e.message, status: 0 }));
                req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, body: "timeout", status: 0 }); });
                req.write(body);
                req.end();
            });
            // Log first ingest response for debugging
            if (!this._ingestLogged) {
                this._ingestLogged = true;
                this.log(`[SchemaGen] 🔍 Ingest debug — URL: ${url}, PID: ${pid}, Status: ${result.status}, Body: ${result.body.substring(0, 300)}`);
            }
            if (!result.ok) {
                this.log(`[SchemaGen] ⚠️ KB ingest failed for ${ruleType}: HTTP ${result.status} — ${result.body.substring(0, 200)}`);
            }
        } catch (err: any) {
            this.log(`[SchemaGen] ⚠️ KB ingest failed for ${ruleType}: ${err.message}`);
        }
    }
}
