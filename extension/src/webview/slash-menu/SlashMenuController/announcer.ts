/**
 * Screen-reader announcer for the slash menu (KSA-254 accessibility).
 */

/** Reuse (or lazily create) the shared aria-live announcer element. */
export function ensureAnnouncer(): HTMLElement {
  let announcer = document.getElementById('sr-announcer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'sr-announcer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    document.body.appendChild(announcer);
  }
  return announcer;
}

/** Announce a message via the shared announcer (cleared first for re-reads). */
export function announceVia(announcer: HTMLElement | null, message: string): void {
  if (announcer) {
    announcer.textContent = '';
    requestAnimationFrame(() => {
      if (announcer) announcer.textContent = message;
    });
  }
}
