/**
 * Structured-output parser for PowerShellTransport (---PWSH_*--- delimiters).
 * Extracted from PowerShellTransport.ts (BR-18 file-size limit).
 */
import { PwshResponse } from "./types";

/** Parse structured PowerShell output into response object */
export function parsePwshOutput(stdout: string): PwshResponse {
  const lines = stdout.split(/\r?\n/);
  let status = 0;
  let statusText = "";
  const headers: Record<string, string> = {};
  const bodyLines: string[] = [];
  let section: "none" | "status" | "statusText" | "headers" | "body" = "none";

  for (const line of lines) {
    if (line === "---PWSH_STATUS---") { section = "status"; continue; }
    if (line === "---PWSH_STATUS_TEXT---") { section = "statusText"; continue; }
    if (line === "---PWSH_HEADERS---") { section = "headers"; continue; }
    if (line === "---PWSH_BODY---") { section = "body"; continue; }

    switch (section) {
      case "status":
        status = parseInt(line.trim(), 10) || 0;
        break;
      case "statusText":
        statusText = line.trim();
        break;
      case "headers": {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const value = line.slice(colonIdx + 1).trim();
          headers[key] = value;
        }
        break;
      }
      case "body":
        bodyLines.push(line);
        break;
    }
  }

  // Remove trailing empty line from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
    bodyLines.pop();
  }

  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    headers,
    body: bodyLines.join("\n"),
  };
}
