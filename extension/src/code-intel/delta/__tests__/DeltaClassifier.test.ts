/**
 * SA4E-241 — DeltaClassifier + StateComparer tests (NT-3: compare by CHECKSUM).
 * IC-05: skip = existing, fetch = candidates − existing.
 * IC-06: comparison uses ONLY checksum (ref never inspected).
 * BR-11: detectRemoved.
 * E-04/BR-15: StateComparer fail-safe (bulk-check error → full run, no false-negative).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DeltaClassifier } from "../DeltaClassifier";
import { StateComparer } from "../StateComparer";
import { BulkCheckClient, type HttpPoster } from "../BulkCheckClient";
import type { IndexCandidate } from "../models/DeltaModels";

const cand = (checksum: string, ref: unknown = {}): IndexCandidate => ({ checksum, ref });
/** Build a valid 64-char lowercase-hex checksum from a short seed (schema-valid). */
const hex = (seed: string): string => seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "0");

describe("DeltaClassifier (IC-05/IC-06)", () => {
  const clf = new DeltaClassifier();

  it("skip = existing; fetch = candidates − existing", () => {
    const candidates = [cand("aa"), cand("bb"), cand("cc")];
    const existing = new Set(["aa", "cc"]);
    const { skip, fetch } = clf.classify(candidates, existing);
    expect(skip.map((c) => c.checksum).sort()).toEqual(["aa", "cc"]);
    expect(fetch.map((c) => c.checksum)).toEqual(["bb"]);
  });

  it("IC-06: identical checksum with different ref is still skipped (ref ignored)", () => {
    const candidates = [cand("aa", { insKey: "X" })];
    const { skip, fetch } = clf.classify(candidates, new Set(["aa"]));
    expect(skip).toHaveLength(1);
    expect(fetch).toHaveLength(0);
  });

  it("BR-11: detectRemoved returns previous checksums absent from current", () => {
    const removed = clf.detectRemoved([cand("aa")], new Set(["aa", "old1", "old2"]));
    expect(removed.sort()).toEqual(["old1", "old2"]);
  });

  it("PBT-06: totality — skip ∪ fetch = candidates, skip ∩ fetch = ∅", () => {
    const hexStr = fc.string({ minLength: 4, maxLength: 8, unit: fc.constantFrom(..."0123456789abcdef".split("")) });
    fc.assert(fc.property(
      fc.array(hexStr),
      fc.array(hexStr),
      (csums, existingArr) => {
        const candidates = csums.map((c) => cand(c));
        const { skip, fetch } = clf.classify(candidates, new Set(existingArr));
        expect(skip.length + fetch.length).toBe(candidates.length);
        const skipSet = new Set(skip);
        expect(fetch.some((f) => skipSet.has(f))).toBe(false);
      },
    ));
  });
});

describe("StateComparer — fail-safe (E-04/BR-15)", () => {
  const poster = (impl: HttpPoster["postJson"]): HttpPoster => ({ postJson: impl });

  const AA = hex("aa"); // valid 64-hex checksums (schema-valid)
  const BB = hex("bb");

  it("bulk-check success → classify against existing", async () => {
    const client = new BulkCheckClient(poster(async () => ({ data: { existing: [AA] }, error: null })));
    const cmp = new StateComparer(client);
    const out = await cmp.compare("proj1", [cand(AA), cand(BB)]);
    expect(out.warning).toBeNull();
    expect(out.result.skip.map((c) => c.checksum)).toEqual([AA]);
    expect(out.result.fetch.map((c) => c.checksum)).toEqual([BB]);
  });

  it("bulk-check failure → existing = ∅ → full run + warning (no false-negative)", async () => {
    const client = new BulkCheckClient(poster(async () => { throw new Error("boom"); }));
    const cmp = new StateComparer(client);
    const out = await cmp.compare("proj1", [cand(AA), cand(BB)]);
    expect(out.warning).toContain("Bulk-check failed");
    expect(out.result.skip).toHaveLength(0);
    expect(out.result.fetch).toHaveLength(2);
  });
});

describe("BulkCheckClient (SEC-04 client-side response validation)", () => {
  it("validates response with zod; throws on bad shape", async () => {
    const bad: HttpPoster = { postJson: async () => ({ data: { existing: ["NOT_HEX"] }, error: null }) };
    const client = new BulkCheckClient(bad);
    await expect(client.fetchExisting("p", ["aa"])).rejects.toThrow(/BAD_RESPONSE|invalid/i);
  });

  it("batches >1000 checksums into multiple requests (union result)", async () => {
    let calls = 0;
    const http: HttpPoster = {
      postJson: async (_p, body: any) => {
        calls++;
        return { data: { existing: body.checksums.slice(0, 1) }, error: null };
      },
    };
    const client = new BulkCheckClient(http);
    const csums = Array.from({ length: 2500 }, (_, i) => i.toString(16).padStart(64, "0"));
    const existing = await client.fetchExisting("p", csums);
    expect(calls).toBe(3); // 1000 + 1000 + 500
    expect(existing.size).toBe(3);
  });
});
