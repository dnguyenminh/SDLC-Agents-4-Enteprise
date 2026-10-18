/**
 * Structural view of the InputAreaIntegration instance shared with the
 * input-area submodules (BR-18 extraction). The class satisfies this
 * interface; submodules operate only on these members.
 */
import type { ContextMenuController } from '../../context-menu/ContextMenuController';
import type { SlashMenuController } from '../../slash-menu/SlashMenuController';
import type { SpinnerController } from '../../spinner/SpinnerController';
import type { OptionsController } from '../../options/OptionsController';
import type { VsCodeApi } from '../../bridge/types';

export interface InputAreaParts {
  readonly inputElement: HTMLElement;
  readonly badgeContainer: HTMLElement;
  readonly vscodeApi: VsCodeApi;
  readonly controller: ContextMenuController;
  readonly slashController: SlashMenuController;
  readonly spinnerController: SpinnerController;
  readonly optionsController: OptionsController;
  readonly hashDetectionEnabled: boolean;
}
