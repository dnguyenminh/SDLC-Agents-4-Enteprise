/**
 * PegaCatalogDownloader — Resumable, base64-aware download of the rule catalog ZIP.
 * The resumableDownload endpoint returns BASE64-encoded content (not raw binary)
 * and reports the real ZIP size via the `x-file-size` response header (NOT
 * content-range). This helper downloads in contiguous chunks, concatenates the
 * base64 text, decodes it, and verifies the decoded size against x-file-size.
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

type LogFn = (msg: string) => void;

/** Bytes requested per Range chunk. 1 MiB keeps round-trips low without huge buffers. */
const CHUNK_BYTES = 1_048_576;

/** Max chunk iterations — CWE-400 guard against a runaway loop. */
const MAX_CHUNKS = 5_000;

/** Result of a completed catalog download. */
export interface CatalogDownloadResult {
  /** Absolute path to the extracted rulecatalog.csv. */
  csvPath: string;
  /** Decoded ZIP size in bytes (matches x-file-size). */
  zipBytes: number;
}

/**
 * Download a resumable file (base64) and extract the single CSV it contains.
 * @param downloadUrl - Full resumableDownload URL including the file name
 * @param authHeader - Basic auth header value
 * @param destDir - Directory to write the .zip and extracted .csv
 * @param log - Logger
 * @returns Path to the extracted CSV
 * @throws Error if the decoded size mismatches x-file-size or ZIP is invalid
 */
export async function downloadCatalogCsv(
  downloadUrl: string,
  authHeader: string,
  destDir: string,
  log: LogFn,
): Promise<CatalogDownloadResult> {
  fs.mkdirSync(destDir, { recursive: true });
  const { zipBuf, totalBytes } = await fetchAllChunks(downloadUrl, authHeader, log);

  // Verify integrity: decoded size MUST equal the server-declared x-file-size.
  if (totalBytes > 0 && zipBuf.length !== totalBytes) {
    throw new Error(
      `Catalog download size mismatch: decoded ${zipBuf.length} bytes but x-file-size=${totalBytes}`,
    );
  }
  // ZIP magic check: PK\x03\x04
  if (!(zipBuf[0] === 0x50 && zipBuf[1] === 0x4b && zipBuf[2] === 0x03 && zipBuf[3] === 0x04)) {
    throw new Error("Catalog download is not a valid ZIP (bad magic bytes after base64 decode)");
  }

  const zipPath = path.join(destDir, "rulecatalog.zip");
  fs.writeFileSync(zipPath, zipBuf);
  const csvPath = extractSingleCsv(zipBuf, destDir, log);
  return { csvPath, zipBytes: zipBuf.length };
}

/**
 * Fetch all Range chunks sequentially and concatenate the DECODED bytes.
 *
 * The server measures the `Range` header against the DECODED file (the ZIP),
 * takes that byte window, then base64-encodes it in the response body. So a
 * request for `bytes=0-1048575` yields the base64 of the first 1 MiB of ZIP
 * (≈1.4M base64 chars), NOT the first 1 MiB of base64 text.
 *
 * Therefore the read offset MUST advance by the number of DECODED bytes
 * received (bounded by CHUNK_BYTES), never by the base64 string length.
 * Each chunk is decoded independently and the Buffers are concatenated, so we
 * never rely on base64 padding lining up across chunk boundaries.
 *
 * Reads `x-file-size` on the first response to bound the loop precisely.
 * @returns The fully-decoded ZIP buffer and the server-declared size.
 */
async function fetchAllChunks(
  url: string, authHeader: string, log: LogFn,
): Promise<{ zipBuf: Buffer; totalBytes: number }> {
  let offset = 0;              // byte offset into the DECODED file
  let totalBytes = 0;         // real ZIP size (x-file-size)
  const parts: Buffer[] = [];
  let iter = 0;

  while (iter < MAX_CHUNKS) {
    iter++;
    const end = offset + CHUNK_BYTES - 1;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/octet-stream", Range: `bytes=${offset}-${end}` },
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Resumable download failed: HTTP ${res.status}`);
    }
    if (totalBytes === 0) {
      const xfs = res.headers.get("x-file-size");
      if (xfs && !isNaN(Number(xfs))) { totalBytes = Number(xfs); }
    }
    const chunkB64 = await res.text();
    if (chunkB64.length === 0) { break; }

    // Decode this window's base64 to raw bytes and advance by the DECODED length.
    const chunkBuf = Buffer.from(chunkB64, "base64");
    if (chunkBuf.length === 0) { break; }
    parts.push(chunkBuf);
    offset += chunkBuf.length;
    log(`[Catalog] ⬇️ chunk ${iter}: +${chunkBuf.length} decoded bytes (offset=${offset}/${totalBytes || "?"})`);

    // Primary stop condition: x-file-size is the authoritative total, so stop as
    // soon as we've decoded that many bytes. This does NOT depend on the server
    // honoring CHUNK_BYTES exactly (this server returns ≈, not exactly, the ask),
    // which is why we never compare against CHUNK_BYTES when the size is known.
    if (totalBytes > 0) {
      if (offset >= totalBytes) { break; }
      continue;
    }
    // Fallback (no x-file-size header): a window smaller than the requested
    // CHUNK_BYTES means the server returned the final remaining bytes → done.
    // Saves one extra empty-body round-trip when the total is unknown.
    if (chunkBuf.length < CHUNK_BYTES) { break; }
  }
  return { zipBuf: Buffer.concat(parts), totalBytes };
}

/**
 * Extract the single CSV entry from an in-memory ZIP buffer without external deps.
 * Assumes one stored/deflated CSV entry (rulecatalog.csv).
 * @returns Absolute path to the written CSV
 */
function extractSingleCsv(zipBuf: Buffer, destDir: string, log: LogFn): string {
  const entry = readFirstZipEntry(zipBuf);
  if (!entry) { throw new Error("No entry found in rulecatalog ZIP"); }
  const csv = entry.method === 8 ? zlib.inflateRawSync(entry.data) : entry.data;
  // SD-01: sanitize entry name to prevent Zip-Slip / path traversal (../../evil.csv).
  // Only the basename is honored so the file can never escape destDir.
  const safeName = path.basename(entry.name || "rulecatalog.csv") || "rulecatalog.csv";
  const csvPath = path.join(destDir, safeName);
  fs.writeFileSync(csvPath, csv);
  log(`[Catalog] 📄 Extracted ${safeName} (${csv.length} bytes)`);
  return csvPath;
}

/** Parsed local-file-header entry from a ZIP buffer. */
interface ZipEntry { name: string; method: number; data: Buffer; }

/**
 * Minimal ZIP reader: locate the first local file header (PK\x03\x04) and return
 * its raw (possibly deflated) data. Uses the data descriptor / next-header offset
 * to bound compressed size when the header size fields are zero (streamed ZIPs).
 */
function readFirstZipEntry(buf: Buffer): ZipEntry | null {
  if (buf.readUInt32LE(0) !== 0x04034b50) { return null; }
  const method = buf.readUInt16LE(8);
  let compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const name = buf.toString("utf-8", 30, 30 + nameLen);
  // Streamed ZIPs may store 0 in compSize; fall back to next central-dir/header marker.
  if (compSize === 0) {
    const nextHeader = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), dataStart); // central dir
    compSize = (nextHeader > 0 ? nextHeader : buf.length) - dataStart;
  }
  return { name, method, data: buf.subarray(dataStart, dataStart + compSize) };
}
