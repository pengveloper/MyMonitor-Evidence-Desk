import { mountOwnerIntelligence } from './owner-intelligence-view';
/**
 * Full-page stock research overlay. Composes the existing Yahoo/sparkline
 * chart, AnalyzeStock, and backtest entry. Does not add a market vendor.
 */

import type { MarketData } from '@/types';
import { formatChange, formatPrice, getChangeClass } from '@/utils';
import type { ListCompanySignalsResponse } from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { terminalChart } from '@/utils/terminal-chart';
import { hasPremiumAccess } from '@/services/panel-gating';
import { fetchStockQuote } from '@/services/market';
import { getRpcBaseUrl } from '@/services/rpc-client';
import { premiumFetch } from '@/services/premium-fetch';
import { IntelligenceServiceClient, MarketServiceClient } from '@/services/generated-rpc-clients';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import { getPersonalEntitlement, isPersonalDeployment } from '@/services/deployment-profile';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';
import {
  createMarketChartFocusController,
  hasPlottableMarketSeries,
  type MarketChartFocusController,
} from '@/components/market-chart-interactions';
import {
  normalizeStockResearchSymbol,
  stockResearchUrl,
} from './stock-research-route';
import {
  newsEvidenceTimeline,
  type Ticker360DataStatus,
  type Ticker360TimelineItem,
} from './ticker-360-model';
import {
  buildRiskTicket,
  type BuildRiskTicketInput,
  type RiskTicket,
  type RiskTicketItem,
  type RiskTicketStatus,
} from './risk-ticket-model';
import {
  riskChangeCheckpointView,
  saveRiskChangeCheckpoint,
  type RiskChangeStorage,
} from './risk-change-checkpoint.ts';
import type { OpenOutcomeReplayController } from './open-outcome-replay-view.ts';
import {
  activatePageInteractionIsolation,
  type PageInteractionIsolation,
} from './historical-replay-session.ts';
import { buildEtfIntelligence, type EtfIntelligence } from './etf-intelligence-model';
import {
  buildEquityDecision,
  buildEtfDecision,
  applyLearningToDecision,
  type TickerDecision,
} from './ticker-decision-model';
import { OWNER_CONTEXT_CHANGED } from '@/services/owner-context';
import { fetchInstrumentLearning } from '@/services/autonomous-learning';
import type { InstrumentLearningSummary } from '../../../shared/autonomous-learning-contract.ts';

/** '/' is rewritten to the marketing page in production; the app lives here. */
const DASHBOARD_PATH = '/dashboard';

let ownerContextCleanup: (() => void) | null = null;
let overlayEl: HTMLElement | null = null;
let focusController: MarketChartFocusController | null = null;
let analyzeAbort: AbortController | null = null;
let riskAbort: AbortController | null = null;
let replayController: OpenOutcomeReplayController | null = null;
let pageIsolation: PageInteractionIsolation | null = null;
let replayOpener: HTMLElement | null = null;
let mainFocusFallbackAllowed = false;
let popStateBound = false;
/**
 * Distinguishes overlapping opens. The deep-link timer and a Market Panel click
 * can both call in; without a token the later teardown/rebuild would clobber
 * whichever overlay the user actually asked for.
 */
let openGeneration = 0;
/** Where to send the address bar when the overlay closes. */
let returnUrl: string | null = null;

const ANALYZE_TIMEOUT_MS = 20_000;
/** Canonical evidence can be supplied by a bounded caller without changing the live provider path. */
export type StockResearchRiskEvidence = Omit<BuildRiskTicketInput, 'ticker' | 'companySignals'>;

function mm(key: MyMonitorTranslationKey): string {
  return translateMyMonitor(key, document.documentElement.lang);
}

function isKoreanUi(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith('ko');
}

function localizedEvidenceText(value: string): string {
  if (!isKoreanUi()) return value;
  return value
    .replace(/\bCONFIRMED\b/g, mm('risk.status.confirmed'))
    .replace(/\bINSUFFICIENT\b/g, mm('risk.status.needsReview'))
    .replace(/\bPUBLIC_SNAPSHOT\b/g, mm('risk.provenance.publicSnapshot'))
    .replace(/A reverse split changes share units and can be associated with listing-compliance remediation\./g, mm('risk.reverseSplitWhy'))
    .replace(/\bReverse split\b/g, mm('risk.type.reverseSplit'))
    .replace(/(\d+) old shares?\s*→\s*(\d+) new shares?/g, '$1주 → $2주')
    .replace(/Data unavailable:/g, `${mm('common.unavailable')}:`);
}

function localizedRiskWhy(item: RiskTicketItem): string {
  if (!isKoreanUi()) return item.whyItMatters;
  const keys: Record<RiskTicketItem['riskType'], string> = {
    ATM: '시장가 발행은 추가 매각 여력을 만들고 단기 희석 가능성을 바꿀 수 있습니다.',
    OFFERING: '신규 또는 변경된 공모는 현금 여력과 유통 주식 수에 영향을 줄 수 있습니다.',
    DILUTION: '신주 발행이나 발행주식 수 증가는 기존 주주의 지분 비율을 낮출 수 있습니다.',
    SHARES_OUTSTANDING: '시점별 발행주식 수 변화는 자본 구조 변화와 가격 움직임을 구분하는 데 도움이 됩니다.',
    REVERSE_SPLIT: mm('risk.reverseSplitWhy'),
    LISTING_COMPLIANCE: '상장 미달, 상장폐지 통지 또는 요건 회복은 거래 가능성에 영향을 줄 수 있습니다.',
    WARRANT_OR_PREFERRED: '전환 또는 행사 가능한 증권은 향후 보통주 공급과 권리 우선순위를 바꿀 수 있습니다.',
  };
  return keys[item.riskType];
}

function statusClass(status: Ticker360DataStatus): string {
  return status.toLowerCase().replace(/\s+/g, '-');
}

function statusBadge(status: Ticker360DataStatus): string {
  const labelKey: Record<Ticker360DataStatus, MyMonitorTranslationKey> = {
    Live: 'common.live',
    Delayed: 'risk.status.delayed',
    Cached: 'common.cached',
    Unavailable: 'risk.status.unavailable',
    'Needs review': 'risk.status.needsReview',
  };
  const label = isKoreanUi() ? mm(labelKey[status]) : status;
  return `<span class="ticker-360-status ticker-360-status--${statusClass(status)}">${escapeHtml(label)}</span>`;
}

function runtimeSourceGaps(): string {
  return `
    <div class="ticker-360-source-gap ticker-360-source-gap--reference">
      <span>SEC</span><strong>${escapeHtml(mm('ticker.riskEvidence'))}</strong>
      <small>${escapeHtml(mm('risk.liveUnavailableDescription'))}</small>
    </div>
    <div class="ticker-360-source-gap" data-source-mode="live-corporate-actions">
      <span>${escapeHtml(mm('ticker.liveCorporateActions'))}</span>${statusBadge('Unavailable')}
      <small>${escapeHtml(mm('ticker.runtimeUnavailable'))}</small>
    </div>`;
}

