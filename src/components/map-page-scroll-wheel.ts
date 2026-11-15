const MAP_WHEEL_CONTROL_SELECTOR = [
  '.layer-toggles',
  '.map-controls',
  '.map-context-menu',
  '.map-legend',
  '.map-popup',
  '.time-slider',
  '[data-map-wheel-capture]',
].join(', ');

/**
 * Let ordinary wheel gestures continue scrolling the control-room page.
 * Ctrl/Meta+wheel remains available to each map renderer for intentional zoom,
 * while independently scrollable map chrome keeps its native wheel behavior.
 */
export function shouldPassMapWheelToPage(event: WheelEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  if (event.target instanceof Element && event.target.closest('.live-news-fullscreen')) return false;
  return !(event.target instanceof Element && event.target.closest(MAP_WHEEL_CONTROL_SELECTOR));
}

export function installMapPageScrollWheelPassthrough(container: HTMLElement): () => void {
  const passToPage = (event: WheelEvent): void => {
    if (!shouldPassMapWheelToPage(event)) return;
    // Renderer listeners are below this capture boundary. Stopping them without
    // preventDefault preserves the browser's native scroll on the nearest page
    // scroller instead of turning a dashboard map into a scroll trap.
    event.stopImmediatePropagation();
  };
  container.addEventListener('wheel', passToPage, { capture: true, passive: true });
  return () => container.removeEventListener('wheel', passToPage, { capture: true });
}
