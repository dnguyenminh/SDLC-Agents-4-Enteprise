/**
 * Fetch concurrency auto-tuning via latency probe (SA4E-92, SA4E-241 SEC-03).
 */

import { computeOptimalConcurrency, measureLatency } from "../concurrency-tuner";
import type { PegaHttpClient } from "../PegaHttpClient";
import type { LogFn } from "./types";
import { getFetchConcurrency, setFetchConcurrency } from "./parallel-fetch";

/** Cache latency probe result per operator to avoid duplicate probes across pipelines */
const probeLatencyCache = new Map<string, number>();

/**
 * Calibrate fetch concurrency by measuring latency to the Pega server.
 * Call once before starting the crawl loop.
 */
export async function calibrateFetchConcurrency(
    pegaClient: PegaHttpClient,
    totalItems: number,
    log: LogFn,
): Promise<number> {
    try {
        const probeOperatorId = pegaClient.getConfiguredUsername();
        if (!probeOperatorId) {
            log(`[Pega Indexer] ⚠️ No pegaUsername configured — skipping latency probe, using default FETCH_CONCURRENCY=${getFetchConcurrency()}`);
            return getFetchConcurrency();
        }
        let latency = probeLatencyCache.get(probeOperatorId);
        if (!latency) {
            // SA4E-241 SEC-03: probe uses the configured operator id (no hardcoded
            // default). If none is configured, skip the operator-record probe and use
            // the default concurrency (fail-safe, not fail-open).
            latency = await measureLatency(
                () => pegaClient.getObject("DATA-ADMIN-OPERATOR-ID", probeOperatorId, "@baseclass").catch(() => null),
                2,
            );
            probeLatencyCache.set(probeOperatorId, latency);
            log(`[Pega Indexer] 🎯 Auto-tuned: latency=${Math.round(latency)}ms → FETCH_CONCURRENCY recomputed`);
        } else {
            log(`[Pega Indexer] 🎯 Latency probe cached for ${probeOperatorId}`);
        }
        const next = computeOptimalConcurrency({
            measuredLatencyMs: latency,
            totalItems,
            isRemote: true,
            targetDurationMs: 15_000,
            maxServerConnections: 15,
        });
        setFetchConcurrency(next);
        log(`[Pega Indexer] 🎯 Auto-tuned: latency=${Math.round(latency)}ms → FETCH_CONCURRENCY=${next}`);
    } catch {
        log(`[Pega Indexer] ⚠️ Latency probe failed — using default FETCH_CONCURRENCY=${getFetchConcurrency()}`);
    }
    return getFetchConcurrency();
}