function renderQuote(
  overlay: HTMLElement,
  symbol: string,
  stock?: MarketData,
  sourceLabel = 'Market quote RPC',
): void {
  const quoteHost = overlay.querySelector('.stock-research-quote');
  const chartHost = overlay.querySelector('.stock-research-chart');
  const nameHost = overlay.querySelector('.stock-research-name');
  if (!(quoteHost instanceof HTMLElement) || !(chartHost instanceof HTMLElement)) return;
  const available = stock?.price !== null && stock?.price !== undefined;
  if (nameHost instanceof HTMLElement) nameHost.textContent = stock?.name || symbol;
  const evidenceState: RiskTicketStatus = available
    ? 'CONFIRMED'
    : stock?.quoteEvidenceState === 'NOT_FOUND' ? 'NOT_FOUND' : 'UNAVAILABLE';
  quoteHost.dataset.quoteState = available ? 'available' : 'unavailable';
  quoteHost.dataset.evidenceState = evidenceState;
  const observation = stock?.observedAt || stock?.observationDate;
  const observationLabel = observation
    ? `${stock?.observationSession === 'REGULAR_CLOSE' ? 'Regular close' : 'Latest trade'} · ${observation}`
    : mm('ticker.sourceTimeUnavailable');
  const observationStatus: Ticker360DataStatus = stock?.observationSession === 'LATEST_TRADE' ? 'Live' : 'Delayed';
  const canonicalSource = stock?.marketDataProvider || sourceLabel;
  setTrustedHtml(quoteHost, trustedHtml(available ? `
    <div class="ticker-360-quote-line">
      <strong>${formatPrice(stock.price)}</strong>
      <span class="${stock.change === null ? '' : getChangeClass(stock.change)}">${stock.change === null ? '—' : formatChange(stock.change)}</span>
    </div>
    <div class="ticker-360-source">${statusBadge(observationStatus)} ${escapeHtml(canonicalSource)} · ${escapeHtml(observationLabel)}</div>
  ` : `
    <div class="ticker-360-quote-line"><strong>—</strong><span>${escapeHtml(mm('ticker.quoteUnavailable'))}</span></div>
    <div class="ticker-360-source">${riskStatusBadge(evidenceState)} ${escapeHtml(quoteUnavailableReason(stock?.quoteEvidenceReason))} <span>${escapeHtml(symbol)}</span></div>
  `, 'TICKER-360 quote values are escaped before rendering'));

  const chart = stock && hasPlottableMarketSeries(stock)
    ? terminalChart(stock.sparkline, {
      change: stock.change,
      width: 760,
      height: 240,
      formatValue: (value) => formatPrice(value),
      ariaLabel: `${stock.display} ${mm('ticker.priceChart')}`,
    })
    : '';
  chartHost.dataset.chartState = chart ? 'available' : 'unavailable';
  setTrustedHtml(chartHost, trustedHtml(chart || `
    <div class="ticker-360-unavailable">${statusBadge('Unavailable')} ${escapeHtml(mm('ticker.sparklineMissing'))}</div>
  `, 'TICKER-360 chart is generated from the existing escaped market series'));
}

function quoteUnavailableReason(reason?: string): string {
  const labels: Record<string, string> = {
    MARKET_QUOTE_UNAVAILABLE_REASON_NOT_FOUND: 'The authorized quote sources were queried; no observation was found.',
    MARKET_QUOTE_UNAVAILABLE_REASON_PROVIDER_ERROR: 'The quote provider failed before an observation could be verified.',
    MARKET_QUOTE_UNAVAILABLE_REASON_PROVIDER_RATE_LIMITED: 'The quote provider rate-limited this request.',
    MARKET_QUOTE_UNAVAILABLE_REASON_PROVIDER_NOT_CONFIGURED: 'The quote source is wired, but provider access is unavailable.',
    MARKET_QUOTE_UNAVAILABLE_REASON_REQUEST_LIMIT_EXCEEDED: 'The request symbol limit was exceeded before lookup.',
    MARKET_QUOTE_UNAVAILABLE_REASON_UPSTREAM_BUDGET_EXHAUSTED: 'The bounded upstream lookup budget was exhausted.',
    MARKET_QUOTE_UNAVAILABLE_REASON_SEED_UNAVAILABLE: 'The canonical seed snapshot was unavailable; upstream fan-out was blocked.',
  };
  return labels[reason ?? ''] ?? 'The quote source was unavailable before an observation could be verified.';
}

function renderEtfIntelligence(host: HTMLElement, intelligence: EtfIntelligence): void {
  const rows = intelligence.items.map((item) => `<article data-etf-intelligence="${escapeHtml(item.key)}" data-evidence-state="${escapeHtml(item.evaluation.state)}">
    <header><strong>${escapeHtml(item.label)}</strong>${riskStatusBadge(item.evaluation.state)}</header>
    <p>${escapeHtml(item.evaluation.reason)}</p>
    ${item.evaluation.missingEvidence.length ? `<small>Missing: ${escapeHtml(item.evaluation.missingEvidence.join(', '))}</small>` : ''}
  </article>`).join('');
  host.dataset.riskState = 'etf';
  setTrustedHtml(host, trustedHtml(`
    <section class="ticker-360-risk-summary">
      <h3>Leveraged ETF intelligence</h3>
      <p>${escapeHtml(intelligence.issuer)}${intelligence.benchmarkDescriptor ? ` · ${escapeHtml(intelligence.benchmarkDescriptor)}` : ''}</p>
      ${intelligence.leverageMultiple ? `<strong>DAILY ${escapeHtml(intelligence.direction)} ${intelligence.leverageMultiple}x · path-dependent</strong>` : ''}
    </section>
    <div class="ticker-360-risk-list ticker-360-etf-list">${rows}</div>
  `, 'ETF intelligence is rendered only from escaped canonical and deterministic derived values'));
}

function renderDecision(host: HTMLElement, decision: TickerDecision): void {
  const list = (label: string, values: string[]) => values.length
    ? `<div><strong>${escapeHtml(label)}</strong><ul>${values.slice(0, 5).map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>`
    : '';
  host.dataset.decisionPosture = decision.posture;
  setTrustedHtml(host, trustedHtml(`
    <div class="ticker-360-section-head"><h2>Internal judgment</h2><span>Deterministic · auditable</span></div>
    <p><strong>${escapeHtml(decision.posture.replace(/_/g, ' '))}</strong> · 근거 판단 점수 ${(decision.confidence * 100).toFixed(0)}%</p>
    ${decision.rawConfidence !== undefined ? `<p data-learning-calibration>raw ${(decision.rawConfidence * 100).toFixed(0)}% · adjusted ${(decision.confidence * 100).toFixed(0)}% · n=${decision.learning?.calibration.sampleCount ?? 0}</p>` : ''}
    ${list('WHY', [...decision.interpretation, ...decision.decisionDrivers])}
    ${list('COUNTEREVIDENCE', decision.counterEvidence)}
    ${list('UNKNOWNS', decision.unknowns)}
    ${list('WHAT WOULD CHANGE THE VIEW', decision.changeConditions)}
    ${list('NEXT CHECKS', decision.nextChecks)}
  `, 'Decision output is escaped and deterministically derived'));
}

function renderLearning(host: HTMLElement, learning: InstrumentLearningSummary | null): void {
  host.dataset.learningState = learning ? 'available' : 'unavailable';
  if (!learning) {
    host.replaceChildren(Object.assign(document.createElement('p'), {
      textContent: '자동 학습 결과가 아직 없습니다. 새 사례와 거래일 결과가 쌓이면 여기에 표시됩니다.',
    }));
    return;
  }
  const strongest = learning.strongestSignals.map((stat) =>
    `<li>${escapeHtml(stat.signal)} · ${stat.horizonTradingDays}일 적중 ${(stat.hitRate * 100).toFixed(0)}% · n=${stat.forecastSampleCount}</li>`).join('');
  const misleading = learning.knownFailurePatterns.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
  const similar = learning.similarCases.slice(0, 5).map((item) =>
    `<li>${escapeHtml(item.symbol)} · ${escapeHtml(item.sharedSignals.join(' + '))}${item.outcome ? ` · ${item.outcome.tradingDays}일 ${item.outcome.absoluteReturnPercent.toFixed(2)}%` : ''}</li>`).join('');
  setTrustedHtml(host, trustedHtml(`
    <div class="ticker-360-section-head"><h2>이 종목 판단에 반영된 과거 학습</h2><span>규칙 기반 유사도 · 실제 결과</span></div>
    <p>과거 유사 사례 ${learning.similarCaseCount}건 · 보정 표본 n=${learning.calibration.sampleCount}${learning.lastOutcomeUpdate ? ` · 마지막 결과 ${escapeHtml(learning.lastOutcomeUpdate)}` : ''}</p>
    ${strongest ? `<div><strong>역사적으로 유용한 신호</strong><ul>${strongest}</ul></div>` : `<p>최소 표본 ${learning.calibration.minimumSampleSize}건에 도달한 유용 신호가 아직 없습니다.</p>`}
    ${misleading ? `<div><strong>과거 판단 오류/오도 신호</strong><ul>${misleading}</ul></div>` : ''}
    ${similar ? `<div><strong>유사 해결 사례</strong><ul>${similar}</ul></div>` : ''}
  `, 'Autonomous learning projection contains escaped deterministic statistics only'));
}

