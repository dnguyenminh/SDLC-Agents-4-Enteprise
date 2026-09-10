/**
 * SA4E-241 — Test-only fixture loaders. Parse the physical CSV vector files
 * (expected values generated INDEPENDENTLY of the code under test — TD-1).
 */
import * as fs from "fs";
import * as path from "path";

const DIR = __dirname;

/** Decode the `content_escaped` column: expand \n and the big-file marker. */
export function decodeContent(escaped: string): string {
  if (escaped === "__REPEAT_x_10240__") { return "x".repeat(10240); }
  return escaped.replace(/\\n/g, "\n");
}

/** Split a CSV line honoring simple values (fixtures avoid quoted commas). */
function splitLine(line: string): string[] {
  return line.split(",");
}

/** Parse a CSV file into an array of column-name → value records. */
export function readCsv(fileName: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(path.join(DIR, fileName), "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cols[i] ?? ""; });
    return row;
  });
}

export interface PegaVector {
  id: string; pzInsKey: string; pxUpdateDateTime: string; pxSaveDateTime: string;
  expected_sha256: string;
}

/** Load Pega checksum vectors (V1..V5). */
export function pegaVectors(): PegaVector[] {
  return readCsv("pega-checksum-vectors.csv").map((r) => ({
    id: r.id, pzInsKey: r.pzInsKey, pxUpdateDateTime: r.pxUpdateDateTime,
    pxSaveDateTime: r.pxSaveDateTime, expected_sha256: r.expected_sha256,
  }));
}

export interface FileVector { id: string; relativePath: string; content: string; expected: string; }

/** Load git-blob vectors (G1..G4) with decoded content. */
export function gitBlobVectors(): FileVector[] {
  return readCsv("git-blob-vectors.csv").map((r) => ({
    id: r.id, relativePath: r.relativePath, content: decodeContent(r.content_escaped),
    expected: r.expected_git_sha1,
  }));
}

/** Load fallback vectors (F1..F3) with decoded content. */
export function fallbackVectors(): FileVector[] {
  return readCsv("file-fallback-vectors.csv").map((r) => ({
    id: r.id, relativePath: r.relativePath, content: decodeContent(r.content_escaped),
    expected: r.expected_sha256,
  }));
}
