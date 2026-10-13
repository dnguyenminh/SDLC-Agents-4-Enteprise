/**
 * SA4E-358 — Gate overhead benchmark (TDD §9 / FSD §8.1, STC IT-14).
 * Run: npx tsx documents/SA4E-358/testdata/bench-gate.ts
 *
 * Measures:
 *  1. MICRO  — evaluateOriginGate() × 10^6 per input class (4 classes) after
 *              10^4 warmup; p50/p95/p99 via process.hrtime.bigint().
 *  2. E2E    — GET /health sequential × 10^4 against two real loopback HTTP
 *              servers: one whose handleRequest-shaped handler calls the REAL
 *              evaluateOriginGate (post-fix), one without the gate (baseline).
 *              Delta = median(post) - median(baseline).
 *
 * NOTE (environment limitation, documented for AC-3): the production
 * WrapperServer runs inside the Extension Host (imports `vscode`), so the e2e
 * leg replays the exact handleRequest shape (gate → 200 JSON) over a real Node
 * http server with the REAL gate module — the measured delta isolates the
 * gate's per-request cost on the /health hot path.
 *
 * F2 FIX (TA review D8/F2, iteration 1): the gated server now passes its REAL
 * listen port (bind 127.0.0.1:0 → srv.address().port) to evaluateOriginGate —
 * the previous listenPort=0 made every Host check fail (fail-closed AD-7) and
 * measured the 403 DENY branch. Every request is a webview-sim (Host:
 * 127.0.0.1:<listenPort> + Origin: vscode-webview://bench-sim — same shape the
 * live harness uses) and its status is asserted 200, so the e2e delta measures
 * the ALLOW branch — the production webview hot path.
 *
 * Output: documents/SA4E-358/testdata/bench-results.csv (overwritten each run).
 * Acceptance: micro p99 < 1ms for EVERY class (expected < 10µs) and
 *             e2e delta median < 1ms (expected < 0.1ms).
 */
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { evaluateOriginGate } from "../../../extension/src/services/OriginGate";

// ── result bookkeeping ──────────────────────────────────────────────────────
interface ClassResult { input_class: string; p50_ns: number; p95_ns: number; p99_ns: number; }
const rows: ClassResult[] = [];
let e2eDeltaMedian = 0;

function percentiles(samplesNs: bigint[]): { p50: number; p95: number; p99: number } {
  const s = samplesNs.map(Number).sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

function benchClass(name: string, rawHeaders: string[], listenPort: number, runs: number): void {
  for (let i = 0; i < 10_000; i++) evaluateOriginGate(rawHeaders, listenPort); // warmup
  const samples: bigint[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    evaluateOriginGate(rawHeaders, listenPort);
    samples.push(process.hrtime.bigint() - t0);
  }
  const { p50, p95, p99 } = percentiles(samples);
  rows.push({ input_class: name, p50_ns: p50, p95_ns: p95, p99_ns: p99 });
  const tag = p99 < 1_000_000 ? "PASS " : "!!! FAIL";
  console.log(`${tag} ${name.padEnd(16)} p50=${(p50 / 1000).toFixed(2)}µs p95=${(p95 / 1000).toFixed(2)}µs p99=${(p99 / 1000).toFixed(2)}µs`);
}

// ── 1. micro benchmark — 4 input classes (FSD §8.1) ─────────────────────────
const RUNS = 1_000_000;
console.log(`\n━━━ MICRO — evaluateOriginGate × ${RUNS.toLocaleString()} per class (warmup 10^4) ━━━`);
benchClass("no-Origin", ["Host", "127.0.0.1:9181"], 9181, RUNS);
benchClass("allowed-webview", ["Host", "127.0.0.1:9181", "Origin", "vscode-webview://abc123"], 9181, RUNS);
benchClass("denied-evil", ["Host", "127.0.0.1:9181", "Origin", "https://evil.com"], 9181, RUNS);
benchClass("malformed", ["Host", "127.0.0.1:9181", "Origin", "%%"], 9181, RUNS);

// ── 2. e2e delta — GET /health × 10^4, gate vs baseline (real servers) ──────
function startServer(withGate: boolean): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    let listenPort = 0; // F2 fix: real port resolved in the listen callback below
    const srv = http.createServer((req, res) => {
      if (withGate) {
        const gate = evaluateOriginGate(req.rawHeaders, listenPort);
        if (!gate.ok) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end('{"error":"Forbidden"}');
          return;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"status":"ok","mode":"wrapper"}');
    });
    srv.listen(0, "127.0.0.1", () => {
      listenPort = (srv.address() as import("net").AddressInfo).port; // resolved BEFORE resolve()
      resolve({
        port: listenPort,
        close: () => new Promise<void>((r) => srv.close(() => r())),
      });
    });
  });
}