function renderTimeline(host: HTMLElement, items: readonly Ticker360TimelineItem[]): void {
  const newsRows = items.map((item) => {
    const href = item.href ? sanitizeUrl(item.href) : '';
    const title = href
      ? `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title);
    return `<li data-event-id="${escapeHtml(item.id)}">
      <div><span class="ticker-360-event-type">${escapeHtml(mm('ticker.news'))}</span>${statusBadge(item.status)}</div>
      <strong>${title}</strong>
      <span>${escapeHtml(item.source)}${item.eventTime ? ` · ${escapeHtml(item.eventTime)}` : ''}</span>
      ${item.relatedDate ? `<span>${escapeHtml(mm('ticker.alignedTradingDate'))}: ${escapeHtml(item.relatedDate)}</span>` : ''}
    </li>`;
  }).join('');
  host.dataset.timelineState = newsRows ? 'available' : 'unavailable';
  setTrustedHtml(host, trustedHtml(`
    ${newsRows ? `<ol class="stock-research-news stock-research-timeline">${newsRows}</ol>` : `<p>${statusBadge('Unavailable')} ${escapeHtml(mm('ticker.newsUnavailable'))}</p>`}
    ${runtimeSourceGaps()}
  `, 'TICKER-360 evidence values and URLs are sanitized before rendering'));
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function renderFundamentals(
  host: HTMLElement,
  fundamentals: Record<string, unknown> | undefined,
  source: string,
  generatedAt: string,
  sourceAvailable = true,
): void {
  const definitions = [
    ['Total cash', 'totalCash', 'money'],
    ['Total debt', 'totalDebt', 'money'],
    ['Free cash flow', 'freeCashflow', 'money'],
    ['EBITDA', 'ebitda', 'money'],
    ['Revenue growth', 'revenueGrowth', 'ratio'],
    ['Profit margin', 'profitMargin', 'ratio'],
  ] as const;
  const values = definitions.flatMap(([label, key, kind]) => {
    const value = fundamentals?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    const display = kind === 'ratio' ? `${(value * 100).toFixed(1)}%` : compactNumber(value);
    return [`<div><span>${label}</span><strong>${escapeHtml(display)}</strong></div>`];
  });
  const state: RiskTicketStatus = values.length ? 'CONFIRMED' : sourceAvailable ? 'NOT_FOUND' : 'UNAVAILABLE';
  host.dataset.fundamentalsState = values.length ? 'available' : 'unavailable';
  host.dataset.evidenceState = state;
  setTrustedHtml(host, trustedHtml(values.length ? `
    <div class="ticker-360-metrics">${values.join('')}</div>
    <p class="ticker-360-source">${riskStatusBadge('CONFIRMED')} ${escapeHtml(source || 'AnalyzeStock')} · ${escapeHtml(generatedAt || mm('ticker.sourceTimeUnavailable'))}</p>
  ` : `<p>${riskStatusBadge(state)} ${escapeHtml(sourceAvailable
    ? 'The fundamentals source was queried; the selected fields were not found.'
    : 'The fundamentals provider was unavailable before the selected fields could be verified.')}</p>`,
  'TICKER-360 fundamentals contain finite runtime values only'));
}

function riskStatusBadge(status: RiskTicketStatus): string {
  const keys: Record<RiskTicketStatus, MyMonitorTranslationKey> = {
    CONFIRMED: 'risk.status.confirmed',
    NOT_FOUND: 'risk.status.notFound',
    NOT_WIRED: 'risk.status.notWired',
    STALE: 'risk.status.stale',
    UNAVAILABLE: 'risk.status.unavailable',
    INSUFFICIENT: 'risk.status.insufficient',
    NOT_APPLICABLE: 'risk.status.notApplicable',
  };
  const label = isKoreanUi() ? mm(keys[status]) : status.replace(/_/g, ' ');
  return `<span class="ticker-360-status ticker-360-risk-status ticker-360-risk-status--${status.toLowerCase().replace(/_/g, '-')}">${escapeHtml(label)}</span>`;
}

function humanUtcTimestamp(value: string, dateOnly = false): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  const locale = document.documentElement.lang.toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US';
  if (locale === 'ko-KR') {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }),
      timeZone: 'UTC',
    }).format(parsed);
  }
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(parsed);
  const day = parsed.getUTCDate();
  const year = parsed.getUTCFullYear();
  if (dateOnly) return `${month} ${day}, ${year}`;
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes} UTC`;
}

function humanCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return humanUtcTimestamp(`${value}T12:00:00.000Z`, true);
}

function sourceAvailabilityBadge(label: string, available: boolean): string {
  return `<span class="ticker-360-source-mode-status ticker-360-source-mode-status--${available ? 'available' : 'unavailable'}">${escapeHtml(label)}</span>`;
}

function readableSourceProvider(provider: string): string {
  return provider.toLowerCase() === 'sec_edgar' ? 'SEC EDGAR' : provider;
}

function deliveryProvenanceLabel(value: string): string {
  const keys: Partial<Record<string, MyMonitorTranslationKey>> = {
    PUBLIC_SNAPSHOT: 'risk.provenance.publicSnapshot',
    CANONICAL_RUNTIME: 'risk.provenance.canonicalRuntime',
    CANONICAL_ARTIFACT: 'risk.provenance.canonicalArtifact',
  };
  const key = keys[value];
  return key ? mm(key) : value.replace(/_/g, ' ').toLowerCase();
}

function sourceDatasetLabel(value: string): string {
  return value === 'PUBLIC_SNAPSHOT' ? mm('risk.provenance.publicSnapshot') : value;
}

function unavailableLiveFeedLabel(): string {
  const hostname = window.location.hostname.toLowerCase();
  return hostname === 'workers.dev' || hostname.endsWith('.workers.dev')
    ? mm('risk.liveUnavailablePreview')
    : mm('risk.liveUnavailable');
}

function localRiskChangeStorage(): RiskChangeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function riskTypeLabel(value: string): string {
  const keys: Partial<Record<string, MyMonitorTranslationKey>> = {
    ATM: 'risk.type.atm',
    OFFERING: 'risk.type.offering',
    DILUTION: 'risk.type.dilution',
    SHARES_OUTSTANDING: 'risk.type.sharesOutstanding',
    REVERSE_SPLIT: 'risk.type.reverseSplit',
    LISTING_COMPLIANCE: 'risk.type.listingCompliance',
    WARRANT_OR_PREFERRED: 'risk.type.warrantPreferred',
  };
  const key = keys[value];
  return key ? mm(key) : value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function riskChangeSummary(ticket: RiskTicket, storage: RiskChangeStorage | null): string {
  let view: ReturnType<typeof riskChangeCheckpointView>;
  try {
    view = riskChangeCheckpointView(storage, ticket);
  } catch {
    return `<section class="ticker-360-risk-change" data-risk-change-state="unavailable" aria-label="${escapeHtml(mm('risk.change.heading'))}">
      <h3>${escapeHtml(mm('risk.change.heading'))}</h3>
      <strong>${escapeHtml(mm('risk.change.comparisonUnavailable'))}</strong>
      <p>${escapeHtml(mm('risk.change.comparisonUnavailableDescription'))}</p>
    </section>`;
  }
  if (view.state === 'FIRST_CHECK') {
    return `<section class="ticker-360-risk-change" data-risk-change-state="first-check" aria-label="${escapeHtml(mm('risk.change.heading'))}">
      <h3>${escapeHtml(mm('risk.change.heading'))}</h3>
      <strong>${escapeHtml(mm('risk.change.firstCheck'))}</strong>
      <p>${storage
    ? escapeHtml(mm('risk.change.noBaseline'))
    : escapeHtml(mm('risk.change.storageUnavailable'))}</p>
      <button type="button" data-risk-mark-checked${storage ? '' : ' disabled'}>${escapeHtml(mm('risk.change.markChecked'))}</button>
    </section>`;
  }
  const newEvidence = [...view.newConfirmed, ...view.newNeedsReview];
  const newList = newEvidence.length
    ? `<ul>${newEvidence.map((change) => `<li>${escapeHtml(riskTypeLabel(change.identity.riskType))} · ${escapeHtml(mm(change.kind === 'NEW_CONFIRMED_EVIDENCE' ? 'risk.change.newConfirmed' : 'risk.change.newNeedsReview'))}</li>`).join('')}</ul>`
    : '';
  const headline = newEvidence.length
    ? isKoreanUi()
      ? `${view.newConfirmed.length} ${mm('risk.change.newConfirmed')} · ${view.newNeedsReview.length} ${mm('risk.change.newNeedsReview')}`
      : `${view.newConfirmed.length} new confirmed evidence · ${view.newNeedsReview.length} new needs review`
    : mm('risk.change.noNew');
  return `<section class="ticker-360-risk-change" data-risk-change-state="compared" aria-label="${escapeHtml(mm('risk.change.heading'))}">
    <h3>${escapeHtml(mm('risk.change.heading'))}</h3>
    <strong>${escapeHtml(headline)}</strong>
    ${newList}
    <p>${view.unchanged.length} ${escapeHtml(mm('risk.change.unchanged'))} · ${escapeHtml(mm('risk.change.lastChecked'))} <time datetime="${escapeHtml(view.lastCheckedAt)}">${escapeHtml(humanUtcTimestamp(view.lastCheckedAt))}</time></p>
    <small>${escapeHtml(mm('risk.change.disclosure'))}</small>
    <button type="button" data-risk-mark-checked>${escapeHtml(mm('risk.change.markCurrentChecked'))}</button>
  </section>`;
}

function renderRiskTicket(
  host: HTMLElement,
  ticket: RiskTicket,
  liveSecFeedAvailable: boolean,
): void {
  const checkpointStorage = localRiskChangeStorage();
  const rows = ticket.items.map((item) => {
    const sourceLinks = item.sources.map((source) => {
      const href = source.href ? sanitizeUrl(source.href) : '';
      const label = `${readableSourceProvider(source.provider)} · ${sourceDatasetLabel(source.dataset)} · ${deliveryProvenanceLabel(source.deliveryProvenance)}`;
      const itemDisplayLabel = riskTypeLabel(item.riskType);
      const link = href
        ? `<a class="ticker-360-risk-source-link" href="${href}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(mm('risk.openSource'))}: ${escapeHtml(itemDisplayLabel)}">${escapeHtml(mm('risk.openSource'))} <span aria-hidden="true">&#8599;</span></a>`
        : `<span class="ticker-360-risk-source-link--missing">${escapeHtml(mm('risk.sourceUnavailable'))}</span>`;
      const knownAt = item.knownAt;
      const acceptedAt = source.acceptedAt;
      const fetchedAt = source.fetchedAt;
      const acceptedDisplay = acceptedAt === knownAt
        ? mm('risk.sameAsKnown')
        : acceptedAt ? humanUtcTimestamp(acceptedAt) : mm('risk.notProvided');
      const chronology = [
        knownAt ? `<div><dt>${escapeHtml(mm('risk.known'))}</dt><dd><time datetime="${escapeHtml(knownAt)}">${escapeHtml(humanUtcTimestamp(knownAt))}</time></dd></div>` : '',
        acceptedAt ? `<div><dt>${escapeHtml(mm('risk.accepted'))}</dt><dd><time datetime="${escapeHtml(acceptedAt)}">${escapeHtml(acceptedDisplay)}</time></dd></div>` : '',
        fetchedAt ? `<div><dt>${escapeHtml(mm('risk.captured'))}</dt><dd><time datetime="${escapeHtml(fetchedAt)}">${escapeHtml(humanUtcTimestamp(fetchedAt, true))}</time></dd></div>` : '',
      ].filter(Boolean).join('');
      const exactChronology = [
        knownAt ? `Known: ${knownAt}` : '',
        acceptedAt ? `Accepted: ${acceptedAt}` : '',
        fetchedAt ? `Fetched: ${fetchedAt}` : '',
      ].filter(Boolean).join(' · ');
      const originalFields = [
        source.originalTitle ? `<div><dt>${escapeHtml(mm('risk.originalTitle'))}</dt><dd>${escapeHtml(source.originalTitle)}</dd></div>` : '',
        source.originalExcerpt ? `<div><dt>${escapeHtml(mm('risk.originalExcerpt'))}</dt><dd>${escapeHtml(source.originalExcerpt)}</dd></div>` : '',
        source.form ? `<div><dt>${escapeHtml(mm('risk.form'))}</dt><dd>${escapeHtml(source.form)}</dd></div>` : '',
        source.items?.length ? `<div><dt>${escapeHtml(mm('risk.items'))}</dt><dd>${escapeHtml(source.items.join(', '))}</dd></div>` : '',
        `<div><dt>${escapeHtml(mm('risk.accession'))}</dt><dd><code>${escapeHtml(source.accessionNumber ?? source.evidenceId)}</code></dd></div>`,
      ].filter(Boolean).join('');
      return `<div class="ticker-360-risk-source">
        <span class="ticker-360-risk-source-label">${escapeHtml(mm('risk.source'))}: ${escapeHtml(readableSourceProvider(source.provider))}</span>
        ${knownAt ? `<span>${escapeHtml(mm('risk.known'))}: <time datetime="${escapeHtml(knownAt)}">${escapeHtml(humanUtcTimestamp(knownAt))}</time></span>` : ''}
        <details class="ticker-360-risk-original">
          <summary>${escapeHtml(mm('risk.showOriginal'))}</summary>
          <p>${escapeHtml(localizedEvidenceText(label))}</p>
          ${originalFields ? `<dl class="ticker-360-risk-original-fields">${originalFields}</dl>` : ''}
          ${chronology ? `<dl class="ticker-360-risk-chronology">${chronology}</dl>` : ''}
          <code>${escapeHtml(exactChronology)}${exactChronology ? ' · ' : ''}Evidence: ${escapeHtml(source.evidenceId)}</code>
          ${link}
        </details>
      </div>`;
    }).join('');
    const timing = item.effectiveTimePrecision === 'EXACT_TIMESTAMP' && item.effectiveAt
      ? `<small class="ticker-360-risk-effective">${escapeHtml(mm('risk.effective'))} <time datetime="${escapeHtml(item.effectiveAt)}">${escapeHtml(humanUtcTimestamp(item.effectiveAt))}</time></small>`
      : item.effectiveTimePrecision === 'DATE_ONLY' && item.effectiveDate
        ? `<small class="ticker-360-risk-effective">${escapeHtml(mm('risk.effectiveDate'))} <time datetime="${escapeHtml(item.effectiveDate)}">${escapeHtml(humanCalendarDate(item.effectiveDate))}</time> · ${escapeHtml(mm('risk.exactTimeUndisclosed'))}</small>`
        : '';
    const diff = item.materialDiff ? `
      <div class="ticker-360-risk-diff" data-risk-diff="${escapeHtml(item.materialDiff.field)}">
        <span>${item.materialDiff.before ? escapeHtml(localizedEvidenceText(item.materialDiff.before.display)) : escapeHtml(mm('risk.noPriorState'))}</span>
        <span aria-hidden="true">→</span>
        <strong>${escapeHtml(localizedEvidenceText(item.materialDiff.after.display))}</strong>
      </div>` : '';
    return `<article data-risk-type="${escapeHtml(item.riskType)}" data-risk-status="${escapeHtml(item.status)}">
      <header><strong>${escapeHtml(riskTypeLabel(item.riskType))}</strong>${riskStatusBadge(item.status)}</header>
      <p>${escapeHtml(localizedEvidenceText(item.evaluation.reason))}</p>
      ${timing}
      ${diff}
      <details><summary>${escapeHtml(mm('risk.whyItMatters'))}</summary><p>${escapeHtml(localizedRiskWhy(item))}</p></details>
      ${sourceLinks ? `<div class="ticker-360-risk-sources">${sourceLinks}</div>` : ''}
    </article>`;
  }).join('');
  const confirmed = ticket.items.filter((item) => item.evaluation.state === 'CONFIRMED');
  const stateCounts = ticket.items.reduce<Partial<Record<RiskTicketStatus, number>>>((counts, item) => {
    counts[item.evaluation.state] = (counts[item.evaluation.state] ?? 0) + 1;
    return counts;
  }, {});
  const stateSummary = Object.entries(stateCounts)
    .map(([state, count]) => `${count} ${isKoreanUi()
      ? ({
        CONFIRMED: mm('risk.status.confirmed'), NOT_FOUND: mm('risk.status.notFound'),
        NOT_WIRED: mm('risk.status.notWired'), STALE: mm('risk.status.stale'),
        UNAVAILABLE: mm('risk.status.unavailable'), INSUFFICIENT: mm('risk.status.insufficient'),
        NOT_APPLICABLE: mm('risk.status.notApplicable'),
      } as Record<RiskTicketStatus, string>)[state as RiskTicketStatus]
      : state.replace(/_/g, ' ').toLowerCase()}`)
    .join(' · ');
  const confirmedSummary = confirmed.map((item) => `<li>
    <strong>${escapeHtml(riskTypeLabel(item.riskType))}</strong> ${riskStatusBadge('CONFIRMED')}
    ${item.knownAt ? `<span>${escapeHtml(mm('risk.known'))} <time datetime="${escapeHtml(item.knownAt)}">${escapeHtml(humanUtcTimestamp(item.knownAt))}</time></span>` : ''}
  </li>`).join('');
  const snapshotAvailable = ticket.items.some((item) => item.sources.some(
    (source) => source.deliveryProvenance === 'PUBLIC_SNAPSHOT',
  ));
  const hasEvidence = ticket.items.some((item) => item.evaluation.evidenceIds.length > 0);
  const allUnavailable = ticket.items.every((item) => ['UNAVAILABLE', 'NOT_WIRED'].includes(item.evaluation.state));
  const changeSummary = riskChangeSummary(ticket, checkpointStorage);
  host.dataset.riskState = allUnavailable ? 'unavailable' : hasEvidence ? 'evidence' : 'known-empty';
  setTrustedHtml(host, trustedHtml(`
    <section class="ticker-360-risk-source-modes" aria-label="${escapeHtml(mm('risk.sourceAvailability'))}">
      <h3>${escapeHtml(mm('risk.sourceAvailability'))}</h3>
      <div data-source-mode="live-feed" data-source-availability="${liveSecFeedAvailable ? 'available' : 'unavailable'}">
        <strong>${escapeHtml(mm('risk.liveFeed'))}</strong>${sourceAvailabilityBadge(liveSecFeedAvailable ? mm('risk.liveAvailable') : unavailableLiveFeedLabel(), liveSecFeedAvailable)}
        <small>${escapeHtml(mm(liveSecFeedAvailable ? 'risk.liveAvailableDescription' : 'risk.liveUnavailableDescription'))}</small>
      </div>
      <div data-source-mode="official-sec-snapshot" data-source-availability="${snapshotAvailable ? 'available' : 'unavailable'}">
        <strong>${escapeHtml(mm('risk.snapshot'))}</strong>${sourceAvailabilityBadge(mm(snapshotAvailable ? 'risk.snapshotAvailable' : 'risk.snapshotUnavailable'), snapshotAvailable)}
        <small>${escapeHtml(mm(snapshotAvailable ? 'risk.snapshotDescription' : 'risk.snapshotMissingDescription'))}</small>
      </div>
    </section>
    <section class="ticker-360-risk-summary" aria-label="${escapeHtml(mm('risk.summary'))}">
      <h3>${escapeHtml(mm(confirmed.length ? 'risk.summaryConfirmed' : 'risk.summaryGlance'))}</h3>
      <p>${escapeHtml(stateSummary)}</p>
      ${confirmedSummary ? `<ul>${confirmedSummary}</ul>` : `<p>${escapeHtml(mm('risk.noConfirmed'))}</p>`}
    </section>
    ${changeSummary}
    <p class="ticker-360-risk-cutoff">${escapeHtml(mm('risk.asKnownAt'))} ${escapeHtml(ticket.asKnownAt)} · ${escapeHtml(mm('risk.notRecommendation'))}</p>
    <div class="ticker-360-risk-list">${rows}</div>
  `, 'RiskTicket values are escaped and evidence URLs are sanitized before rendering'));
  host.querySelector('[data-risk-mark-checked]')?.addEventListener('click', () => {
    if (saveRiskChangeCheckpoint(checkpointStorage, ticket)) {
      renderRiskTicket(host, ticket, liveSecFeedAvailable);
    }
  });
}

async function loadOpenOutcomeReplay(overlay: HTMLElement, generation: number): Promise<void> {
  const host = overlay.querySelector('.signal-lab-root');
  if (!(host instanceof HTMLElement)) return;
  try {
    const [{ loadOpenOutcomeArtifact }, { renderOpenOutcomeReplay }] = await Promise.all([
      import('./open-outcome-data.ts'),
      import('./open-outcome-replay-view.ts'),
    ]);
    const artifact = await loadOpenOutcomeArtifact();
    if (generation !== openGeneration || !host.isConnected) return;
    const researchSymbol = overlay.dataset.researchSymbol ?? '';
    const matchingEpisode = artifact.episodes
      .filter((episode) => episode.outcome !== undefined
        && episode.tickerAtEventTime.toUpperCase() === researchSymbol)
      .sort((left, right) => right.eventStart.localeCompare(left.eventStart))[0];
    replayController?.destroy();
    replayController = renderOpenOutcomeReplay(host, {
      episodes: artifact.episodes,
      defaultEpisodeId: matchingEpisode?.episodeId ?? null,
      researchSymbol,
      generatedAt: artifact.generatedAt,
      sourceIds: artifact.sourceIds,
    });
    host.dataset.openOutcomeLoadState = 'ready';
  } catch {
    if (generation !== openGeneration || !host.isConnected) return;
    host.dataset.openOutcomeLoadState = 'error';
    host.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'ticker-360-unavailable',
      textContent: mm('common.unavailable'),
    }));
  }
}

