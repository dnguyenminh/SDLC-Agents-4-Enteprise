/**
 * Download helpers for native addon management.
 * Extracted from native-addon-manager.ts for file size compliance.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";

/**
 * Download a file with redirect support, progress reporting, and cancellation.
 */
export function downloadFile(
  url: string,
  target: string,
  expectedSize: number,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
  proxyUrl: string | undefined,
  outputChannel: vscode.OutputChannel,
  maxRedirects = 10
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }
    if (token.isCancellationRequested) {
      reject(new Error("Cancelled"));
      return;
    }
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      timeout: 60000,
      headers: { "User-Agent": "kiro-sdlc-agents/1.0" },
    } as https.RequestOptions;

    if (proxyUrl) {
      outputChannel.appendLine(`[NativeAddon] Using proxy: ${proxyUrl}`);
    }

    const req = client.get(options, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, target, expectedSize, progress, token, proxyUrl, outputChannel, maxRedirects - 1)
          .then(resolve).catch(reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status} from ${parsedUrl.hostname}`));
        return;
      }
      handleSuccessResponse(res, target, expectedSize, progress, token, req, reject, resolve);
    });

    req.on("timeout", () => { req.destroy(); reject(new Error("Download timed out (60s)")); });
    req.on("error", (err) => {
      if (fs.existsSync(target)) { try { fs.unlinkSync(target); } catch { } }
      reject(err);
    });
  });
}

function handleSuccessResponse(
  res: http.IncomingMessage,
  target: string,
  expectedSize: number,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
  req: http.ClientRequest,
  reject: (reason?: any) => void,
  resolve: () => void
): void {
  const totalBytes = parseInt(res.headers["content-length"] || String(expectedSize), 10);
  let downloadedBytes = 0;
  let lastReportedPercent = 0;
  const file = fs.createWriteStream(target);

  res.on("data", (chunk) => {
    downloadedBytes += chunk.length;
    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
    if (percent > lastReportedPercent) {
      const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
      const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
      progress.report({ message: `${mb} MB / ${totalMb} MB (${percent}%)`, increment: percent - lastReportedPercent });
      lastReportedPercent = percent;
    }
  });

  res.pipe(file);
  file.on("finish", () => { file.close(); resolve(); });
  file.on("error", (err) => {
    file.close();
    if (fs.existsSync(target)) { fs.unlinkSync(target); }
    reject(err);
  });
  token.onCancellationRequested(() => {
    req.destroy(); file.close();
    if (fs.existsSync(target)) { fs.unlinkSync(target); }
    reject(new Error("Cancelled"));
  });
}

/**
 * Compute SHA-256 hash of a file.
 */
export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Get proxy URL from VS Code config or environment.
 */
export function getProxyUrl(): string | undefined {
  try {
    const config = vscode.workspace.getConfiguration("http");
    return config.get<string>("proxy") || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  } catch {
    return process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  }
}
