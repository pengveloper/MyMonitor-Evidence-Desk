/**
 * Shared modal focus trap.
 *
 * Keeps Tab / Shift+Tab cycling inside an overlay while it is open and
 * restores focus to the element that opened it on close — the two halves of
 * the dialog contract that `aria-modal="true"` promises but does not provide.
 *
 * Modeled on the per-surface implementations in confirm-dialog.ts,
 * market-chart-interactions.ts, and CountryDeepDivePanel.ts; new overlays
 * should use this instead of hand-rolling another copy.
 */

import { getFocusableElements } from './dom-utils';

/**
 * Every trap listens on `document`, so several can hear the same keypress once
 * overlays stack. Only the most recently activated one may act on it.
 */
const activeTraps: FocusTrap[] = [];

export interface FocusTrapOptions {
  /**
   * Called on Escape. When omitted the trap leaves Escape alone so a
   * surface's existing close handler keeps working.
   */
  onEscape?: () => void;
  /** Element to focus on activate; defaults to the first focusable child. */
  initialFocus?: HTMLElement | null | (() => HTMLElement | null);
  /**
   * Element that receives focus after deactivation. When omitted, the element
   * focused at activation time is captured. Supplying this is useful for
   * overlays that are assembled in the DOM after their opener was recorded.
   */
  returnFocus?: HTMLElement | null | (() => HTMLElement | null);
  /** Pull a leaked Tab focus back into this trap while it is topmost. */
  containOutsideFocus?: boolean;
}

export interface FocusTrap {
  activate(): void;
  deactivate(options?: { restoreFocus?: boolean }): void;
}

export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrap {
  let active = false;
  let returnFocus: HTMLElement | null = null;
  let keydownTarget: EventTarget | null = null;

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' && event.key !== 'Tab') return;
    // Another trap opened on top of this one and owns the keyboard until it
    // deactivates. Without this, the oldest trap wins every keypress that
    // reaches document while focus sits on <body>.
    if (activeTraps[activeTraps.length - 1] !== trap) return;

    const current = document.activeElement;
    const focusedDialog = current instanceof HTMLElement
      ? current.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]')
      : null;
    // A legacy child dialog may own its own document-level keyboard handler
    // instead of registering another shared trap. If focus proves that such a
    // dialog is nested inside this container, leave Tab/Escape to that child;
    // closing the parent here would collapse two modal levels at once.
    if (focusedDialog && focusedDialog !== container && container.contains(focusedDialog)) return;
    // An overlay this module does not manage (confirm-dialog.ts or
    // CountryDeepDivePanel.ts) can still stack on
    // top with its own handlers — while focus is inside it, leave both keys to it.
    if (current && current !== document.body && !container.contains(current)) {
      // Leave Escape to a foreign modal with its own focus handling. Shared
      // traps use the LIFO stack above; top-level modal traps can additionally
      // recover a leaked Tab from their inert background.
      if (event.key === 'Escape' || !options.containOutsideFocus) return;
    }

    if (event.key === 'Escape') {
      if (!options.onEscape) return;
      event.preventDefault();
      event.stopPropagation();
      options.onEscape();
      return;
    }

    const focusable = getFocusableElements(container);
    // A hidden or detached container has nothing to hold. Let Tab through
    // rather than stranding the whole page with no reachable focus target.
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const shouldWrap = !focusable.includes(current as HTMLElement)
      || (event.shiftKey && current === first)
      || (!event.shiftKey && current === last);
    if (!shouldWrap) return;

    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  };

  const trap: FocusTrap = {
    activate(): void {
      if (active) return;
      active = true;
      activeTraps.push(trap);
      const requestedReturn = typeof options.returnFocus === 'function'
        ? options.returnFocus()
        : options.returnFocus;
      returnFocus = 'returnFocus' in options
        ? requestedReturn ?? null
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      // Own Tab/Escape before background document-capture handlers. This is
      // what makes a topmost dialog a real modal layer rather than one of
      // several listeners reacting to the same Escape keypress.
      keydownTarget = typeof window === 'undefined' ? document : window;
      keydownTarget.addEventListener('keydown', onKeydown as EventListener, true);
      const requested = typeof options.initialFocus === 'function' ? options.initialFocus() : options.initialFocus;
      (requested ?? getFocusableElements(container)[0] ?? container).focus();
    },
    deactivate({ restoreFocus = true } = {}): void {
      if (!active) return;
      active = false;
      const index = activeTraps.lastIndexOf(trap);
      if (index !== -1) activeTraps.splice(index, 1);
      keydownTarget?.removeEventListener('keydown', onKeydown as EventListener, true);
      keydownTarget = null;
      if (restoreFocus && returnFocus?.isConnected) {
        returnFocus.focus();
      }
      returnFocus = null;
    },
  };

  return trap;
}
