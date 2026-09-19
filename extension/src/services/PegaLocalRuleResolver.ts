/**
 * PegaLocalRuleResolver — SA4E-301: serve a rule from the local workspace when
 * its checksum matches the catalog, so the BFS crawl skips the network download.
 *
 * Flow: manifest lookup (rules/.manifest.json pzInsKey → relativePath) → fallback
 * standard derivation (rules/safeClass/safeName.pega.json, same sanitization as
 * saveRuleFile) → read → zod validate → computePegaChecksum on the local rule's
 * 3 basic fields → compare with the catalog checksum (case-normalized). Any miss
 * (missing/unreadable/invalid/checksum mismatch) is a discriminated result — this
 * module NEVER throws for expected failures and NEVER serves local content on a
 * checksum mismatch (fail-safe).
 */
import * as fsp from "fs/promises";
import * as path from "path";
import { computePegaChecksum } from "../code-intel/checksum/PegaRuleChecksumStrategy";
import {
  MANIFEST_RELATIVE_PATH,
  LocalRuleJsonSchema,
  RuleManifestSchema,
} from "../models/PegaLocalRuleModels";
import type { LocalRuleResult } from "../models/PegaLocalRuleModels";
import { sanitizePegaClass, sanitizePegaName } from "./PegaCrawlHelper";

/**
 * Read rules/.manifest.json tolerantly: a missing file or corrupt content is an
 * optimization-only condition — return an empty manifest (the caller falls back
 * to standard path derivation) instead of throwing.
 */
export async function readRuleManifest(root: string): Promise<Record<string, string>> {
  try {
    const raw = await fsp.readFile(path.join(root, MANIFEST_RELATIVE_PATH), "utf-8");
    const parsed = RuleManifestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the local path for a rule: manifest-first (exact pzInsKey → relativePath),
 * then the standard saveRuleFile-style derivation. A stale manifest entry (target
 * file gone) falls through to derivation. Returns null when neither exists.
 */
export async function resolveLocalRulePath(
  root: string,
  pzInsKey: string,
  pxObjClass: string,
  ruleName: string,
): Promise<string | null> {
  const manifest = await readRuleManifest(root);
  const mapped = manifest[pzInsKey];
  if (mapped) {
    const abs = path.join(root, mapped);
    if (await fileExists(abs)) { return abs; }
  }
  const derived = path.join(
    root, "rules",
    sanitizePegaClass(pxObjClass || "Rule"),
    `${sanitizePegaName(ruleName || "Rule")}.pega.json`,
  );
  return (await fileExists(derived)) ? derived : null;
}

/**
 * Read + verify a local rule against the expected (catalog) checksum.
 * @returns {source:"local"} with the validated rule + its 3-field checksum, or
 *   {source:"miss"} with the reason. Never throws for expected failures.
 */
export async function readLocalRuleIfChecksumMatches(
  root: string,
  pzInsKey: string,
  expectedChecksum: string | undefined,
  pxObjClass: string,
  ruleName: string,
): Promise<LocalRuleResult> {
  const absPath = await resolveLocalRulePath(root, pzInsKey, pxObjClass, ruleName);
  if (!absPath) { return { source: "miss", reason: "file-missing" }; }

  let raw: string;
  try {
    raw = await fsp.readFile(absPath, "utf-8");
  } catch (err) {
    return { source: "miss", reason: "unreadable", detail: (err as Error).message };
  }

  let localRule;
  try {
    localRule = LocalRuleJsonSchema.parse(JSON.parse(raw));
  } catch (err) {
    return { source: "miss", reason: "invalid-json", detail: (err as Error).message.substring(0, 150) };
  }

  // INV-1: the SAME 3-field formula used for downloaded rules, computed on the
  // local rule's own identity fields. The catalog checksum may be uppercase →
  // normalize case before comparing (BR-04).
  const localChecksum = computePegaChecksum({
    pzInsKey: localRule.pzInsKey,
    pxUpdateDateTime: localRule.pxUpdateDateTime,
    pxSaveDateTime: localRule.pxSaveDateTime,
  });
  if (!expectedChecksum || !expectedChecksum.trim()
    || localChecksum !== expectedChecksum.trim().toLowerCase()) {
    return {
      source: "miss",
      reason: "checksum-mismatch",
      detail: `local=${localChecksum}, catalog=${expectedChecksum ?? ""}`,
    };
  }
  return { source: "local", rule: localRule as Record<string, unknown>, checksum: localChecksum };
}

/** Async existence probe (fs/promises) — never throws. */
async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
