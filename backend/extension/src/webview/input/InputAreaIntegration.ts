/**
 * InputAreaIntegration — Wires context menu + spinner + options + slash menu into the existing input field
 * KSA-252: Context Menu
 * KSA-254: Slash Command Menu
 * KSA-255: Spinner + Working Indicator
 * KSA-259: Interactive Options
 */

import { ContextMenuController } from '../context-menu/ContextMenuController';
import { SlashMenuController } from '../slash-menu/SlashMenuController';
import { SpinnerController } from '../spinner/SpinnerController';
import { SpinnerView } from '../spinner/SpinnerView';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import { BadgeRenderer } from '../badges/BadgeRenderer';
import { MessageBridge } from '../bridge/MessageBridge';
import type { ContextTagBadge, ChatOptionsSignal } from '../protocol';
import type { SlashSteeringRule } from '../slash-menu/types';
import type { VsCodeApi } from '../bridge/types';

export interface InputAreaIntegrationOptions {
  inputElement: HTMLElement;
  containerElement: HTMLElement;
  badgeContainer: HTMLElement;
  vscodeApi: VsCodeApi;
}

export class InputAreaIntegration {
  private controller: ContextMenuController;
  private slashController: SlashMenuController;
  private spinnerController: SpinnerController;
  private spinnerView: SpinnerView;
  private optionsController: OptionsController;
  private optionsView: OptionsView;
  private badgeContainer: HTMLElement;
  private inputElement: HTMLElement;
  private hashDetectionEnabled = true;
  private vscodeApi: VsCodeApi;

  constructor(options: InputAreaIntegrationOptions) {
    this.inputElement = options.inputElement;
    this.badgeContainer = options.badgeContainer;
    this.vscodeApi = options.vscodeApi;

    const bridge = new MessageBridge(options.vscodeApi);

    // Context Menu (KSA-252)
    this.controller = new ContextMenuController(
      {
        container: options.containerElement,
        inputElement: options.inputElement,
        onBadgeInsert: (badge) => this.renderBadge(badge),
        onClose: () => this.onMenuClose(),
      },
      bridge
    );

    // Spinner (KSA-255)
    this.spinnerView = new SpinnerView(options.containerElement, options.inputElement);
    this.spinnerController = new SpinnerController(this.spinnerView, () => {
      this.showTimeoutNotification();
    });

    // Slash Menu (KSA-254)
    this.slashController = new SlashMenuController({
      container: options.containerElement,
      inputElement: options.inputElement,
      onAgentSelect: (agentName) => this.onAgentSelected(agentName),
      onSteeringSelect: (rule) => this.onSteeringSelected(rule),
      onClose: () => this.onMenuClose(),
    });

    // Options (KSA-259)
    this.optionsView = new OptionsView(options.containerElement, options.inputElement);
    this.optionsController = new OptionsController({
      view: this.optionsView,
      onSelect: (text, source) => this.handleOptionSelect(text, source),
      isSpinnerActive: () => this.spinnerController.isProcessing(),
    });

    this.setupListeners();
    this.setupProcessingListener();
    this.setupOptionsListener();
    this.setupSteeringListener();
  }

  private setupListeners(): void {
    // Detect "#" or "/" typed in input
    this.inputElement.addEventListener('input', (e) => {
      const event = e as InputEvent;
      const text = this.inputElement.textContent || '';

      // KSA-254: Detect '/' trigger (BR-01, BR-02, BR-04)
      if (event.data === '/' && !this.slashController.isOpen() && !this.controller.isOpen()) {
        const slashPos = text.lastIndexOf('/');
        if (slashPos >= 0 && this.slashController.isValidTrigger(text, slashPos)) {
          this.slashController.open(slashPos);
          return;
        }
      } else if (this.slashController.isOpen()) {
        this.updateSlashFilter();
        return;
      }

      // KSA-252: Detect '#' trigger
      if (!this.hashDetectionEnabled) return;
      if (event.data === '#' && !this.controller.isOpen()) {
        this.controller.open();
      } else if (this.controller.isOpen()) {
        this.updateFilter();
      }
    });

    // Key events for menu navigation + options navigation
    this.inputElement.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;

      // Options keyboard handling first (KSA-259)
      if (this.optionsController.isVisible()) {
        const handled = this.optionsController.handleKeyDown(ke);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // KSA-254: Slash menu keyboard handling
      if (this.slashController.isOpen()) {
        const handled = this.slashController.handleKeyDown(ke);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Context menu keyboard handling (KSA-252)
      if (this.controller.isOpen()) {
        const handled = this.controller.handleKeyDown(ke);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });

    // Outside click detection
    document.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      // KSA-254: Close slash menu on outside click
      if (this.slashController.isOpen()) {
        if (!target.closest('.slash-menu')) {
          this.slashController.close();
        }
      }
      // KSA-252: Close context menu on outside click
      if (this.controller.isOpen()) {
        if (!target.closest('.context-menu') && !target.closest('.picker-panel')) {
          this.controller.close();
        }
      }
    });

