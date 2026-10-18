/**
 * InputAreaIntegration — Wires context menu + spinner + options + slash menu into the existing input field
 * KSA-252: Context Menu
 * KSA-254: Slash Command Menu
 * KSA-255: Spinner + Working Indicator
 * KSA-259: Interactive Options
 *
 * BR-18: listener/selection/badge handlers live in ./input-area/* — this file
 * keeps the public class façade (same import path and symbols). Members marked
 * @internal are exposed only so the extracted submodules operate on the same
 * instance state; the public API is unchanged.
 */

import { ContextMenuController } from '../context-menu/ContextMenuController';
import { SlashMenuController } from '../slash-menu/SlashMenuController';
import { SpinnerController } from '../spinner/SpinnerController';
import { SpinnerView } from '../spinner/SpinnerView';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import { MessageBridge } from '../bridge/MessageBridge';
import type { VsCodeApi } from '../bridge/types';
import type { InputAreaParts } from './input-area/parts';
import { setupListeners, setupProcessingListener, setupOptionsListener, setupSteeringListener, setupSkillsListener } from './input-area/listeners';
import { onAgentSelected, onSteeringSelected, onCommandSelected } from './input-area/selection-handlers';
import { renderBadge } from './input-area/badge-handlers';

export interface InputAreaIntegrationOptions {
  inputElement: HTMLElement;
  containerElement: HTMLElement;
  badgeContainer: HTMLElement;
  vscodeApi: VsCodeApi;
}

export class InputAreaIntegration {
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly inputElement: HTMLElement;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly badgeContainer: HTMLElement;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly vscodeApi: VsCodeApi;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly controller: ContextMenuController;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly slashController: SlashMenuController;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly spinnerController: SpinnerController;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly optionsController: OptionsController;
  /** @internal BR-18 submodule wiring — do not use outside input-area/* helpers. */
  readonly hashDetectionEnabled = true;
  private spinnerView: SpinnerView;
  private optionsView: OptionsView;
  private bridge: MessageBridge;

  constructor(options: InputAreaIntegrationOptions) {
    this.inputElement = options.inputElement;
    this.badgeContainer = options.badgeContainer;
    this.vscodeApi = options.vscodeApi;

    this.bridge = new MessageBridge(options.vscodeApi);

    // Context Menu (KSA-252)
    this.controller = new ContextMenuController(
      {
        container: options.containerElement,
        inputElement: options.inputElement,
        onBadgeInsert: (badge) => renderBadge(this, badge),
        onClose: () => this.onMenuClose(),
      },
      this.bridge
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
      onAgentSelect: (agentName) => onAgentSelected(this, agentName),
      onSteeringSelect: (rule) => onSteeringSelected(this, rule),
      onCommandSelect: (commandId) => onCommandSelected(this, commandId),
      onClose: () => this.onMenuClose(),
    });

    // Options (KSA-259)
    this.optionsView = new OptionsView(options.containerElement, options.inputElement);
    this.optionsController = new OptionsController({
      view: this.optionsView,
      onSelect: (text, source) => this.handleOptionSelect(text, source),
      isSpinnerActive: () => this.spinnerController.isProcessing(),
    });

    setupListeners(this);
    setupProcessingListener(this);
    setupOptionsListener(this);
    setupSteeringListener(this);
    setupSkillsListener(this);
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
