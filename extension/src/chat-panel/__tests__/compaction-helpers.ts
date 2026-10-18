/**
 * Shared fixture for ChatPanelProvider compaction tests
 * (split from chat-panel-provider.compaction.test.ts, SA4E-339).
 */
import { vi } from "vitest";
import { ChatPanelProvider } from "../chat-panel-provider";

export function createCompactionHarness() {
  const webviewMessages: any[] = [];
  const mockEngine = {
    getDetectedContextWindow: vi.fn().mockReturnValue(128000),
    getChatHistory: vi.fn().mockReturnValue([]),
    setChatHistory: vi.fn(),
    listAvailableTools: vi.fn().mockResolvedValue([])
  };

  const mockUri = { fsPath: "/mock/path" } as any;
  const mockMcpManager = { onStatusChange: vi.fn() } as any;

  const provider = new ChatPanelProvider(mockUri, mockMcpManager, "/mock/ws");

  // Inject mock engine
  provider.engine = mockEngine;

  // Spy on sendToWebview
  vi.spyOn(provider, "sendToWebview").mockImplementation((msg: any) => {
    webviewMessages.push(msg);
  });

  // Mock the contextUsageTracker to return specific usage
  const mockTracker = {
    setMaxTokens: vi.fn(),
    updateFromMessages: vi.fn(),
    updateSteeringTokens: vi.fn(),
    addToolTokens: vi.fn(),
    getUsagePayload: vi.fn().mockReturnValue({
      total: { tokens: 1000, percentage: 10 },
      maxTokens: 128000,
      conversation: { tokens: 1000, percentage: 10 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    })
  };
  provider.contextUsageTracker = mockTracker;

  return { provider, mockEngine, webviewMessages };
}
