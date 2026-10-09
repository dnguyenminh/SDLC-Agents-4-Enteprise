/**
 * Unit tests for PegaHierarchyResolver fail-loud behavior (SA4E-349).
 * Locks in: auth errors (401/403) re-throw from resolveOperator instead of
 * being swallowed, and a missing appName throws instead of falling back to
 * the fake "PegaApp" name. Non-auth errors stay soft (pre-existing behavior).
 */

import { describe, it, expect } from "vitest";
import { resolvePegaHierarchy } from "../services/PegaHierarchyResolver";
import type { PegaHttpClient } from "../services/PegaHttpClient";

/** Stub client exposing only the method resolveOperator uses. */
function stubClient(getRuleByInsKey: (insKey: string) => Promise<Record<string, unknown>>): PegaHttpClient {
  return { getRuleByInsKey } as unknown as PegaHttpClient;
}

const noopLog = (): void => {};

describe("PegaHierarchyResolver fail-loud (SA4E-349)", () => {
  describe("resolveOperator auth errors", () => {
    // STC/SA4E-349 FIX #2a: HTTP 401 must re-throw as a Pega authentication failure.
    it("re-throws 401 as a Pega authentication failure", async () => {
      const client = stubClient(async () => {
        throw new Error("HTTP 401 Unauthorized");
      });
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.toThrow(/Pega authentication failed while resolving operator "user@org"/);
    });

    // STC/SA4E-349 FIX #2a: HTTP 403 is also an auth failure.
    it("re-throws 403 as a Pega authentication failure", async () => {
      const client = stubClient(async () => {
        throw new Error("HTTP 403 Forbidden");
      });
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.toThrow(/Pega authentication failed/);
    });

    // Non-auth errors stay soft (pre-existing behavior): accessGroup remains
    // empty, so resolution then fails with the explicit appName error.
    it("treats non-auth errors as soft (no auth exception surfaced)", async () => {
      const client = stubClient(async () => {
        throw new Error("network down");
      });
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.toThrow(/Cannot resolve Pega Application/);
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.not.toThrow(/authentication failed/);
    });
  });

  describe("resolvePegaHierarchy appName fallback", () => {
    // STC/SA4E-349 FIX #2b: no "PegaApp" fallback — fail loud with guidance.
    it("throws when appName cannot be resolved (no PegaApp fallback)", async () => {
      const client = stubClient(async () => ({ pyAccessGroup: "", pyDefaultAccessGroup: "" }));
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.toThrow(/Cannot resolve Pega Application for operator "user@org"/);
      await expect(
        resolvePegaHierarchy(client, "user@org", "C:\\work\\pega", noopLog),
      ).rejects.toThrow(/Verify credentials\/permissions/);
    });
  });
});
