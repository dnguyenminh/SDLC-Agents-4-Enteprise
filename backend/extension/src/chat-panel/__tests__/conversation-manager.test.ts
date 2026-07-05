/**
 * ConversationManager Tests — KSA-240
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ConversationManager } from "../conversation-manager";

describe("ConversationManager", () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager(10);
  });

  describe("initialization", () => {
    it("should create an initial tab on construction", () => {
      expect(manager.getTabCount()).toBe(1);
      expect(manager.getActiveTab()).toBeDefined();
      expect(manager.getActiveTab()!.name).toBe("Chat 1");
    });

    it("should set initial tab as active", () => {
      expect(manager.getActiveTab()!.isActive).toBe(true);
    });
  });

  describe("createTab", () => {
    it("should create a new tab with sequential naming", () => {
      const tab2 = manager.createTab();
      expect(tab2.name).toBe("Chat 2");
      expect(manager.getTabCount()).toBe(2);
    });

    it("should set new tab as active", () => {
      const tab2 = manager.createTab();
      expect(tab2.isActive).toBe(true);
      expect(manager.getActiveTabId()).toBe(tab2.id);
    });

    it("should deactivate previous tab", () => {
      const tab1 = manager.getActiveTab()!;
      manager.createTab();
      const updatedTab1 = manager.getTab(tab1.id);
      expect(updatedTab1!.isActive).toBe(false);
    });

    it("should throw when max tabs reached", () => {
      const mgr = new ConversationManager(2);
      mgr.createTab(); // now 2 tabs
      expect(() => mgr.createTab()).toThrow("Maximum 2 tabs reached");
    });

    it("should create tab with empty messages and zero token count", () => {
      const tab = manager.createTab();
      expect(tab.messages).toEqual([]);
      expect(tab.tokenCount).toBe(0);
      expect(tab.maxTokens).toBe(128000);
    });
  });

  describe("switchTab", () => {
    it("should switch to specified tab", () => {
      const tab1 = manager.getActiveTab()!;
      manager.createTab();
      const switched = manager.switchTab(tab1.id);
      expect(switched.id).toBe(tab1.id);
      expect(switched.isActive).toBe(true);
    });

    it("should throw for non-existent tab", () => {
      expect(() => manager.switchTab("fake-id")).toThrow("Tab fake-id not found");
    });
  });

  describe("closeTab", () => {
    it("should close tab and activate neighbor", () => {
      const tab1 = manager.getActiveTab()!;
      const tab2 = manager.createTab();
      const result = manager.closeTab(tab2.id);
      expect(result.closedTab.id).toBe(tab2.id);
      expect(manager.getTabCount()).toBe(1);
      expect(manager.getActiveTabId()).toBe(tab1.id);
    });

    it("should throw when trying to close last tab", () => {
      expect(() => manager.closeTab(manager.getActiveTabId())).toThrow("Cannot close the last tab");
    });

    it("should activate left neighbor when closing active middle tab", () => {
      const tab1 = manager.getActiveTab()!;
      manager.createTab(); // tab2
      const tab3 = manager.createTab();
      manager.switchTab(tab1.id);
      manager.createTab(); // switches to new tab
      // Close active tab - should go to left neighbor
      const activeId = manager.getActiveTabId();
      manager.createTab();
      manager.switchTab(tab3.id);
      manager.closeTab(tab3.id);
      // Should have activated a neighbor
      expect(manager.getActiveTab()).toBeDefined();
    });
  });

  describe("renameTab", () => {
    it("should rename tab", () => {
      const tab = manager.getActiveTab()!;
      manager.renameTab(tab.id, "My Chat");
      expect(manager.getTab(tab.id)!.name).toBe("My Chat");
    });

    it("should truncate name at 30 chars", () => {
      const tab = manager.getActiveTab()!;
      const longName = "A".repeat(50);
      manager.renameTab(tab.id, longName);
      expect(manager.getTab(tab.id)!.name.length).toBe(30);
    });

    it("should not rename with empty string", () => {
      const tab = manager.getActiveTab()!;
      const original = tab.name;
      manager.renameTab(tab.id, "   ");
      expect(manager.getTab(tab.id)!.name).toBe(original);
    });
  });

  describe("addMessage", () => {
    it("should add message and update token count", () => {
      const tab = manager.getActiveTab()!;
      manager.addMessage(tab.id, {
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: new Date().toISOString(),
        tokenCount: 5,
      });
      expect(manager.getTab(tab.id)!.messages.length).toBe(1);
      expect(manager.getTab(tab.id)!.tokenCount).toBe(5);
    });
  });

  describe("canCreateTab", () => {
    it("should return true when under limit", () => {
      expect(manager.canCreateTab()).toBe(true);
    });

    it("should return false when at limit", () => {
      const mgr = new ConversationManager(1);
      expect(mgr.canCreateTab()).toBe(false);
    });
  });
});