function enterHistoricalReplay(overlay: HTMLElement, opener: HTMLElement | null): void {
  if (overlay !== overlayEl || overlay.dataset.stockResearchMode === 'replay') return;
  // The live subtree is removed below, so keep the exact entry control before
  // isolation starts. If a future Replay close keeps that control connected it
  // remains the most precise return target; today's full-overlay close falls
  // back to the control that opened TICKER-360.
  replayOpener = opener;
  analyzeAbort?.abort();
  analyzeAbort = null;
  riskAbort?.abort();
  riskAbort = null;
  replayController?.destroy();
  replayController = null;
  const replayGeneration = ++openGeneration;
  overlay.dataset.stockResearchMode = 'replay';

  // Isolation is structural: live values leave the document rather than being
  // visually hidden where they could still leak through DOM inspection.
  overlay.querySelector('[data-stock-research-live]')?.remove();
  const room = overlay.querySelector('.stock-research-room');
  if (!(room instanceof HTMLElement)) return;
  const shell = document.createElement('section');
  shell.className = 'stock-research-replay-mode';
  shell.dataset.historicalReplayMode = 'isolated';
  const heading = document.createElement('header');
  heading.className = 'stock-research-head';
  const headingBody = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'stock-research-kicker';
  kicker.textContent = `HISTORICAL REPLAY · ${mm('replay.isolatedMode')}`;
  const title = document.createElement('h1');
  title.textContent = mm('replay.title');
  const guidance = document.createElement('p');
  guidance.className = 'signal-lab-disclosure';
  guidance.textContent = mm('replay.isolatedGuidance');
  headingBody.append(kicker, title, guidance);
  heading.append(headingBody);
  const host = document.createElement('div');
  host.className = 'signal-lab-root';
  host.dataset.openOutcomeLoadState = 'loading';
  const loading = document.createElement('p');
  loading.className = 'ticker-360-unavailable';
  loading.textContent = mm('replay.loading');
  host.append(loading);
  shell.append(heading, host);
  room.append(shell);
  if (!pageIsolation) pageIsolation = activatePageInteractionIsolation(overlay);
  const closeButton = room.querySelector('.stock-research-close');
  focusController?.activate(closeButton instanceof HTMLElement ? closeButton : null);
  void loadOpenOutcomeReplay(overlay, replayGeneration);
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element === document.body || element === document.documentElement) return false;
  if (element.matches(':disabled, [aria-disabled="true"], [hidden], [aria-hidden="true"]')) return false;
  return element.closest('[inert], [aria-hidden="true"]') === null;
}

