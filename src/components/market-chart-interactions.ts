import type { MarketData } from '@/types';
import { createFocusTrap } from '@/utils/focus-trap';
import { escapeHtml } from '@/utils/sanitize';

type MarketProvider = () => readonly MarketData[];
type MarketChartOpener = (stock: MarketData, opener: HTMLElement) => void;

export function hasPlottableMarketSeries(stock: MarketData): boolean {
  return Array.isArray(stock.sparkline) && stock.sparkline.filter((value) => Number.isFinite(value)).length >= 2;
}

export function getMarketChartRowAttributes(stock: MarketData, index: number, ariaLabel: string): string {
  if (!hasPlottableMarketSeries(stock)) return ' class="market-item"';

  return ` class="market-item market-item-clickable" data-market-chart="${index}" role="button" tabindex="0" aria-label="${escapeHtml(ariaLabel)}"`;
}

export function bindMarketChartActivation(
  content: HTMLElement,
  getMarkets: MarketProvider,
  openChart: MarketChartOpener,
): void {
  const openFromTarget = (target: HTMLElement): void => {
    const row = target.closest<HTMLElement>('[data-market-chart]');
    if (!row) return;

    const index = Number(row.dataset.marketChart);
    const stock = Number.isInteger(index) && index >= 0 ? getMarkets()[index] : undefined;
    if (stock) openChart(stock, row);
  };

  content.addEventListener('click', (event) => openFromTarget(event.target as HTMLElement));
  content.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target as HTMLElement).closest('[data-market-chart]')) return;

    event.preventDefault();
    openFromTarget(event.target as HTMLElement);
  });
}

export interface MarketChartFocusController {
  readonly returnFocus: HTMLElement | null;
  activate(initialFocus?: HTMLElement | null): void;
  deactivate(options?: { restoreFocus?: boolean }): void;
}

export function createMarketChartFocusController(
  container: HTMLElement,
  onEscape: () => void,
  returnFocus: HTMLElement | null,
): MarketChartFocusController {
  let requestedInitialFocus: HTMLElement | null = null;
  const focusTrap = createFocusTrap(container, {
    onEscape,
    initialFocus: () => requestedInitialFocus,
    returnFocus,
    containOutsideFocus: true,
  });

  return {
    returnFocus,
    activate(initialFocus = null): void {
      requestedInitialFocus = initialFocus;
      focusTrap.activate();
      // Preserve the controller's public re-focus behavior when an already
      // active modal changes mode (for example, entering Historical Replay).
      requestedInitialFocus?.focus();
    },
    deactivate({ restoreFocus = true } = {}): void {
      focusTrap.deactivate({ restoreFocus });
      requestedInitialFocus = null;
    },
  };
}