    // Badge backspace removal
    this.inputElement.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Backspace' && !this.controller.isOpen() && !this.slashController.isOpen()) {
        this.handleBadgeBackspace();
      }
    });
  }

  /**
   * KSA-255: Listen for processing signals from Extension Host.
   * Handles BOTH protocols:
   * - chat:processing (original KSA-255 spec: { state: 'start'|'stop', reason })
   * - chat:workingStatus (actual backend emission: { working: true|false })
   */
  private setupProcessingListener(): void {
    window.addEventListener('message', (event) => {
      const message = event.data;

      // Handle chat:processing (original protocol from KSA-255 spec)
      if (message && message.type === 'chat:processing') {
        if (message.state === 'start') {
          this.spinnerController.startProcessing();
          // KSA-259: Auto-dismiss options when processing starts
          if (this.optionsController.isVisible()) {
            this.optionsController.dismiss('auto-dismiss');
          }
        } else if (message.state === 'stop') {
          this.spinnerController.stopProcessing(message.reason ?? 'complete');
          // KSA-259: Show pending options after spinner stops
          this.optionsController.processPendingOptions();
        }
      }

      // Handle chat:workingStatus (actual protocol from backend message-handler)
      if (message && message.type === 'chat:workingStatus') {
        if (message.working) {
          this.spinnerController.startProcessing();
          // KSA-259: Auto-dismiss options when processing starts
          if (this.optionsController.isVisible()) {
            this.optionsController.dismiss('auto-dismiss');
          }
        } else {
          this.spinnerController.stopProcessing('complete');
          // KSA-259: Show pending options after spinner stops
          this.optionsController.processPendingOptions();
        }
      }
    });
  }

  /**
   * KSA-259: Listen for chat:options signals from Extension Host
   */
  private setupOptionsListener(): void {
    window.addEventListener('message', (event) => {
      const message = event.data as ChatOptionsSignal;
      if (message && message.type === 'chat:options') {
        this.optionsController.showOptions(message);
      }
    });
  }

  /**
   * KSA-254: Listen for chat:steeringLoaded signal from Extension Host
   */
  private setupSteeringListener(): void {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'chat:steeringLoaded' && Array.isArray(message.rules)) {
        this.slashController.setSteeringRules(message.rules);
      }
    });
  }

  /**
   * KSA-254: Agent selected — insert /agent-name prefix into textarea (BR-24, BR-25)
   */
  private onAgentSelected(agentName: string): void {
    const text = this.inputElement.textContent || '';
    const triggerIndex = this.slashController.getTriggerIndex();
    const before = text.substring(0, triggerIndex);
    const cursorPos = (window.getSelection()?.anchorOffset) ?? text.length;
    const after = text.substring(cursorPos);
    const prefix = `/${agentName} `;
    this.inputElement.textContent = before + prefix + after;
    // Move cursor after prefix
    this.setCursorPosition(before.length + prefix.length);
  }

  /**
   * KSA-254: Steering rule selected — add context chip (BR-28, BR-29)
   */
  private onSteeringSelected(rule: SlashSteeringRule): void {
    const text = this.inputElement.textContent || '';
    const triggerIndex = this.slashController.getTriggerIndex();
    const before = text.substring(0, triggerIndex);
    const cursorPos = (window.getSelection()?.anchorOffset) ?? text.length;
    const after = text.substring(cursorPos);
    this.inputElement.textContent = before + after;
    this.setCursorPosition(before.length);
    // Add as context chip via badge system
    const badge: ContextTagBadge = {
      id: `slash-steering-${Date.now()}`,
      type: 'steering',
      label: rule.name,
      icon: rule.icon,
      metadata: { steeringFile: `.kiro/steering/${rule.file}` },
    };
    this.renderBadge(badge);
  }

  /**
   * KSA-254: Update slash menu filter based on text after trigger position
   */
  private updateSlashFilter(): void {
    const text = this.inputElement.textContent || '';
    const triggerIndex = this.slashController.getTriggerIndex();
    if (triggerIndex < 0) return;
    // Extract filter text: everything between '/' trigger and cursor
    const filterText = text.substring(triggerIndex + 1);
    // BR-17: If user backspaced past the '/' position, close
    if (!text.includes('/') || text.length <= triggerIndex) {
      this.slashController.close();
      return;
    }
    this.slashController.filter(filterText);
  }

  private setCursorPosition(pos: number): void {
    const range = document.createRange();
    const sel = window.getSelection();
    const textNode = this.inputElement.firstChild;
    if (textNode) {
      const safePos = Math.min(pos, textNode.textContent?.length ?? 0);
      range.setStart(textNode, safePos);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  /**
   * KSA-259: Handle option selection — send response to Extension Host
   */
  private handleOptionSelect(text: string, source: 'option-click' | 'text-input'): void {
    this.vscodeApi.postMessage({
      type: 'chat:response',
      text,
      source,
    });
  }

  /**
   * KSA-259: Called when user submits text from textarea
   * Dismisses options if visible
   */
  handleTextSubmit(): void {
    if (this.optionsController.isVisible()) {
      this.optionsController.submitCustom();
    }
  }

  /**
   * KSA-255: Handle Stop button click — optimistic reset (BR-04)
   */
  handleStopClick(): void {
    this.spinnerController.stopProcessing('cancelled');
    this.vscodeApi.postMessage({ type: 'chat:cancel' });
  }

  /**
   * KSA-255: Timeout notification
   */
  private showTimeoutNotification(): void {
    this.vscodeApi.postMessage({ type: 'chat:timeout-notification' });
  }

  private updateFilter(): void {
    const text = this.inputElement.textContent || '';
    const lastHash = text.lastIndexOf('#');
    if (lastHash >= 0) {
      const filterText = text.substring(lastHash + 1);
      this.controller.filter(filterText);
    }
  }

  private renderBadge(badge: ContextTagBadge): void {
    const renderer = this.controller.getBadgeRenderer();
    const el = renderer.createBadgeElement(badge);
    this.badgeContainer.appendChild(el);
    this.removeHashText();
  }

  private removeHashText(): void {
    const text = this.inputElement.textContent || '';
    const lastHash = text.lastIndexOf('#');
    if (lastHash >= 0) {
      this.inputElement.textContent = text.substring(0, lastHash);
    }
  }

  private handleBadgeBackspace(): void {
    const badges = this.controller.getBadgeManager().getAll();
    if (badges.length > 0) {
      const selection = window.getSelection();
      if (selection && selection.anchorOffset === 0) {
        const lastBadge = badges[badges.length - 1];
        this.controller.getBadgeManager().remove(lastBadge.id);
        BadgeRenderer.removeBadgeElement(this.badgeContainer, lastBadge.id);
      }
    }
  }

  private onMenuClose(): void {
    this.inputElement.focus();
  }

  getController(): ContextMenuController {
    return this.controller;
  }

  getSpinnerController(): SpinnerController {
    return this.spinnerController;
  }

  getOptionsController(): OptionsController {
    return this.optionsController;
  }

  getSlashController(): SlashMenuController {
    return this.slashController;
  }

  async getResolvedContexts() {
    return this.controller.getBadgeManager().resolveAll();
  }

  dispose(): void {
    this.controller.dispose();
    this.slashController.dispose();
    this.spinnerController.dispose();
    this.optionsController.dispose();
  }
}
