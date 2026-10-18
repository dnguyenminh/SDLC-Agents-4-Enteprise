/**
 * proxy-system-detect — system proxy detection fallback chain + factory
 * invalidation. Extracted from ProxyMessageHandler (BR-18); fallback order
 * (sync → PowerShell WPAD/PAC → corporate discovery) unchanged.
 */
import type { ProxyDetectionService } from "./ProxyDetectionService";
import { ProxyAgentFactory } from "./ProxyAgentFactory";
import { PowerShellHttpAdapter } from "./PowerShellHttpAdapter";

/**
 * Handle the `detectSystemProxy` message: sync detection first, then async
 * fallbacks. Posts `systemProxyDetected` with the resolved result.
 */
export async function handleDetectSystemProxy(
  detectionService: ProxyDetectionService,
  postMessage: (msg: unknown) => void
): Promise<void> {
  // Try sync detection first (env vars, VS Code settings, PowerShell .NET)
  const detected = detectionService.detect();
  if (detected.url) {
    postMessage({
      type: "systemProxyDetected",
      url: detected.url,
      bypass: detected.bypass,
    });
    return;
  }
  // Fallback 1: async PowerShell detection (handles WPAD/PAC better)
  try {
    const { PowerShellTransport } = await import("./PowerShellTransport");
    const proxyUrl = await PowerShellTransport.detectSystemProxy();
    if (proxyUrl) {
      postMessage({
        type: "systemProxyDetected",
        url: proxyUrl,
        bypass: detected.bypass,
      });
      return;
    }
  } catch {
    // PowerShell unavailable or failed — continue to next fallback
  }
  // Fallback 2: Corporate proxy discovery (DNS + TCP port probe)
  // Detects McAfee/Skyhigh Web Gateway and similar inline proxies
  try {
    const { discoverCorporateProxy } = await import("./CorporateProxyDiscovery");
    const discovered = await discoverCorporateProxy();
    if (discovered) {
      postMessage({
        type: "systemProxyDetected",
        url: discovered.url,
        bypass: detected.bypass,
      });
      return;
    }
  } catch {
    // Discovery failed — report no proxy
  }
  postMessage({
    type: "systemProxyDetected",
    url: null,
    bypass: null,
  });
}

/** Safely invalidate the proxy agent factory */
export function invalidateProxyFactory(): void {
  try {
    ProxyAgentFactory.getInstance().invalidate();
  } catch {
    // Factory not yet initialized — ignore
  }
  // Also invalidate PowerShell adapter's cached system proxy
  PowerShellHttpAdapter.invalidateCache();
}
