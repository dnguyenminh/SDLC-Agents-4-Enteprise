/**
 * SpinnerView — DOM rendering for spinner + working text
 * KSA-255
 */

export class SpinnerView {
  private container: HTMLElement;
  private spinnerEl: HTMLElement | null = null;
  private textarea: HTMLElement;
  private originalPlaceholder: string;

  constructor(container: HTMLElement, textarea: HTMLElement) {
    this.container = container;
    this.textarea = textarea;
    this.originalPlaceholder = (textarea as HTMLTextAreaElement).placeholder || textarea.getAttribute('data-placeholder') || 'Type a message...';
  }

  show(): void {
    if (this.spinnerEl) return;

    this.spinnerEl = document.createElement('div');
    this.spinnerEl.className = 'spinner-container visible';

    const icon = document.createElement('div');
    icon.className = 'spinner-icon';

    const text = document.createElement('span');
    text.className = 'spinner-text';
    text.textContent = 'working';

    this.spinnerEl.appendChild(icon);
    this.spinnerEl.appendChild(text);
    this.container.appendChild(this.spinnerEl);

    // Disable textarea
    if ('disabled' in this.textarea) {
      (this.textarea as HTMLTextAreaElement).disabled = true;
      (this.textarea as HTMLTextAreaElement).placeholder = '';
    } else {
      this.textarea.setAttribute('contenteditable', 'false');
    }
  }

  hide(): void {
    if (this.spinnerEl && this.spinnerEl.parentElement) {
      this.spinnerEl.parentElement.removeChild(this.spinnerEl);
    }
    this.spinnerEl = null;

    // Re-enable textarea
    if ('disabled' in this.textarea) {
      (this.textarea as HTMLTextAreaElement).disabled = false;
      (this.textarea as HTMLTextAreaElement).placeholder = this.originalPlaceholder;
    } else {
      this.textarea.setAttribute('contenteditable', 'true');
    }
    this.textarea.focus();
  }

  isVisible(): boolean {
    return this.spinnerEl !== null;
  }

  getElement(): HTMLElement | null {
    return this.spinnerEl;
  }
}
