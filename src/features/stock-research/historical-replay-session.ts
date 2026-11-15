/**
 * Page-level isolation for the Historical Replay modal.
 *
 * Replay is rendered as a body-level portal. While it is active, every other
 * body root is made inert and hidden from the accessibility tree. Capture
 * guards are kept as a second boundary: they also stop synthetic/programmatic
 * events that do not honour the native inert attribute.
 */

export interface PageInteractionIsolation {
  deactivate(): void;
}

/** @deprecated Use the mode-neutral name for new callers. */
export type HistoricalReplayIsolation = PageInteractionIsolation;

interface BackgroundState {
  element: HTMLElement;
  inertAttribute: string | null;
  ariaHidden: string | null;
}

interface ActiveIsolation {
  overlay: HTMLElement;
  deactivateInternal(): void;
}

let activeIsolation: ActiveIsolation | null = null;

const FOCUSABLE_SELECTOR = [
  '[autofocus]',
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function eventIsInsideOverlay(event: Event, overlay: HTMLElement): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.includes(overlay)) return true;
  return event.target instanceof Node && overlay.contains(event.target);
}

function focusReplay(overlay: HTMLElement): void {
  if (!overlay.isConnected) return;
  const target = overlay.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (target) {
    target.focus({ preventScroll: true });
    return;
  }

  // A replay normally has a Close button. Keep the fallback local and
  // reversible for the loading/error edge case where it does not.
  const previousTabIndex = overlay.getAttribute('tabindex');
  overlay.tabIndex = -1;
  overlay.focus({ preventScroll: true });
  if (previousTabIndex === null) overlay.removeAttribute('tabindex');
  else overlay.setAttribute('tabindex', previousTabIndex);
}

function blockEvent(event: Event): void {
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}

function isGlobalAppShortcut(event: KeyboardEvent): boolean {
  if (event.key === 'Tab' || event.key === 'Escape') return false;

  const key = event.key.toLowerCase();
  const target = event.target;
  const formControlFocused = target instanceof HTMLElement
    && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === 't') {
    return !formControlFocused;
  }

  if (!(event.ctrlKey || event.metaKey)) {
    if (event.altKey || formControlFocused) return false;
    // Route Explorer's document-capture shortcuts are still live while its
    // inert root sits behind Replay. Keep every one from mutating that hidden
    // workspace; native key behavior in Replay form controls remains intact.
    return ['1', '2', '3', '4', 'f', 't', 'p', 's', ' ', '?'].includes(key);
  }
  // App-level search, undo, aviation command bar, and Route Explorer settings.
  // Ctrl/Cmd+Z remains native inside Replay form controls; the background undo
  // handler already ignores those controls.
  if (key === 'z') return !formControlFocused;
  return key === 'k' || key === 'j' || key === ',';
}

export function isPageInteractionIsolated(): boolean {
  return activeIsolation !== null;
}

/** @deprecated Use isPageInteractionIsolated for new guards. */
export function isHistoricalReplayActive(): boolean {
  return isPageInteractionIsolated();
}

export function activatePageInteractionIsolation(overlay: HTMLElement): PageInteractionIsolation {
  activeIsolation?.deactivateInternal();

  const backgroundStates = new Map<HTMLElement, BackgroundState>();
  const isolateBackgroundRoot = (child: HTMLElement): void => {
    if (backgroundStates.has(child)) return;
    // Never hide/inert the dialog itself or a portal root that contains it.
    if (child === overlay || child.contains(overlay)) return;
    backgroundStates.set(child, {
      element: child,
      inertAttribute: child.getAttribute('inert'),
      ariaHidden: child.getAttribute('aria-hidden'),
    });
    child.inert = true;
    child.setAttribute('aria-hidden', 'true');
  };
  for (const child of document.body.children) {
    if (child instanceof HTMLElement) isolateBackgroundRoot(child);
  }

  const backgroundObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.parentElement === document.body) {
          isolateBackgroundRoot(node);
        }
      }
    }
  });
  backgroundObserver.observe(document.body, { childList: true });

  const onOutsideInteraction = (event: Event): void => {
    if (!eventIsInsideOverlay(event, overlay)) blockEvent(event);
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (eventIsInsideOverlay(event, overlay)) return;
    blockEvent(event);
    focusReplay(overlay);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isGlobalAppShortcut(event)) blockEvent(event);
  };

  window.addEventListener('pointerdown', onOutsideInteraction, true);
  window.addEventListener('mousedown', onOutsideInteraction, true);
  window.addEventListener('touchstart', onOutsideInteraction, true);
  window.addEventListener('click', onOutsideInteraction, true);
  window.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('keydown', onKeyDown, true);

  let deactivated = false;
  const state: ActiveIsolation = {
    overlay,
    deactivateInternal: () => {
      if (deactivated) return;
      deactivated = true;
      backgroundObserver.disconnect();
      window.removeEventListener('pointerdown', onOutsideInteraction, true);
      window.removeEventListener('mousedown', onOutsideInteraction, true);
      window.removeEventListener('touchstart', onOutsideInteraction, true);
      window.removeEventListener('click', onOutsideInteraction, true);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('keydown', onKeyDown, true);

      for (const background of backgroundStates.values()) {
        if (background.inertAttribute === null) background.element.removeAttribute('inert');
        else background.element.setAttribute('inert', background.inertAttribute);
        if (background.ariaHidden === null) background.element.removeAttribute('aria-hidden');
        else background.element.setAttribute('aria-hidden', background.ariaHidden);
      }
      if (activeIsolation === state) activeIsolation = null;
    },
  };
  activeIsolation = state;

  if (!(document.activeElement instanceof Node) || !overlay.contains(document.activeElement)) {
    focusReplay(overlay);
  }

  return {
    deactivate: () => state.deactivateInternal(),
  };
}

/** @deprecated Use activatePageInteractionIsolation for new modal surfaces. */
export const activateHistoricalReplayIsolation = activatePageInteractionIsolation;
