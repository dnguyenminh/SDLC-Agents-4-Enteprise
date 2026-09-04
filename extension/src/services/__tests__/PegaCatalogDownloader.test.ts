/**
 * Unit + Integration tests — PegaCatalogDownloader (SA4E-240).
 * Verifies base64 decode, x-file-size integrity check, ZIP magic validation,
 * single-CSV extraction, and Zip-Slip path-traversal protection (SD-01).
 * Covers STC: TC-UT-04, TC-UT-05, TC-UT-05b, TC-UT-06, TC-UT-09, TC-INT-05.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import { downloadCatalogCsv } from "../PegaCatalogDownloader";

const noop = (_: string) => {};
const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "catdl-"));
  tmpDirs.push(d);
  return d;
}

/**
 * Build a minimal valid ZIP (single stored entry) in-memory.
 * Uses deflateRaw (method=8) so the downloader's inflateRawSync path is exercised.
 */
function buildZip(entryName: string, content: string): Buffer {
  const raw = Buffer.from(content, "utf-8");
  const comp = zlib.deflateRawSync(raw);
  const nameBuf = Buffer.from(entryName, "utf-8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4);          // version needed
  local.writeUInt16LE(0, 6);           // flags
  local.writeUInt16LE(8, 8);           // method = deflate
  local.writeUInt32LE(0, 10);          // time/date
  local.writeUInt32LE(0, 14);          // crc (unchecked by reader)
  local.writeUInt32LE(comp.length, 18); // compressed size
  local.writeUInt32LE(raw.length, 22);  // uncompressed size
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);           // extra length
  // Central directory marker so readFirstZipEntry can bound the data if needed.
  const central = Buffer.alloc(4);
  central.writeUInt32LE(0x02014b50, 0);
  return Buffer.concat([local, nameBuf, comp, central]);
}

/** Mock global fetch to serve a base64 body + x-file-size header once. */
function mockFetchOnce(zipBuf: Buffer, opts?: { fileSize?: number; status?: number }): void {
  const b64 = zipBuf.toString("base64");
  const fileSize = opts?.fileSize ?? zipBuf.length;
  const status = opts?.status ?? 206;
  vi.stubGlobal("fetch", vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === "x-file-size" ? String(fileSize) : null) },
    text: async () => b64,
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of tmpDirs.splice(0)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
});

describe("PegaCatalogDownloader", () => {
  // TC-UT-04 / TC-UT-05 / TC-INT-05 — happy path: 206 + x-file-size + decode + unzip
  it("TC-UT-05/INT-05: downloads, verifies size, and extracts CSV", async () => {
    const csvContent = "pzInsKey,pxObjClass\nRULE-X A!B,Rule-Obj-Activity\n";
    const zip = buildZip("rulecatalog.csv", csvContent);
    mockFetchOnce(zip);
    const dir = tmpDir();
    const res = await downloadCatalogCsv("http://mock/dl", "Basic x", dir, noop);
    expect(res.zipBytes).toBe(zip.length);
    expect(fs.existsSync(res.csvPath)).toBe(true);
    expect(fs.readFileSync(res.csvPath, "utf-8")).toBe(csvContent);
  });

  // TC-UT-05b — size mismatch → throw (BR-07)
  it("TC-UT-05b: throws on x-file-size mismatch", async () => {
    const zip = buildZip("rulecatalog.csv", "a,b\n");
    mockFetchOnce(zip, { fileSize: zip.length + 999 });
    await expect(downloadCatalogCsv("http://mock/dl", "Basic x", tmpDir(), noop))
      .rejects.toThrow(/size mismatch/i);
  });

  // TC-UT-06 — bad ZIP magic → throw
  it("TC-UT-06: throws when decoded bytes are not a ZIP", async () => {
    const notZip = Buffer.from("this is definitely not a zip file at all", "utf-8");
    mockFetchOnce(notZip);
    await expect(downloadCatalogCsv("http://mock/dl", "Basic x", tmpDir(), noop))
      .rejects.toThrow(/not a valid ZIP/i);
  });

  // TC-UT-09 — Zip-Slip / path traversal protection (SD-01)
  it("TC-UT-09: sanitizes malicious entry name (no escape from destDir)", async () => {
    const zip = buildZip("../../evil.csv", "x,y\n");
    mockFetchOnce(zip);
    const dir = tmpDir();
    const res = await downloadCatalogCsv("http://mock/dl", "Basic x", dir, noop);
    // File must stay inside destDir; basename only.
    expect(path.dirname(path.resolve(res.csvPath))).toBe(path.resolve(dir));
    expect(path.basename(res.csvPath)).toBe("evil.csv");
    expect(fs.existsSync(path.join(dir, "evil.csv"))).toBe(true);
  });

  // Non-2xx/206 status → throw
  it("throws on non-206/200 HTTP status", async () => {
    const zip = buildZip("rulecatalog.csv", "a,b\n");
    mockFetchOnce(zip, { status: 500 });
    await expect(downloadCatalogCsv("http://mock/dl", "Basic x", tmpDir(), noop))
      .rejects.toThrow(/HTTP 500/);
  });
});