function focusWithoutScroll(element: HTMLElement | null): boolean {
  if (!canRestoreFocus(element)) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function restoreOverlayFocus(
  preferred: readonly (HTMLElement | null)[],
  allowMainFallback: boolean,
): void {
  for (const element of preferred) {
    if (focusWithoutScroll(element)) return;
  }

  // An activation path with an explicit opener must never silently redirect
  // focus to a different control if a market refresh removes that row. The
  // main landmark fallback is reserved for a direct /stocks/:symbol entry,
  // where no opener exists by definition.
  if (!allowMainFallback) return;

  // A direct /stocks/:symbol load has no opening control. The dashboard main
  // landmark is its stable logical destination; the final query keeps small
  // embedded/test shells usable without ever choosing body.
  for (const selector of [
    '#main',
    'main[tabindex]',
    '[role="main"][tabindex]',
    '#searchBtn',
    '#mobileSearchBtn',
  ]) {
    if (focusWithoutScroll(document.querySelector<HTMLElement>(selector))) return;
  }

  const fallbacks = document.querySelectorAll<HTMLElement>([
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', '));
  for (const fallback of fallbacks) {
    if (focusWithoutScroll(fallback)) return;
  }
}

function removeOverlay(restoreFocus: boolean): void {
  ownerContextCleanup?.();
  ownerContextCleanup = null;
  const hadOverlay = overlayEl !== null;
  const returnFocus = focusController?.returnFocus ?? null;
  const allowMainFallback = mainFocusFallbackAllowed;
  analyzeAbort?.abort();
  analyzeAbort = null;
  riskAbort?.abort();
  riskAbort = null;
  replayController?.destroy();
  replayController = null;
  // Restore the app shell while the dialog still exists so focus restoration
  // never targets an inert background and the dialog is never aria-hidden.
  pageIsolation?.deactivate();
  pageIsolation = null;
  focusController?.deactivate({ restoreFocus: false });
  focusController = null;
  overlayEl?.remove();
  overlayEl = null;
  if (restoreFocus && hadOverlay) restoreOverlayFocus([replayOpener, returnFocus], allowMainFallback);
  replayOpener = null;
  mainFocusFallbackAllowed = false;
}

function onPopState(): void {
  // Back must close the overlay. Use removeOverlay, not the public close: the
  // browser has already restored the previous entry, so writing history here
  // would stack a second edit on top of it.
  if (!overlayEl || isStockResearchLocation()) return;
  removeOverlay(true);
  // The browser restored the entry itself, so the recorded return target is
  // spent; keeping it would misdirect a later close.
  returnUrl = null;
}

export function closeStockResearchOverlay(): void {
  ownerContextCleanup?.();
  ownerContextCleanup = null;
  const wasHistoricalReplay = overlayEl?.dataset.stockResearchMode === 'replay';
  removeOverlay(true);
  if (!isStockResearchLocation()) return;
  // Historical Replay is a mode inside the current stock route, not route
  // navigation. Closing it must not replace a direct /stocks/:symbol URL with
  // the dashboard (or consume an earlier route captured by the live overlay).
  if (wasHistoricalReplay) {
    returnUrl = null;
    return;
  }
  // Preserve history.state: it carries the shared overlay marker that other
  // sheets rely on for Back handling (see event-handlers.ts writeUrlState).
  const next = returnUrl ?? `${DASHBOARD_PATH}${window.location.search}`;
  returnUrl = null;
  window.history.replaceState(window.history.state, '', next);
}

function isStockResearchLocation(): boolean {
  return /^\/stocks(?:\/|$)/.test(window.location.pathname);
}

export function navigateToStockResearch(
  symbol: string,
  stock?: MarketData,
  opener?: HTMLElement | null,
): void {
  const normalized = normalizeStockResearchSymbol(symbol);
  if (!normalized) return;
  const url = stockResearchUrl(normalized);
  if (window.location.pathname !== url) {
    if (!isStockResearchLocation()) {
      returnUrl = `${window.location.pathname}${window.location.search}`;
    }
    window.history.pushState(
      { ...(window.history.state as Record<string, unknown> | null ?? {}), stockResearch: normalized },
      '',
      url,
    );
  }
  void openStockResearchOverlay(normalized, stock, undefined, opener);
}

export async function openStockResearchOverlay(
  rawSymbol: string,
  stock?: MarketData,
  riskEvidence?: StockResearchRiskEvidence,
  opener?: HTMLElement | null,
): Promise<void> {
  const symbol = normalizeStockResearchSymbol(rawSymbol);
  if (!symbol) return;
  const storedIdentity = getMarketWatchlistEntries().find((entry) => entry.symbol === symbol);
  const instrument: MarketData = {
    ...storedIdentity,
    ...stock,
    symbol,
    name: storedIdentity?.name || stock?.name || symbol,
    display: storedIdentity?.display || stock?.display || symbol,
    price: stock?.price ?? null,
    change: stock?.change ?? null,
  };
  const assetClass = instrument.assetClass ?? (instrument.instrumentType === 'ETF' ? 'ETF' : 'EQUITY');
  const isEtf = assetClass === 'ETF';

  const generation = ++openGeneration;
  if (!popStateBound) {
    window.addEventListener('popstate', onPopState);
    popStateBound = true;
  }
  if (returnUrl === null && !isStockResearchLocation()) {
    returnUrl = `${window.location.pathname}${window.location.search}`;
  }
  const directUrlEntry = returnUrl === null && isStockResearchLocation() && !opener;

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const explicitReturnFocus = focusController?.returnFocus ?? opener ?? null;
  const returnFocus = explicitReturnFocus
    ?? (activeElement?.isConnected ? activeElement : null);
  removeOverlay(false);
  mainFocusFallbackAllowed = directUrlEntry;

  overlayEl = document.createElement('div');
  overlayEl.className = 'stock-research-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', `${symbol} ${mm('nav.research')}`);
  overlayEl.dataset.stockResearchMode = 'live';
  overlayEl.dataset.researchSymbol = symbol;
  overlayEl.dataset.assetClass = assetClass;

  const personal = isPersonalDeployment();
  const entitled = personal ? getPersonalEntitlement('stockAnalysis') : hasPremiumAccess();

  setTrustedHtml(
    overlayEl,
    trustedHtml(`
      <div class="stock-research-room">
        <button type="button" class="stock-research-close" aria-label="${escapeHtml(mm('ticker.closeResearch'))}">${escapeHtml(mm('ticker.close'))}</button>
        <div data-stock-research-live>
        <form class="ticker-360-symbol-form" aria-label="${escapeHtml(mm('ticker.openAnother'))}">
          <label for="ticker-360-symbol">${escapeHtml(mm('ticker.researchAnother'))}</label>
          <div><input id="ticker-360-symbol" name="symbol" value="${escapeHtml(symbol)}" maxlength="15" autocomplete="off" spellcheck="false"><button type="submit">${escapeHtml(mm('ticker.open'))}</button></div>
        </form>
        <nav class="ticker-360-ia" aria-label="${escapeHtml(mm('nav.research'))}">
          <a href="#ticker-360-overview">${escapeHtml(mm('ticker.ia.overview'))}</a>
          <a href="#ticker-360-risk">${escapeHtml(mm('ticker.ia.risk'))}</a>
          <a href="#ticker-360-evidence">${escapeHtml(mm('ticker.ia.evidence'))}</a>
          <a href="#ticker-360-cases">${escapeHtml(mm('ticker.ia.cases'))}</a>
          <a href="#ticker-360-learning">${escapeHtml(mm('ticker.ia.learning'))}</a>
        </nav>
        <header class="stock-research-head" id="ticker-360-overview">
          <div>
            <div class="stock-research-kicker">TICKER-360 · ${escapeHtml(mm('ticker.prototype'))}</div>
            <h1 class="stock-research-symbol">${escapeHtml(symbol)}</h1>
            <div class="stock-research-name">${escapeHtml(instrument.name || symbol)} · ${escapeHtml(assetClass)}${instrument.exchange ? ` · ${escapeHtml(instrument.exchange)}` : ''}</div>
          </div>
          <div class="stock-research-quote" data-quote-state="loading"><span>${escapeHtml(mm('ticker.loadingQuote'))}</span></div>
        </header>
        <div class="ticker-360-session"><span>${escapeHtml(mm('ticker.marketSession'))}</span><strong data-market-session>${escapeHtml(mm('common.unavailable'))}</strong>${statusBadge('Unavailable')}</div>
        <section class="ticker-360-card ticker-360-price">
          <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.price'))}</h2><span>${escapeHtml(mm('ticker.providerSparkline'))}</span></div>
          <div class="stock-research-chart" data-chart-state="loading"><p>${escapeHtml(mm('ticker.loadingChart'))}</p></div>
        </section>
        <div class="ticker-360-grid">
          <section class="ticker-360-card" id="ticker-360-risk">
            <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.ia.risk'))}</h2><span>${isEtf ? 'ETF-specific' : `SEC domestic + FPI · ${escapeHtml(mm('ticker.riskEvidence'))}`}</span></div>
            <div class="ticker-360-risk-ticket" data-risk-state="loading">
              <p>${statusBadge('Delayed')} ${escapeHtml(mm('ticker.loadingRisk'))}</p>
            </div>
          </section>
          <section class="ticker-360-card" id="ticker-360-evidence">
            <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.ia.evidence'))}</h2><span>${escapeHtml(mm('ticker.newestFirst'))}</span></div>
            <div class="ticker-360-timeline" data-timeline-state="${entitled ? 'loading' : 'unavailable'}">
              <p>${entitled
    ? 'Loading available news evidence…'
    : personal
      ? `${statusBadge('Unavailable')} ${escapeHtml(mm('ticker.runtimeUnavailable'))}`
      : `${statusBadge('Unavailable')} News analysis requires Premium access.`}</p>
              ${runtimeSourceGaps()}
            </div>
          </section>
          ${isEtf ? '' : `<section class="ticker-360-card">
            <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.fundamentals'))}</h2><span>${escapeHtml(mm('ticker.selectedFields'))}</span></div>
            <div class="ticker-360-fundamentals" data-fundamentals-state="${entitled ? 'loading' : 'unavailable'}">
              <p>${entitled
    ? 'Loading available fundamentals…'
    : personal
      ? `${statusBadge('Unavailable')} ${escapeHtml(mm('ticker.runtimeUnavailable'))}`
      : `${statusBadge('Unavailable')} Live fundamentals not wired without Premium analysis.`}</p>
            </div>
          </section>`}
          <section class="ticker-360-card stock-research-analyze" data-analyze-state="${entitled ? 'loading' : 'locked'}">
            <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.analysis'))}</h2><span>${personal ? 'Owner RPC' : 'Premium RPC'}</span></div>
            ${entitled ? '<p>Loading analysis…</p>' : '<p>Stock analysis and backtest stay locked.</p>'}
          </section>
        </div>
        <section class="ticker-360-card ticker-360-decision" data-decision-posture="WAIT_FOR_CONFIRMATION"></section>
        <section class="ticker-360-card ticker-360-learning" id="ticker-360-learning" data-learning-state="loading">
          <p>자동 학습 결과를 불러오는 중입니다.</p>
        </section>
        <section class="ticker-360-card" id="ticker-360-cases" aria-labelledby="historical-replay-entry-title">
          <div class="ticker-360-section-head"><h2 id="historical-replay-entry-title">${escapeHtml(mm('ticker.ia.cases'))}</h2><span>${escapeHtml(mm('replay.isolatedMode'))}</span></div>
          <p><strong>Manual Replay.</strong> ${escapeHtml(mm('ticker.replayDescription'))}</p>
          <p>수동 재현은 의도적으로 미래 정보를 가린 연습 도구이며 자동 학습 파이프라인과 독립적입니다.</p>
          <button type="button" data-enter-historical-replay>${escapeHtml(mm('replay.start'))}</button>
        </section>
        </div>
      </div>
    `, 'Stock research overlay values are escaped before rendering'),
  );

  document.body.append(overlayEl);
  // TICKER-360 is a body-level modal in both live and Replay modes. Isolate the
  // app shell before attaching interactions so header/settings/mobile-nav
  // controls cannot receive pointer, focus, or app-shortcut events through it.
  pageIsolation = activatePageInteractionIsolation(overlayEl);
  overlayEl.querySelector('.stock-research-close')?.addEventListener('click', () => closeStockResearchOverlay());
  overlayEl.querySelector('[data-enter-historical-replay]')?.addEventListener('click', (event) => {
    if (overlayEl) {
      enterHistoricalReplay(
        overlayEl,
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
      );
    }
  });
  overlayEl.addEventListener('click', (event) => {
    if (event.target === overlayEl) closeStockResearchOverlay();
  });
  overlayEl.querySelector('.ticker-360-symbol-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = overlayEl?.querySelector('#ticker-360-symbol');
    if (!(input instanceof HTMLInputElement)) return;
    const next = normalizeStockResearchSymbol(input.value);
    if (!next) {
      input.setCustomValidity(mm('ticker.invalidSymbol'));
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    navigateToStockResearch(next);
  });
  focusController = createMarketChartFocusController(overlayEl, () => closeStockResearchOverlay(), returnFocus);
  const closeButton = overlayEl.querySelector('.stock-research-close');
  focusController.activate(closeButton instanceof HTMLElement ? closeButton : null);

  ownerContextCleanup?.();
  // The personal symbol screen gets position context from OwnerSignalStory.
  // Keep the separate owner control-room card on Home only.
  ownerContextCleanup = null;
  if (personal) {
    const host = overlayEl.querySelector('.stock-research-analyze');
    if (host instanceof HTMLElement) {
      const recoverySurface = ['SOXL', 'SOXS', 'CISS', 'KORU'].includes(symbol);
      if (recoverySurface) {
        overlayEl.dataset.ownerRecoverySurface = 'true';
        host.classList.add('stock-research-analyze--owner-recovery');
        // These owner instruments share one full-width decision surface.
        overlayEl.querySelector('.ticker-360-symbol-form')?.remove();
      }
      // One owner decision surface: its quote, risks, learning and AI share a snapshot.
      for (const selector of ['.stock-research-head', '.ticker-360-ia', '.ticker-360-session', '.ticker-360-price', '#ticker-360-risk', '#ticker-360-evidence', '.ticker-360-decision', '.ticker-360-learning', '#ticker-360-cases']) {
        overlayEl.querySelector(selector)?.remove();
      }
      overlayEl.querySelector('.ticker-360-fundamentals')?.closest('section')?.remove();
      const cleanupIntelligence = mountOwnerIntelligence(host, symbol);
      ownerContextCleanup = cleanupIntelligence;
      return;
    }
  }
  const quoteWork = stock?.price != null
    ? Promise.resolve(renderQuote(overlayEl, symbol, instrument))
    : fetchStockQuote(symbol, instrument.name, instrument.display).then((resolved) => {
      if (generation === openGeneration && overlayEl?.isConnected) renderQuote(overlayEl, symbol, { ...instrument, ...resolved });
    }).catch(() => {
      if (generation === openGeneration && overlayEl?.isConnected) renderQuote(overlayEl, symbol);
    });

  const riskHost = overlayEl.querySelector('.ticker-360-risk-ticket');
  const decisionHost = overlayEl.querySelector('.ticker-360-decision');
  const learningHost = overlayEl.querySelector('.ticker-360-learning');
  let currentRawDecision: TickerDecision | null = null;
  let currentLearning: InstrumentLearningSummary | null = null;
  const showDecision = (decision: TickerDecision): void => {
    currentRawDecision = decision;
    if (decisionHost instanceof HTMLElement) renderDecision(decisionHost, applyLearningToDecision(decision, currentLearning));
  };
  let learningRequest = 0;
  const refreshLearning = async (): Promise<void> => {
    const request = ++learningRequest;
    currentLearning = null;
    if (learningHost instanceof HTMLElement) renderLearning(learningHost, null);
    if (currentRawDecision) showDecision(currentRawDecision);
    try {
      const learning = await fetchInstrumentLearning(symbol);
      if (request !== learningRequest || generation !== openGeneration || !overlayEl?.isConnected) return;
      currentLearning = learning;
      if (learningHost instanceof HTMLElement) renderLearning(learningHost, learning);
      if (currentRawDecision) showDecision(currentRawDecision);
    } catch {
      if (request === learningRequest && generation === openGeneration && learningHost instanceof HTMLElement) {
        learningHost.textContent = '학습 데이터 조회 실패 · 개인 인증과 동기화 상태를 확인하세요.';
      }
    }
  };
  if (personal) {
    window.addEventListener(OWNER_CONTEXT_CHANGED, refreshLearning);
    ownerContextCleanup = () => { learningRequest++; window.removeEventListener(OWNER_CONTEXT_CHANGED, refreshLearning); };
  }
  const learningWork = refreshLearning();
  let currentRiskTicket: RiskTicket | null = null;
  let currentEtfIntelligence: EtfIntelligence | null = null;
  const riskTeardown = new AbortController();
  riskAbort = riskTeardown;
  const riskSignal = AbortSignal.any([riskTeardown.signal, AbortSignal.timeout(ANALYZE_TIMEOUT_MS)]);
  const riskWork = riskHost instanceof HTMLElement ? (async () => {
    if (isEtf) {
      currentEtfIntelligence = buildEtfIntelligence(instrument);
      renderEtfIntelligence(riskHost, currentEtfIntelligence);
      showDecision(buildEtfDecision(currentEtfIntelligence));
      return;
    }
    let signals: ListCompanySignalsResponse | undefined;
    try {
      const client = new IntelligenceServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });
      signals = await client.listCompanySignals(
        { ticker: symbol, company: '', domain: '' },
        { signal: riskSignal },
      );
    } catch {
      if (riskTeardown.signal.aborted) return;
    }
    if (generation !== openGeneration || !riskHost.isConnected) return;
    const discoveredAt = signals && Number.isFinite(signals.discoveredAtMs) && signals.discoveredAtMs > 0
      ? new Date(signals.discoveredAtMs).toISOString()
      : new Date().toISOString();
    let boundedEvidence = riskEvidence;
    if (!boundedEvidence && (!signals || signals.unavailable)) {
      try {
        const { publicRiskEvidenceForSymbol } = await import('./risk-public-snapshot.ts');
        boundedEvidence = publicRiskEvidenceForSymbol(symbol);
      } catch {
        // A malformed or unavailable frozen snapshot fails closed below.
      }
    }
    if (generation !== openGeneration || !riskHost.isConnected) return;
    try {
      currentRiskTicket = buildRiskTicket({
        ...boundedEvidence,
        ticker: symbol,
        asKnownAt: boundedEvidence?.asKnownAt ?? discoveredAt,
        ...(signals ? { companySignals: signals } : {}),
        assetClass,
      });
      renderRiskTicket(riskHost, currentRiskTicket, Boolean(signals && !signals.unavailable));
    } catch {
      currentRiskTicket = buildRiskTicket({
        ticker: symbol,
        asKnownAt: discoveredAt,
        assetClass,
      });
      renderRiskTicket(riskHost, currentRiskTicket, Boolean(signals && !signals.unavailable));
    }
    showDecision(buildEquityDecision(currentRiskTicket));
  })() : Promise.resolve();

  if (!entitled) {
    await Promise.all([quoteWork, riskWork]);
    return;
  }
  const analyzeHost = overlayEl.querySelector('.stock-research-analyze');
  const timelineHost = overlayEl.querySelector('.ticker-360-timeline');
  const fundamentalsHost = overlayEl.querySelector('.ticker-360-fundamentals');
  const sessionHost = overlayEl.querySelector('.ticker-360-session');
  if (!(analyzeHost instanceof HTMLElement)
    || !(timelineHost instanceof HTMLElement)
    || (!isEtf && !(fundamentalsHost instanceof HTMLElement))
    || !(sessionHost instanceof HTMLElement)) {
    await quoteWork;
    return;
  }
  const teardown = new AbortController();
  analyzeAbort = teardown;
  let analysisQuote: MarketData | undefined;
  let canonicalAnalysisId = "";
  const runAnalysis = async (deep = false): Promise<void> => {
    try {
      const client = new MarketServiceClient(getRpcBaseUrl(), { fetch: premiumFetch });
      const analysisHeaders: Record<string, string> = {};
      if (personal) {
        analysisHeaders['X-MyMonitor-Analysis-Mode'] = deep ? 'deep' : 'refresh';
        analysisHeaders['Cache-Control'] = 'no-cache';
        if (deep) analysisHeaders['X-MyMonitor-Evidence-Id'] = canonicalAnalysisId;
      }
      const analysis = await client.analyzeStock(
        { symbol, name: stock?.name || symbol, includeNews: true },
        { signal: AbortSignal.any([teardown.signal, AbortSignal.timeout(60_000)]), headers: analysisHeaders },
      );
      // A superseded open (or a close) must not paint over the live overlay.
      if (generation !== openGeneration || !analyzeHost.isConnected) return;
      if (deep && !analysis.available) {
        analyzeHost.dataset.briefState = 'OUTDATED';
        const status = analyzeHost.querySelector('[role=status]');
        if (status) status.textContent = 'OUTDATED · 근거가 변경되었거나 만료되었습니다. 새 정보 확인 후 다시 분석하세요.';
        return;
      }
      const previousId = canonicalAnalysisId;
      canonicalAnalysisId = analysis.analysisId;
      analyzeHost.dataset.briefState = !deep && previousId && previousId !== canonicalAnalysisId ? 'OUTDATED' : deep && !analysis.fallback ? 'CURRENT' : 'NOT_ANALYZED';
      analyzeHost.dataset.evidenceFingerprint = canonicalAnalysisId;
      renderTimeline(timelineHost, newsEvidenceTimeline(analysis.headlines ?? []).slice(0, 6));
      if (fundamentalsHost instanceof HTMLElement) {
        renderFundamentals(
          fundamentalsHost,
          analysis.fundamentals as unknown as Record<string, unknown> | undefined,
          analysis.provider,
          analysis.generatedAt,
        );
      }
      const marketSession = analysis.marketSession?.trim();
      setTrustedHtml(sessionHost, trustedHtml(marketSession ? `
        <span>${escapeHtml(mm('ticker.marketSession'))}</span><strong data-market-session>${escapeHtml(marketSession.toUpperCase())}</strong>${statusBadge('Needs review')}
      ` : `<span>${escapeHtml(mm('ticker.marketSession'))}</span><strong data-market-session>${escapeHtml(mm('common.unavailable'))}</strong>${statusBadge('Unavailable')}`,
      'TICKER-360 session is escaped before rendering'));
      if (analysis.available && Number.isFinite(analysis.currentPrice)) {
        analysisQuote = {
          symbol,
          name: analysis.name || stock?.name || symbol,
          display: analysis.display || symbol,
          price: analysis.currentPrice,
          change: Number.isFinite(analysis.changePercent) ? analysis.changePercent : null,
          observationDate: analysis.priceObservationDate || undefined,
          observationSession: analysis.priceObservationSession === 'REGULAR_CLOSE' ? 'REGULAR_CLOSE' : undefined,
          marketDataProvider: analysis.marketDataProvider || undefined,
          assetClass,
          instrumentType: instrument.instrumentType,
        };
      }
      if (isEtf) {
        currentEtfIntelligence = buildEtfIntelligence(instrument, {
          volumeRatio5d: analysis.volumeRatio5d,
          realizedVolatility: analysis.realizedVolatility,
          maxDrawdown: analysis.maxDrawdown,
          trendStatus: analysis.trendStatus,
          priceObservationDate: analysis.priceObservationDate,
          marketDataProvider: analysis.marketDataProvider,
        });
        if (riskHost instanceof HTMLElement) renderEtfIntelligence(riskHost, currentEtfIntelligence);
        showDecision(buildEtfDecision(currentEtfIntelligence));
      } else if (decisionHost instanceof HTMLElement) {
        showDecision(buildEquityDecision(currentRiskTicket));
      }
      if (personal && analysisQuote) renderQuote(overlayEl!, symbol, analysisQuote, 'AnalyzeStock canonical snapshot');
      const sentiment = analysis.newsSentiment == null
        ? ''
        : `<p data-news-overlay="model">News overlay (model): ${analysis.newsSentiment.toFixed(2)}</p>`;
      analyzeHost.dataset.analyzeState = 'ready';
      setTrustedHtml(
        analyzeHost,
        trustedHtml(`
          <div class="ticker-360-section-head"><h2>${escapeHtml(mm('ticker.analysis'))}</h2><span>${escapeHtml(analysis.provider || (personal ? 'Owner RPC' : 'Premium RPC'))}</span></div>
          <p>${escapeHtml(analysis.ratingSummary || analysis.summary || 'No analysis summary.')}</p>
          ${sentiment}
          <p class="stock-research-backtest">Manual backtest remains in the Stock Analysis panel.</p>
        `, 'Stock research analysis values are escaped before rendering'),
      );
      if (personal) {
        const { renderOwnerAnalysis } = await import('./owner-analysis-view');
        if (generation !== openGeneration || !analyzeHost.isConnected) return;
        renderOwnerAnalysis(analyzeHost, analysis, {
          outdated: analyzeHost.dataset.briefState === 'OUTDATED',
          refresh: () => runAnalysis(false), deep: () => runAnalysis(true),
        });
      }
    } catch {
      // Our own teardown is not an outage — but a TIMEOUT also arrives as an
      // AbortError. Only the teardown may be swallowed.
      if (teardown.signal.aborted) return;
      if (generation !== openGeneration || !analyzeHost.isConnected) return;
      analyzeHost.dataset.analyzeState = 'error';
      analyzeHost.replaceChildren();
      analyzeHost.append(Object.assign(document.createElement('p'), {
        textContent: mm('common.unavailable'),
      }));
      renderTimeline(timelineHost, []);
      if (fundamentalsHost instanceof HTMLElement) renderFundamentals(fundamentalsHost, undefined, '', '', false);
    }
  };
  const analysisWork = runAnalysis();
  await Promise.all([quoteWork, riskWork, analysisWork, learningWork]);
  if (generation === openGeneration
    && overlayEl?.isConnected
    && analysisQuote
    && (personal || overlayEl.querySelector('.stock-research-quote')?.getAttribute('data-quote-state') !== 'available')) {
    renderQuote(overlayEl, symbol, analysisQuote, 'AnalyzeStock RPC');
  }
}
