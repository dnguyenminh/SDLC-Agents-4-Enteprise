/**
 * Download and verification utilities for native bindings.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import pino from 'pino';
import { MANIFEST, BinaryEntry } from './manifest.js';

const logger = pino({ name: 'native-addon-resolver' });

async function downloadBinary(cacheKey: string, cachePath: string, bindingFile: string): Promise<void> {
  const entry = MANIFEST.binaries[cacheKey];
  if (!entry) throw new Error(`No binary available for ${cacheKey}`);

  fs.mkdirSync(cachePath, { recursive: true });
  logger.error(`[native-addon] Downloading: ${entry.url}`);
  logger.error(`[native-addon] Expected size: ${(entry.size / 1024 / 1024).toFixed(1)} MB`);

  await downloadWithRetry(entry, bindingFile);
}

async function downloadWithRetry(entry: BinaryEntry, bindingFile: string): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        logger.error(`[native-addon] Retry ${attempt}/${maxAttempts}...`);
        await sleep(2000 * (attempt - 1));
      }
      await downloadAndVerify(entry, bindingFile);
      return;
    } catch (err: any) {
      cleanupFile(bindingFile);
      if (attempt === maxAttempts) throw err;
    }
  }
}

async function downloadAndVerify(entry: BinaryEntry, bindingFile: string): Promise<void> {
  await downloadFile(entry.url, bindingFile);

  const hash = computeSha256Sync(bindingFile);
  if (hash !== entry.sha256) {
    cleanupFile(bindingFile);
    throw new Error(
      `Checksum mismatch: expected ${entry.sha256.substring(0, 16)}..., got ${hash.substring(0, 16)}...`
    );
  }
}

function downloadFile(url: string, target: string, maxRedirects = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) { reject(new Error('Too many redirects')); return; }
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.get(buildRequestOptions(parsedUrl), (res) => {
      handleDownloadResponse(res, target, maxRedirects, parsedUrl, resolve, reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out (60s)')); });
    req.on('error', (_err) => { cleanupFile(target); reject(_err); });
  });
}

function buildRequestOptions(parsedUrl: URL): https.RequestOptions {
  return {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    timeout: 60000,
    headers: {
      'User-Agent': 'mcp-code-intelligence/1.0',
    },
  };
}

function handleDownloadResponse(
  res: http.IncomingMessage,
  target: string,
  maxRedirects: number,
  parsedUrl: URL,
  resolve: (value: void | PromiseLike<void>) => void,
  reject: (reason?: any) => void,
): void {
  const status = res.statusCode ?? 0;
  if (status >= 300 && status < 400 && res.headers.location) {
    return handleRedirect(res, target, maxRedirects, resolve, reject);
  }
  if (status !== 200) {
    res.resume();
    reject(new Error(`HTTP ${status} from ${parsedUrl.hostname}`));
    return;
  }

  pipeToFile(res, target, resolve, reject);
}

function handleRedirect(
  res: http.IncomingMessage,
  target: string,
  maxRedirects: number,
  resolve: (value: void | PromiseLike<void>) => void,
  reject: (reason?: any) => void,
): void {
  res.resume();
  downloadFile(res.headers.location!, target, maxRedirects - 1)
    .then(resolve)
    .catch(reject);
}

function pipeToFile(
  res: http.IncomingMessage,
  target: string,
  resolve: (value: void | PromiseLike<void>) => void,
  reject: (reason?: any) => void,
): void {
  const file = fs.createWriteStream(target);
  res.pipe(file);

  file.on('finish', () => {
    file.close();
    resolve();
  });

  file.on('error', (err) => {
    file.close();
    cleanupFile(target);
    reject(err);
  });
}

function computeSha256Sync(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { downloadBinary, downloadFile, computeSha256Sync, cleanupFile, sleep };
