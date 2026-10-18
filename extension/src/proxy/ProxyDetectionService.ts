/**
 * ProxyDetectionService — Cross-platform system proxy auto-detection.
 * Priority: HTTPS_PROXY > HTTP_PROXY > VS Code http.proxy > OS-native detection.
 * OS-native: Windows (netsh), macOS (scutil), Linux (gsettings).
 * Platform implementations live in ./ProxyDetectionService/*.
 */

import * as vscode from "vscode";
import {
  detectWindowsProxy as detectWindowsProxyImpl,
  detectWindowsBypass as detectWindowsBypassImpl,
} from "./ProxyDetectionService/windows";
import {
  detectMacOsProxy as detectMacOsProxyImpl,
  detectMacOsBypass as detectMacOsBypassImpl,
} from "./ProxyDetectionService/macos";
import {
  detectLinuxProxy as detectLinuxProxyImpl,
  detectLinuxBypass as detectLinuxBypassImpl,
} from "./ProxyDetectionService/linux";

/** Result of system proxy detection */
export interface DetectedProxy {
  url: string | null;
  bypass: string | null;
}

/**
 * Detects system-level proxy configuration from environment,
 * VS Code built-in settings, and OS-native proxy config.
 * Stateless — no caching.
 */
export class ProxyDetectionService {
  /**
   * Detect system proxy URL and bypass list.
   * @returns Detected proxy URL and NO_PROXY bypass list
   */
  detect(): DetectedProxy {
    const url = this.detectProxyUrl();
    const bypass = this.detectBypassList();
    return { url, bypass };
  }

  /**
   * Detect OS-native proxy ONLY (no env vars, no VS Code settings).
   * Used as the system-resolution callback for @vscode/proxy-agent,
   * which already handles env vars and http.proxy settings itself.
   */
  detectOsNative(): DetectedProxy {
    const url = this.detectOsNativeProxy();
    const bypass = this.detectOsNativeBypass();
    return { url, bypass };
  }

  /**
   * Validate that a string is a well-formed proxy URL.
   * @param url - URL string to validate
   * @returns true if url has http: or https: protocol
   */
  isValidProxyUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private detectProxyUrl(): string | null {
    // Priority 1: Environment variables (highest — explicit user intent)
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (httpsProxy) { return httpsProxy; }

    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    if (httpProxy) { return httpProxy; }

    // Priority 2: VS Code built-in setting
    const vscodeProxy = vscode.workspace
      .getConfiguration("http")
      .get<string>("proxy", "");
    if (vscodeProxy) { return vscodeProxy; }

    // Priority 3: OS-native proxy detection
    return this.detectOsNativeProxy();
  }

  private detectBypassList(): string | null {
    const envBypass = process.env.NO_PROXY || process.env.no_proxy || null;
    if (envBypass) { return envBypass; }

    // OS-native bypass list
    return this.detectOsNativeBypass();
  }

  /**
   * Detect proxy URL from OS-native configuration.
   * Cross-platform: Windows (PowerShell .NET), macOS (scutil), Linux (gsettings).
   */
  private detectOsNativeProxy(): string | null {
    switch (process.platform) {
      case "win32": return this.detectWindowsProxy();
      case "darwin": return this.detectMacOsProxy();
      case "linux": return this.detectLinuxProxy();
      default: return null;
    }
  }

  /** Detect bypass list from OS-native configuration. */
  private detectOsNativeBypass(): string | null {
    switch (process.platform) {
      case "win32": return this.detectWindowsBypass();
      case "darwin": return this.detectMacOsBypass();
      case "linux": return this.detectLinuxBypass();
      default: return null;
    }
  }

  // --- Platform delegators (kept as methods — tests invoke them directly) ---

  /** Windows: PowerShell .NET WebRequest proxy resolution with netsh fallback. */
  private detectWindowsProxy(): string | null {
    return detectWindowsProxyImpl();
  }

  /** Windows: netsh winhttp bypass list. */
  private detectWindowsBypass(): string | null {
    return detectWindowsBypassImpl();
  }

  /** macOS: scutil --proxy resolution. */
  private detectMacOsProxy(): string | null {
    return detectMacOsProxyImpl();
  }

  /** macOS: scutil ExceptionsList bypass. */
  private detectMacOsBypass(): string | null {
    return detectMacOsBypassImpl();
  }

  /** Linux: gsettings (GNOME) resolution. */
  private detectLinuxProxy(): string | null {
    return detectLinuxProxyImpl();
  }

  /** Linux: gsettings ignore-hosts bypass. */
  private detectLinuxBypass(): string | null {
    return detectLinuxBypassImpl();
  }
}