// F2 fix: webview-sim request shape — identical on BOTH legs so the delta
// isolates gate cost. Host carries the REAL listen port (Phase 1.5 checks the
// exact port — BR-03) and the Origin is allowlisted (Phase 4 vscode-webview,
// host "*") → the gate takes the ALLOW branch, as in production webview traffic.
function simHeaders(port: number): { host: string; origin: string } {
  return { host: `127.0.0.1:${port}`, origin: "vscode-webview://bench-sim" };
}

async function fetchHealth(port: number, n: number, expectStatus: number): Promise<number[]> {
  const headers = simHeaders(port);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = process.hrtime.bigint();
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/health", headers }, (res) => {
        const s = res.statusCode ?? 0;
        res.resume();
        res.on("end", () => resolve(s));
      });
      req.on("error", reject);
    });
    samples.push(Number(process.hrtime.bigint() - t0) / 1000); // µs
    // F2 fix: hard-assert the expected branch — first non-200 aborts with the
    // request number so the evidence can never silently measure deny (403).
    if (status !== expectStatus) {
      throw new Error(`bench assertion failed: expected HTTP ${expectStatus}, got ${status} (request #${i + 1})`);
    }
  }
  return samples;
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

console.log(`\n━━━ E2E — GET /health × 10^4 sequential, gate vs baseline ━━━`);

async function main(): Promise<void> {
  const N = 10_000;
  const base = await startServer(false);
  const baseSamples = (await fetchHealth(base.port, N, 200)).map((v) => v / 1000); // ms
  await base.close();
  const gated = await startServer(true);
  console.log(`gated server: real listenPort=${gated.port} passed to evaluateOriginGate (F2 fix) — webview-sim requests, assert 200`);
  const gateSamples = (await fetchHealth(gated.port, N, 200)).map((v) => v / 1000); // ms
  await gated.close();
  const baseMedian = median(baseSamples);
  const gateMedian = median(gateSamples);
  e2eDeltaMedian = gateMedian - baseMedian;
  console.log(`baseline median=${baseMedian.toFixed(4)}ms  post-fix median=${gateMedian.toFixed(4)}ms  delta=${e2eDeltaMedian.toFixed(4)}ms`);
  console.log(e2eDeltaMedian < 1 ? "PASS  e2e delta median < 1ms" : "!!! FAIL e2e delta median >= 1ms");

  // ── 3. evidence CSV ──────────────────────────────────────────────────────
  const csvLines = ["input_class,p50_ns,p95_ns,p99_ns,e2e_delta_median_ms"];
  for (const r of rows) csvLines.push(`${r.input_class},${r.p50_ns},${r.p95_ns},${r.p99_ns},`);
  csvLines.push(`e2e-get-health,${(baseMedian * 1e6).toFixed(0)},${(gateMedian * 1e6).toFixed(0)},,${e2eDeltaMedian.toFixed(6)}`);
  csvLines.push(`# F2 fix (TA D8): e2e leg = ALLOW branch (webview-sim Host 127.0.0.1:<listenPort> + Origin vscode-webview://bench-sim); all ${N} gated + ${N} baseline requests asserted HTTP 200; real listenPort=${gated.port} passed to the gate`);
  const out = path.join(__dirname, "bench-results.csv");
  fs.writeFileSync(out, csvLines.join("\n") + "\n", "utf-8");
  console.log(`\nEvidence written: ${out}`);

  const microOk = rows.every((r) => r.p99_ns < 1_000_000);
  const e2eOk = e2eDeltaMedian < 1;
  console.log(`\nVERDICT: micro p99<1ms=${microOk ? "PASS" : "FAIL"}  e2e delta<1ms=${e2eOk ? "PASS" : "FAIL"}`);
  process.exit(microOk && e2eOk ? 0 : 1);
}

void main();
