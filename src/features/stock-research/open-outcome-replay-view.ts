import { escapeHtml } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { terminalChart } from '@/utils/terminal-chart';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import {
  contextKnownAt,
  createReplayState,
  revealReplayOutcome,
  sealReplayForecast,
  type ReplayState,
} from './signal-lab-core.ts';
import {
  FORECAST_DECISIONS,
  OUTCOME_TRADING_DAY_HORIZONS,
  REVIEW_PATH_ASSESSMENTS,
  type EventEpisode,
  type ForecastDecision,
  type ForecastMetric,
  type ForecastPrediction,
  type ForecastRecord,
  type OutcomeHorizonTradingDays,
  type OutcomeLabel,
  type ReviewErrorClass,
  type ReviewRecord,
} from './signal-lab-contract.ts';
import {
  createSignalLabPersistence,
  type SignalLabPersistence,
  type SignalLabStorage,
} from './signal-lab-persistence.ts';
import {
  evaluateOpenOutcomeSimilarity,
  summarizeOpenOutcomeEpisodes,
} from './open-outcome-similarity.ts';

export interface OpenOutcomeReplayOptions {
  episodes: readonly EventEpisode[];
  /** null explicitly prevents the historical first-episode fallback. */
  defaultEpisodeId?: string | null;
  researchSymbol?: string;
  generatedAt: string;
  sourceIds: readonly string[];
  storage?: SignalLabStorage | null;
  similarityLimit?: number;
  minimumSimilarSampleSize?: number;
  now?: () => string;
}

export interface OpenOutcomeReplayController {
  destroy(): void;
  selectEpisode(episodeId: string): boolean;
  getSelectedEpisodeId(): string | undefined;
}

const REVIEW_VERDICTS = [
  'GOOD_DECISION_BAD_OUTCOME',
  'BAD_DECISION_GOOD_OUTCOME',
  'GOOD_DECISION_GOOD_OUTCOME',
  'BAD_DECISION_BAD_OUTCOME',
  'INDETERMINATE',
] as const satisfies readonly NonNullable<ReviewRecord['verdict']>[];

const REVIEW_ERROR_CLASSES = [
  'DATA_ERROR',
  'TIME_LEAK',
  'CATALYST_MISREAD',
  'MARKET_REGIME_ERROR',
  'TECHNICAL_OVERFIT',
  'SOCIAL_FALSE_CLAIM',
  'EXECUTION_ERROR',
  'PSYCHOLOGY_ERROR',
  'UNKNOWN',
] as const satisfies readonly ReviewErrorClass[];

const activeControllers = new WeakMap<HTMLElement, OpenOutcomeReplayController>();

function mm(key: MyMonitorTranslationKey): string {
  return translateMyMonitor(key, document.documentElement.lang);
}

function replayUi(english: string, korean: string): string {
  return document.documentElement.lang.toLowerCase().startsWith('ko') ? korean : english;
}

const FORECAST_DECISION_LABEL_KEYS = {
  BUY: 'replay.decision.buy',
  WAIT: 'replay.decision.wait',
  WATCH: 'replay.decision.watch',
  REJECT: 'replay.decision.reject',
} as const satisfies Record<ForecastDecision, MyMonitorTranslationKey>;

const REVIEW_ERROR_LABEL_KEYS = {
  DATA_ERROR: 'replay.error.data',
  TIME_LEAK: 'replay.error.timeLeak',
  CATALYST_MISREAD: 'replay.error.catalyst',
  MARKET_REGIME_ERROR: 'replay.error.marketRegime',
  TECHNICAL_OVERFIT: 'replay.error.technical',
  SOCIAL_FALSE_CLAIM: 'replay.error.social',
  EXECUTION_ERROR: 'replay.error.execution',
  PSYCHOLOGY_ERROR: 'replay.error.psychology',
  UNKNOWN: 'replay.error.unknown',
} as const satisfies Record<ReviewErrorClass, MyMonitorTranslationKey>;

function decisionLabel(value: ForecastDecision | undefined): string {
  return value ? mm(FORECAST_DECISION_LABEL_KEYS[value]) : mm('common.unknown');
}

function replayStatusLabel(value: string | undefined): string {
  if (!value || value === 'UNKNOWN') return mm('common.unknown');
  const keys: Partial<Record<string, MyMonitorTranslationKey>> = {
    COMPLETE: 'replay.status.complete',
    PARTIAL: 'replay.status.partial',
    INSUFFICIENT_SAMPLE: 'replay.status.insufficient',
    AVAILABLE: 'replay.status.available',
    DAILY_ONLY: 'replay.status.dailyOnly',
    INCOMPLETE_WINDOW: 'replay.status.incompleteWindow',
    UNKNOWN_KNOWLEDGE_TIME: 'replay.status.unknownKnowledgeTime',
    OUTSIDE_COVERAGE: 'replay.status.outsideCoverage',
    NOT_AVAILABLE: 'replay.status.notAvailable',
  };
  const key = keys[value];
  return key ? mm(key) : value.replace(/_/g, ' ').toLowerCase();
}

function percent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return mm('common.unknown');
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function plainPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return mm('common.unknown');
  return `${value.toFixed(1)}%`;
}

function statisticPercent(value: number | undefined, precision: 'plain' | 'signed'): string {
  if (value === undefined || !Number.isFinite(value)) return replayStatusLabel('INSUFFICIENT_SAMPLE');
  return precision === 'plain' ? plainPercent(value) : percent(value);
}

function lines(value: FormDataEntryValue | null): string[] {
  return typeof value === 'string'
    ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function textValue(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(data: FormData, field: string): number {
  return Number(textValue(data, field));
}

function replayCutoff(episode: EventEpisode): string {
  return episode.outcome?.forecastAt
    ?? episode.contextSnapshot.replayCutoffAt
    ?? episode.eventStart;
}

function outcomeAt(
  outcome: OutcomeLabel,
  horizon: OutcomeHorizonTradingDays,
): {
  absolute?: number;
  mfe?: number;
  mae?: number;
  market?: string;
  sector?: string;
  coverage: string;
  pathCoverage: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_SAMPLE';
  usableSessionCount?: number;
  expectedSessionCount: number;
  missingCount: number;
} {
  const structured = outcome.tradingDayOutcomes?.[horizon];
  const absolute = structured?.absoluteReturnPercent
    ?? outcome.returnsByTradingDays?.[horizon]
    ?? (horizon === 1 ? outcome.nextTradingDayReturnPercent : undefined);
  const market = structured?.marketRelative;
  const sector = structured?.sectorRelative;
  const pathCoverage = structured?.coverageStatus
    ?? (structured?.coverage === 'COMPLETE'
      ? 'COMPLETE'
      : structured?.coverage === 'INCOMPLETE'
        ? 'PARTIAL'
        : 'INSUFFICIENT_SAMPLE');
  const pathMetricsUsable = pathCoverage === 'COMPLETE';
  return {
    ...(absolute === undefined ? {} : { absolute }),
    ...(!pathMetricsUsable || structured?.mfePercent === undefined ? {} : { mfe: structured.mfePercent }),
    ...(!pathMetricsUsable || structured?.maePercent === undefined ? {} : { mae: structured.maePercent }),
    ...(market ? {
      market: `${percent(market.relativeReturnPercent)} vs ${market.benchmarkSymbol} (${percent(market.benchmarkReturnPercent)})`,
    } : {}),
    ...(sector ? {
      sector: `${percent(sector.relativeReturnPercent)} vs ${sector.benchmarkSymbol} (${percent(sector.benchmarkReturnPercent)})`,
    } : {}),
    coverage: structured?.coverage ?? (absolute === undefined ? 'UNKNOWN' : 'COMPLETE'),
    pathCoverage,
    ...(structured?.usableSessionCount === undefined
      ? {}
      : { usableSessionCount: structured.usableSessionCount }),
    expectedSessionCount: structured?.expectedSessionCount ?? horizon,
    missingCount: structured?.missingData.length ?? 0,
  };
}

function availablePercent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '이용 불가' : percent(value);
}

function renderSessionCoverage(value: ReturnType<typeof outcomeAt>): string {
  const usable = value.usableSessionCount === undefined
    ? mm('common.unknown')
    : String(value.usableSessionCount);
  return `${escapeHtml(replayStatusLabel(value.pathCoverage))} · ${usable}/${value.expectedSessionCount} ${replayUi('trading sessions', '거래일')}`;
}

function renderPathExplanation(
  horizon: 5 | 20,
  value: ReturnType<typeof outcomeAt>,
): string {
  if (value.pathCoverage !== 'COMPLETE'
    || value.absolute === undefined
    || value.mfe === undefined
    || value.mae === undefined) {
    const endpoint = value.absolute === undefined
      ? `${horizon}거래일 endpoint return도 이용할 수 없습니다.`
      : `${horizon}거래일 endpoint return ${percent(value.absolute)}은 존재합니다.`;
    return `${endpoint} 연속 경로 MFE/MAE는 ${renderSessionCoverage(value)}이므로 설명할 수 없습니다. 누락값은 0으로 채우거나 추정하지 않습니다.`;
  }
  return `최종적으로 ${percent(value.absolute)}였고, ${horizon}거래일 동안 daily high 기준 최고 ${percent(value.mfe)}, daily low 기준 최저 ${percent(value.mae)}였습니다. 일봉만으로 두 경로의 발생 순서는 알 수 없습니다.`;
}

function selectOptions(
  values: readonly string[],
  selected: string | undefined,
  labels: Readonly<Record<string, string>> = {},
): string {
  return values.map((value) => (
    `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value] ?? value.replace(/_/g, ' '))}</option>`
  )).join('');
}

function disabled(value: boolean): string {
  return value ? ' disabled' : '';
}

function checked(value: boolean): string {
  return value ? ' checked' : '';
}

function renderContext(episode: EventEpisode, cutoff: string): string {
  const context = contextKnownAt(episode.contextSnapshot, cutoff);
  const dailyBars = context.price.bars['1d'] ?? [];
  const latestTechnical = [...context.technical]
    .sort((left, right) => right.inputThrough.localeCompare(left.inputThrough))[0];
  const filings = context.filings.map((filing) => `
    <li><strong>${escapeHtml(filing.form)}</strong><span>${escapeHtml(filing.filingDate)}</span><small>${escapeHtml(filing.items.join(', ') || replayUi('Items unavailable', '공시 항목 없음'))}</small></li>
  `).join('');
  const world = context.world.map((item) => `
    <li><strong>${escapeHtml(item.category.replace(/_/g, ' '))}</strong><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.confidence)} · ${escapeHtml(item.linkReason)}</small></li>
  `).join('');
  const actions = context.corporateActions.map((item) => `
    <li><strong>${escapeHtml(item.type.replace(/_/g, ' '))}</strong><span>${escapeHtml(item.effectiveDate ?? item.announcedAt ?? replayUi('date unknown', '날짜 알 수 없음'))}</span><small>${escapeHtml(item.details)}</small></li>
  `).join('');
  const claims = context.socialClaims.map((item) => `
    <li><strong>${replayUi('CLAIM', '주장')} · ${escapeHtml(replayStatusLabel(item.status))}</strong><span>${escapeHtml(item.originalClaim)}</span><small>${escapeHtml(item.sourcePlatform)} · ${replayUi('not a market fact', '시장 사실로 확인되지 않음')}</small></li>
  `).join('');
  const missing = context.missingData.map((item) => `
    <li><strong>${escapeHtml(item.field)}</strong><span>${escapeHtml(replayStatusLabel(item.reason))}</span>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</li>
  `).join('');

  return `
    <section class="signal-lab-context" aria-labelledby="open-outcome-context-title">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-context-title">당시 정보</h3>
        <span>${replayUi('Point-in-time cutoff', '시점 기준')} ${escapeHtml(cutoff)}</span>
      </div>
      <div class="signal-lab-context-grid" data-context-cutoff="${escapeHtml(cutoff)}" data-filing-count="${context.filings.length}" data-world-count="${context.world.length}">
        <article data-context-kind="event"><h4>${replayUi('Event', '사건')}</h4><p>${escapeHtml(episode.detectionReason.join(' · '))}</p><small>${escapeHtml(episode.eventStart)} · ${escapeHtml(episode.marketSession)}</small></article>
        <article data-context-kind="price"><h4>${replayUi('Known price', '당시 확인 가격')}</h4><p>${dailyBars.length ? `${dailyBars.length}${replayUi(' daily bar(s)', '개 일봉')} · ${replayUi('last', '마지막')} ${dailyBars[dailyBars.length - 1]!.close.toFixed(2)}` : escapeHtml(mm('common.unknown'))}</p><small>${replayUi('Only bars completed and known at cutoff', '기준 시각까지 완료되어 알 수 있었던 봉만 표시')}</small></article>
        <article data-context-kind="market"><h4>${replayUi('Market', '시장')}</h4><p>SPY ${percent(context.market.benchmarks.SPY)} · QQQ ${percent(context.market.benchmarks.QQQ)} · IWM ${percent(context.market.benchmarks.IWM)}</p><small>${escapeHtml(context.market.regime ?? mm('common.unknown'))}</small></article>
        <article data-context-kind="sector"><h4>${replayUi('Sector', '섹터')}</h4><p>${escapeHtml(context.market.sectorEtf?.symbol ?? mm('common.unknown'))} ${percent(context.market.sectorEtf?.returnPercent)}</p><small>${replayUi('Unknown when no evidence-backed mapping exists', '근거 기반 연결이 없으면 알 수 없음')}</small></article>
        <article data-context-kind="technical"><h4>${replayUi('Technical', '기술 지표')}</h4><p>${replayUi('Return', '수익률')} ${percent(latestTechnical?.returnPercent)} · RVOL ${latestTechnical?.relativeVolume?.toFixed(2) ?? mm('common.unknown')} · RSI ${latestTechnical?.rsi?.toFixed(1) ?? mm('common.unknown')}</p><small>${escapeHtml(latestTechnical?.inputInterval ?? mm('common.unknown'))} ${replayUi('through', '기준')} ${escapeHtml(latestTechnical?.inputThrough ?? mm('common.unknown'))}</small></article>
        <article data-context-kind="filings"><h4>${replayUi('SEC filings', 'SEC 공시')}</h4><ul>${filings || `<li>${escapeHtml(mm('common.unknown'))}</li>`}</ul></article>
        <article data-context-kind="corporate-actions"><h4>${replayUi('Corporate actions', '기업행동')}</h4><ul>${actions || `<li>${replayUi('None known at cutoff', '기준 시각에 확인된 항목 없음')}</li>`}</ul></article>
        <article data-context-kind="world"><h4>${replayUi('News / world', '뉴스·세계')}</h4><ul>${world || `<li>${replayUi('None known at cutoff', '기준 시각에 확인된 항목 없음')}</li>`}</ul></article>
        <article class="signal-lab-claim" data-context-kind="social"><h4>${replayUi('Social claims', '소셜 주장')}</h4><ul>${claims || `<li>${replayUi('None known at cutoff', '기준 시각에 확인된 항목 없음')}</li>`}</ul></article>
      </div>
      <details class="signal-lab-missing" data-context-missing-count="${context.missingData.length}">
        <summary>당시 데이터 누락 ${context.missingData.length}건</summary>
        <ul>${missing || '<li>명시된 누락 없음</li>'}</ul>
      </details>
    </section>
  `;
}

function renderChart(episode: EventEpisode, replay: ReplayState): string {
  const cutoff = replay.cursorAt;
  const context = contextKnownAt(episode.contextSnapshot, cutoff);
  const beforeReveal = [...(context.price.bars['1d'] ?? [])]
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
  // The artifact intentionally keeps only the point-in-time reference bars in
  // ContextSnapshot. Reveal changes outcome metrics, never the replay context.
  const visible = beforeReveal;
  const chart = terminalChart(visible.map((bar) => bar.close), {
    width: 760,
    height: 180,
    formatValue: (value) => value.toFixed(2),
    ariaLabel: 'Historical daily replay chart',
  });
  const latest = visible[visible.length - 1];
  return `
    <section class="signal-lab-workbench" aria-labelledby="open-outcome-chart-title">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-chart-title">${escapeHtml(mm('replay.entryTitle'))}</h3>
        <span>${escapeHtml(mm(replay.revealed ? 'replay.outcomesRevealed' : 'replay.outcomesHidden'))}</span>
      </div>
      <div class="signal-lab-replay-chart"
        data-open-outcome-chart
        data-replay-state="${replay.revealed ? 'revealed' : 'hidden'}"
        data-future-hidden="${replay.revealed ? 'false' : 'true'}"
        data-chart-scope="pit-reference"
        data-visible-bars="${visible.length}"
        data-visible-through="${escapeHtml(latest?.endTime ?? '')}"
        data-replay-cutoff="${escapeHtml(cutoff)}">
        <div class="signal-lab-chart-meta">
          <span>1d · ${visible.length} visible bar(s)</span>
          <strong>${replay.revealed ? escapeHtml(mm('replay.outcomesRevealed')) : `${escapeHtml(mm('replay.sealed'))} ${escapeHtml(cutoff)}`}</strong>
        </div>
        ${chart || `<p class="ticker-360-unavailable">${latest ? `Known close ${escapeHtml(latest.close.toFixed(2))}` : 'No daily bar was knowable at the replay cutoff.'}</p>`}
      </div>
    </section>
  `;
}

function renderForecastForm(forecast: ForecastRecord | undefined, revealed: boolean): string {
  const sealed = Boolean(forecast);
  const prediction = forecast?.prediction;
  const selectedDecision = forecast?.decision;
  const horizon = prediction?.horizon.unit === 'TRADING_DAYS'
    ? String(prediction.horizon.value)
    : '5';
  const evidence = (items: readonly string[] | undefined): string => (
    escapeHtml(items?.join('\n') ?? '')
  );
  return `
    <section class="signal-lab-judgment" aria-labelledby="open-outcome-forecast-title">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-forecast-title">판단 기록·봉인</h3>
        <span>결과 공개 전에만 작성 가능</span>
      </div>
      <form class="signal-lab-forecast-form" data-open-outcome-forecast-form>
        <fieldset class="signal-lab-decision-fieldset"${disabled(sealed)}>
          <legend>${escapeHtml(mm('replay.decision'))}</legend>
          <div class="signal-lab-decision-options">
            ${FORECAST_DECISIONS.map((decision) => `
              <label><input type="radio" name="decision" value="${decision}" required${checked(decision === selectedDecision)}><span>${escapeHtml(mm(FORECAST_DECISION_LABEL_KEYS[decision]))}</span></label>
            `).join('')}
          </div>
        </fieldset>
        <div class="signal-lab-form-grid">
          <label><span>${escapeHtml(mm('replay.confidence'))}</span><span><input name="confidence" type="number" min="0" max="100" step="1" value="${forecast?.confidencePercent ?? 60}" required${disabled(sealed)}> %</span></label>
          <label><span>${escapeHtml(mm('replay.horizon'))}</span><select name="horizon" required${disabled(sealed)}>${selectOptions(['1', '5', '20'], horizon, document.documentElement.lang.toLowerCase().startsWith('ko') ? { 1: '1거래일', 5: '5거래일', 20: '20거래일' } : { 1: '1 trading day', 5: '5 trading days', 20: '20 trading days' })}</select></label>
          <label><span>${escapeHtml(mm('replay.metric'))}</span><select name="metric" required${disabled(sealed)}>${selectOptions(['ABSOLUTE_RETURN', 'MARKET_RELATIVE_RETURN', 'SECTOR_RELATIVE_RETURN'], prediction?.metric, { ABSOLUTE_RETURN: mm('replay.metric.absolute'), MARKET_RELATIVE_RETURN: mm('replay.metric.marketRelative'), SECTOR_RELATIVE_RETURN: mm('replay.metric.sectorRelative') })}</select></label>
          <label><span>${escapeHtml(mm('replay.operator'))}</span><select name="operator" required${disabled(sealed)}>${selectOptions(['AT_LEAST', 'AT_MOST'], prediction?.operator ?? 'AT_LEAST', { AT_LEAST: mm('replay.operator.atLeast'), AT_MOST: mm('replay.operator.atMost') })}</select></label>
          <label><span>${escapeHtml(mm('replay.threshold'))}</span><span><input name="threshold" type="number" min="-100" max="100" step="any" value="${prediction?.thresholdPercent ?? 5}" required${disabled(sealed)}> %</span></label>
          <label><span>${escapeHtml(mm('replay.probability'))}</span><span><input name="probability" type="number" min="0" max="100" step="1" value="${prediction?.probabilityPercent ?? 60}" required${disabled(sealed)}> %</span></label>
        </div>
        <label><span>${escapeHtml(mm('replay.thesis'))}</span><textarea name="thesis" maxlength="2000" rows="3" required${disabled(sealed)}>${escapeHtml(forecast?.thesis ?? '')}</textarea></label>
        <div class="signal-lab-evidence-grid">
          <label><span>${escapeHtml(mm('replay.bullishEvidence'))}</span><textarea name="bullishEvidence" maxlength="2000" rows="3" required${disabled(sealed)}>${evidence(forecast?.bullishEvidence)}</textarea></label>
          <label><span>${escapeHtml(mm('replay.bearishEvidence'))}</span><textarea name="bearishEvidence" maxlength="2000" rows="3" required${disabled(sealed)}>${evidence(forecast?.bearishEvidence)}</textarea></label>
        </div>
        <label><span>${escapeHtml(mm('replay.invalidation'))}</span><textarea name="invalidation" maxlength="1000" rows="2" required${disabled(sealed)}>${escapeHtml(forecast?.invalidation ?? '')}</textarea></label>
        <div class="signal-lab-form-actions">
          <button type="submit"${disabled(sealed)}>${escapeHtml(mm('replay.seal'))}</button>
          <button type="button" class="signal-lab-reveal" data-open-outcome-reveal${disabled(!sealed || revealed)}>${escapeHtml(mm(revealed ? 'replay.revealed' : 'replay.reveal'))}</button>
        </div>
      </form>
      <p class="signal-lab-seal-status" data-open-outcome-seal-status aria-live="polite">${sealed
        ? `${escapeHtml(mm('replay.sealed'))} · ${escapeHtml(forecast!.sealedAt)} · ${escapeHtml(decisionLabel(forecast!.decision))}`
        : escapeHtml(mm('replay.notSealed'))}</p>
    </section>
  `;
}

function renderOutcome(episode: EventEpisode, forecast: ForecastRecord): string {
  const outcome = episode.outcome!;
  const horizons = OUTCOME_TRADING_DAY_HORIZONS.map((horizon) => {
    const value = outcomeAt(outcome, horizon);
    const pathExplanation = horizon === 5 || horizon === 20
      ? `<p class="signal-lab-path-explanation" data-path-explanation="${horizon}">${escapeHtml(renderPathExplanation(horizon, value))}</p>`
      : '';
    return `
      <article class="signal-lab-horizon-result" data-outcome-horizon="${horizon}" data-outcome-coverage="${escapeHtml(value.coverage)}" data-path-coverage="${escapeHtml(value.pathCoverage)}" data-usable-sessions="${value.usableSessionCount ?? 'unknown'}" data-expected-sessions="${value.expectedSessionCount}">
        <h4>${horizon}거래일 결과</h4>
        <dl>
          <div><dt>${horizon}D ${replayUi('endpoint return', '종료 수익률')}</dt><dd>${availablePercent(value.absolute)}</dd></div>
          <div><dt>${horizon}D MFE</dt><dd>${availablePercent(value.mfe)}</dd></div>
          <div><dt>${horizon}D MAE</dt><dd>${availablePercent(value.mae)}</dd></div>
          <div><dt>${replayUi('Market-relative', '시장 대비')}</dt><dd>${escapeHtml(value.market ?? mm('common.unknown'))}</dd></div>
          <div><dt>${replayUi('Sector-relative', '섹터 대비')}</dt><dd>${escapeHtml(value.sector ?? mm('common.unknown'))}</dd></div>
          <div><dt>${replayUi('Path coverage', '경로 자료 범위')}</dt><dd>${renderSessionCoverage(value)}</dd></div>
          <div><dt>${replayUi('Data fields', '자료 필드')}</dt><dd>${value.missingCount}${replayUi(' unavailable', '개 없음')}</dd></div>
        </dl>
        ${pathExplanation}
      </article>
    `;
  }).join('');
  const missing = outcome.missingData.map((item) => `
    <li><strong>${escapeHtml(item.field)}</strong><span>${escapeHtml(replayStatusLabel(item.reason))}</span>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</li>
  `).join('');
  return `
    <section class="signal-lab-outcome" data-open-outcome-results data-result-state="revealed" aria-labelledby="open-outcome-result-title">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-result-title">실제 결과</h3>
        <span>${escapeHtml(replayStatusLabel(outcome.coverage))} · ${replayUi('labeled', '확정 시각')} ${escapeHtml(outcome.labeledAt)}</span>
      </div>
      <div class="signal-lab-my-decision" data-my-decision="${escapeHtml(forecast.decision ?? 'UNKNOWN')}">
        <strong>${escapeHtml(decisionLabel(forecast.decision))} · ${replayUi('confidence', '확신도')} ${forecast.confidencePercent ?? mm('common.unknown')}%</strong>
        <p>${escapeHtml(forecast.thesis ?? replayUi('Thesis unavailable', '판단 근거 없음'))}</p>
        <small>${escapeHtml(forecast.question)}</small>
      </div>
      <div class="signal-lab-horizon-grid">${horizons}</div>
      <p data-barrier-ordering><strong>${replayUi('Daily +5% / -3% ordering', '일봉 +5% / -3% 도달 순서')}:</strong> ${escapeHtml(replayStatusLabel(outcome.barrierOrdering))} · ${escapeHtml(replayStatusLabel(outcome.barrierOrderingStatus))}</p>
      <details class="signal-lab-missing" data-outcome-missing-count="${outcome.missingData.length}">
        <summary>${replayUi('Outcome missing data', '결과 자료 누락')} ${outcome.missingData.length}${replayUi('', '건')}</summary>
        <ul>${missing || '<li>명시된 누락 없음</li>'}</ul>
      </details>
    </section>
  `;
}

function renderReview(review: ReviewRecord | undefined): string {
  const saved = Boolean(review);
  const selectedError = review?.errorClasses[0];
  const verdictPlaceholder = `<option value="" disabled${review?.verdict ? '' : ' selected'}>${replayUi('Select a verdict', '판정을 선택하세요')}</option>`;
  return `
    <section class="signal-lab-review" aria-labelledby="open-outcome-review-title" data-review-state="${saved ? 'saved' : 'unrecorded'}">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-review-title">${replayUi('Decision review', '판단 결과 복기')}</h3>
        <span>${replayUi('Decision quality and outcome quality are separate', '판단의 질과 결과의 질은 별개입니다')}</span>
      </div>
      <form data-open-outcome-review-form>
        <div class="signal-lab-form-grid">
          <label><span>${replayUi('Verdict', '판정')}</span><select name="verdict" required${disabled(saved)}>${verdictPlaceholder}${selectOptions(REVIEW_VERDICTS, review?.verdict, {
            GOOD_DECISION_BAD_OUTCOME: '좋은 판단 + 나쁜 결과',
            BAD_DECISION_GOOD_OUTCOME: '나쁜 판단 + 좋은 결과',
            GOOD_DECISION_GOOD_OUTCOME: '좋은 판단 + 좋은 결과',
            BAD_DECISION_BAD_OUTCOME: '나쁜 판단 + 나쁜 결과',
            INDETERMINATE: '판단 불가',
          })}</select></label>
          <label><span>${escapeHtml(mm('replay.reviewError'))}</span><select name="errorClass"${disabled(saved)}><option value="">${escapeHtml(mm('replay.none'))}</option>${selectOptions(REVIEW_ERROR_CLASSES, selectedError, Object.fromEntries(REVIEW_ERROR_CLASSES.map((value) => [value, mm(REVIEW_ERROR_LABEL_KEYS[value])])))}</select></label>
          <label><span>${replayUi('Daily path assessment (optional)', '일봉 경로 평가 (선택)')}</span><select name="pathAssessment" data-review-path-assessment${disabled(saved)}><option value="">${replayUi('Not assessed', '평가하지 않음')}</option>${selectOptions(REVIEW_PATH_ASSESSMENTS, review?.pathAssessment, {
            PATH_ACCEPTABLE: '경로 허용 가능',
            DIRECTION_RIGHT_DRAWDOWN_INTOLERABLE: '방향은 맞았지만 drawdown 감당 불가',
            DIRECTION_WRONG_EARLY_MFE_OPPORTUNITY: '방향은 틀렸지만 초기 MFE 기회 존재',
            STOP_TOO_TIGHT: '손절 기준이 너무 타이트함',
            TARGET_BELOW_REALIZED_MFE: '목표가 실제 MFE보다 낮음',
            INDETERMINATE: '경로 판단 불가',
          })}</select></label>
        </div>
        <label><span>왜 맞았거나 틀렸는가</span><textarea name="reviewNotes" maxlength="4000" rows="4" required${disabled(saved)}>${escapeHtml(review?.notes ?? '')}</textarea></label>
        <label><span>${replayUi('Hypotheses to test next · one per line', '다음에 검증할 가설 · 한 줄에 하나')}</span><textarea name="hypotheses" maxlength="2000" rows="3"${disabled(saved)}>${escapeHtml(review?.proposedHypotheses.join('\n') ?? '')}</textarea></label>
        <button type="submit"${disabled(saved)}>${replayUi('Save review', '복기 저장')}</button>
      </form>
      <p class="signal-lab-seal-status" data-open-outcome-review-status aria-live="polite">${saved
        ? `복기 저장됨 · ${escapeHtml(review!.reviewedAt)} · ${escapeHtml(review!.verdict ?? 'INDETERMINATE')} · path ${escapeHtml(review!.pathAssessment ?? 'NOT_ASSESSED')}`
        : '아직 복기를 기록하지 않았습니다.'}</p>
    </section>
  `;
}

function renderSimilar(
  episode: EventEpisode,
  episodes: readonly EventEpisode[],
  limit: number,
  minimumSampleSize: number,
): string {
  const evaluation = evaluateOpenOutcomeSimilarity(episode, episodes, limit);
  const ranked = evaluation.ranked;
  const stats = summarizeOpenOutcomeEpisodes(
    ranked.map((item) => item.episode),
    minimumSampleSize,
    evaluation,
  );
  const rows = ranked.map((item) => {
    const one = outcomeAt(item.outcome, 1);
    const five = outcomeAt(item.outcome, 5);
    const twenty = outcomeAt(item.outcome, 20);
    return `
      <tr data-similar-episode-id="${escapeHtml(item.episode.episodeId)}">
        <td>${escapeHtml(item.episode.eventStart.slice(0, 10))}</td>
        <td>${escapeHtml(item.episode.tickerAtEventTime)}</td>
        <td>${escapeHtml(item.episode.detectionReason.join(' · '))}</td>
        <td>${plainPercent(item.similarity * 100)}</td>
        <td>${item.matchedFeatureCount}</td>
        <td>${percent(one.absolute)}</td>
        <td>${percent(five.absolute)}</td>
        <td>${percent(twenty.absolute)}</td>
      </tr>
    `;
  }).join('');
  return `
    <section class="signal-lab-similar" data-open-outcome-similar data-similar-state="${stats.status}" aria-labelledby="open-outcome-similar-title">
      <div class="ticker-360-section-head">
        <h3 id="open-outcome-similar-title">비슷한 과거 사건의 실제 결과</h3>
        <span>${replayUi('Status', '상태')}: ${escapeHtml(replayStatusLabel(stats.status))}</span>
      </div>
      <div class="signal-lab-similarity-trust" data-eligible-similar-events="${stats.eligibleSampleCount}" data-excluded-family-mismatch="${stats.excludedFamilyMismatch}" data-excluded-no-matched-feature="${stats.excludedNoMatchedFeature}">
        <span>${replayUi('Eligible similar events', '사용 가능한 유사 사건')}: <strong>${stats.eligibleSampleCount}</strong></span>
        <span>${replayUi('Minimum required', '최소 필요 표본')}: <strong>${stats.minimumSampleSize}</strong></span>
        <span>${replayUi('Matched family', '일치 사건 유형')}: <strong>${escapeHtml(stats.matchedEventFamily ?? mm('common.unknown'))}</strong></span>
        <span>${replayUi('Status', '상태')}: <strong>${escapeHtml(replayStatusLabel(stats.status))}</strong></span>
        <small>${replayUi('Excluded', '제외')}: ${replayUi('family mismatch', '사건 유형 불일치')} ${stats.excludedFamilyMismatch} · ${replayUi('no matched feature', '일치 특징 없음')} ${stats.excludedNoMatchedFeature}</small>
      </div>
      <div class="signal-lab-stats" data-similar-sample-size="${stats.sampleSize}" data-similar-outcome-size="${stats.outcomeSampleSize}">
        <span>next-day positive <strong>${statisticPercent(stats.nextDayPositivePercent, 'plain')}</strong> · n ${stats.usableSampleSize.nextDayReturn}</span>
        <span>median next-day <strong>${statisticPercent(stats.medianNextDayReturnPercent, 'signed')}</strong> · n ${stats.usableSampleSize.nextDayReturn}</span>
        <span>median 5-day <strong>${statisticPercent(stats.median5DayReturnPercent, 'signed')}</strong> · n ${stats.usableSampleSize.fiveDayReturn}</span>
        <span>median 20-day <strong>${statisticPercent(stats.median20DayReturnPercent, 'signed')}</strong> · n ${stats.usableSampleSize.twentyDayReturn}</span>
        <span>median 5-day MFE <strong>${statisticPercent(stats.median5DayMfePercent, 'signed')}</strong> · n ${stats.usableSampleSize.fiveDayMfe}</span>
        <span>median 5-day MAE <strong>${statisticPercent(stats.median5DayMaePercent, 'signed')}</strong> · n ${stats.usableSampleSize.fiveDayMae}</span>
        <span>median 20-day MFE <strong>${statisticPercent(stats.median20DayMfePercent, 'signed')}</strong> · n ${stats.usableSampleSize.twentyDayMfe}</span>
        <span>median 20-day MAE <strong>${statisticPercent(stats.median20DayMaePercent, 'signed')}</strong> · n ${stats.usableSampleSize.twentyDayMae}</span>
        <span>${replayUi('missing', '누락')} <strong>${stats.missingDataCount}</strong></span>
      </div>
      ${stats.status === 'INSUFFICIENT_SAMPLE'
        ? `<p class="signal-lab-disclosure">${escapeHtml(replayStatusLabel(stats.status))} · eligibility 조건을 통과한 유사 사건 ${stats.eligibleSampleCount}건으로 비율을 과장하지 않습니다. 최소 ${stats.minimumSampleSize}건이 필요합니다.</p>`
        : ''}
      <div class="signal-lab-table-scroll"><table>
        <thead><tr><th>${replayUi('Date', '날짜')}</th><th>${replayUi('Ticker', '종목')}</th><th>${replayUi('Event', '사건')}</th><th>${replayUi('Similarity', '유사도')}</th><th>${replayUi('Features', '특징')}</th><th>1d</th><th>5d</th><th>20d</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">비교 가능한 과거 사건이 없습니다.</td></tr>'}</tbody>
      </table></div>
    </section>
  `;
}

/**
 * Render a historical-event decision loop. Before reveal, the DOM contains no
 * outcome values or similar-event statistics, and all context passes through
 * the point-in-time selector.
 */
export function renderOpenOutcomeReplay(
  host: HTMLElement,
  options: OpenOutcomeReplayOptions,
): OpenOutcomeReplayController {
  activeControllers.get(host)?.destroy();
  const episodes = options.episodes.filter((episode) => episode.outcome !== undefined);
  const persistence: SignalLabPersistence = createSignalLabPersistence(
    options.storage === undefined ? undefined : options.storage,
  );
  const now = options.now ?? (() => new Date().toISOString());
  const similarityLimit = options.similarityLimit ?? 20;
  const minimumSimilarSampleSize = options.minimumSimilarSampleSize ?? 10;
  let selectedEpisodeId = episodes.some((episode) => episode.episodeId === options.defaultEpisodeId)
    ? options.defaultEpisodeId!
    : options.defaultEpisodeId === null
      ? undefined
      : episodes[0]?.episodeId;
  let replay: ReplayState | undefined;
  let review: ReviewRecord | undefined;
  let persistenceMessage = '';

  const hydrate = (): void => {
    const episode = episodes.find((item) => item.episodeId === selectedEpisodeId);
    if (!episode) {
      replay = undefined;
      review = undefined;
      return;
    }
    replay = createReplayState(episode.episodeId, replayCutoff(episode));
    const storedForecast = persistence.getForecast(episode.episodeId);
    if (storedForecast) {
      try {
        replay = sealReplayForecast(replay, storedForecast);
        if (persistence.isOutcomeRevealed(episode.episodeId)) {
          replay = revealReplayOutcome(replay);
        }
      } catch {
        replay = createReplayState(episode.episodeId, replayCutoff(episode));
      }
    }
    review = replay.forecast ? persistence.getReview(replay.forecast.forecastId) : undefined;
  };

  const render = (): void => {
    const episode = episodes.find((item) => item.episodeId === selectedEpisodeId);
    const researchSymbol = options.researchSymbol?.trim().toUpperCase() || mm('common.unknown');
    const optionsHtml = episodes.map((item) => `
      <option value="${escapeHtml(item.episodeId)}" data-episode-search-text="${escapeHtml(`${item.tickerAtEventTime} ${item.detectionReason.join(' ')}`.toLocaleLowerCase())}"${item.episodeId === episode?.episodeId ? ' selected' : ''}>${escapeHtml(item.eventStart.slice(0, 10))} · ${escapeHtml(item.tickerAtEventTime)} · ${escapeHtml(item.detectionReason[0] ?? 'Event')}</option>
    `).join('');
    host.classList.add('signal-lab-root', 'open-outcome-replay');
    host.dataset.openOutcomeReplay = 'true';
    host.dataset.generatedAt = options.generatedAt;
    if (!episode || !replay) {
      delete host.dataset.episodeId;
      delete host.dataset.forecastState;
      delete host.dataset.reviewState;
      host.dataset.replayState = episodes.length ? 'unselected' : 'unavailable';
      setTrustedHtml(host, trustedHtml(`
        <div class="signal-lab-heading"><div><p class="stock-research-kicker">OPEN-OUTCOME-1 · DAILY-PATH</p><h2>${escapeHtml(mm('replay.title'))}</h2></div></div>
        ${episodes.length ? `
          <p class="signal-lab-disclosure" data-replay-symbol-relation="NO_MATCH">${escapeHtml(mm('replay.researchSymbol'))} ${escapeHtml(researchSymbol)} · ${escapeHtml(mm('replay.eventSymbol'))} ${escapeHtml(mm('replay.none'))} · ${escapeHtml(mm('replay.noMatchingEvent'))}</p>
          <div class="signal-lab-episode-picker">
            <label for="open-outcome-episode-search">${escapeHtml(mm('replay.search'))}</label>
            <div class="signal-lab-episode-filter">
              <input id="open-outcome-episode-search" type="search" data-open-outcome-episode-search aria-controls="open-outcome-episode-select" autocomplete="off" placeholder="${escapeHtml(mm('replay.searchPlaceholder'))}">
              <span data-open-outcome-filter-status aria-live="polite">${episodes.length}/${episodes.length} ${escapeHtml(mm('replay.matchingEvents'))}</span>
            </div>
            <label for="open-outcome-episode-select">${escapeHtml(mm('replay.selectEvent'))}</label>
            <select id="open-outcome-episode-select" data-open-outcome-episode-select>
              <option value="" selected disabled>현재 research symbol과 일치하는 사건 없음</option>
              ${optionsHtml}
            </select>
            <p class="signal-lab-episode-empty" data-open-outcome-episode-empty hidden>${escapeHtml(mm('replay.noMatch'))}</p>
          </div>
        ` : '<p class="ticker-360-unavailable">실제 outcome label이 있는 EventEpisode가 없습니다.</p>'}
      `, 'OPEN-OUTCOME empty state contains only static text'));
      return;
    }
    const forecast = replay.forecast;
    host.dataset.episodeId = episode.episodeId;
    host.dataset.forecastState = forecast ? 'sealed' : 'unsealed';
    host.dataset.replayState = replay.revealed ? 'revealed' : 'hidden';
    host.dataset.reviewState = review ? 'saved' : 'unrecorded';
    const symbolRelation = researchSymbol === episode.tickerAtEventTime.toUpperCase()
      ? 'SYMBOL MATCH'
      : 'DIFFERENT SYMBOL';
    const sourceLabel = options.sourceIds.length
      ? options.sourceIds.join(', ')
      : 'source registry unavailable';
    const revealSections = replay.revealed && forecast
      ? `${renderOutcome(episode, forecast)}${renderReview(review)}${renderSimilar(episode, episodes, similarityLimit, minimumSimilarSampleSize)}`
      : '<div data-open-outcome-results data-result-state="hidden" hidden></div><section data-open-outcome-similar data-similar-state="hidden" hidden></section>';
    setTrustedHtml(host, trustedHtml(`
      <div class="signal-lab-heading">
        <div><p class="stock-research-kicker">OPEN-OUTCOME-1 · DAILY-PATH</p><h2>${escapeHtml(mm('replay.title'))}</h2></div>
        <span class="signal-lab-fixture-label" data-signal-lab-source="public-history">${escapeHtml(mm('replay.publicData'))}</span>
      </div>
      <p class="signal-lab-disclosure">당시 cutoff 이후의 가격·공시·뉴스는 판단 봉인과 결과 공개 전까지 표시하지 않습니다. 자동 매수·매도 결정은 하지 않습니다.</p>
      <p class="signal-lab-disclosure" data-replay-symbol-relation="${symbolRelation.replace(' ', '_')}">${escapeHtml(mm('replay.researchSymbol'))} ${escapeHtml(researchSymbol)} · ${escapeHtml(mm('replay.eventSymbol'))} ${escapeHtml(episode.tickerAtEventTime)} · ${escapeHtml(mm('replay.eventDate'))} ${escapeHtml(episode.eventStart.slice(0, 10))} · ${escapeHtml(mm(symbolRelation === 'SYMBOL MATCH' ? 'replay.symbolMatch' : 'replay.differentSymbol'))}</p>
      <div class="signal-lab-episode-picker">
        <label for="open-outcome-episode-search">${escapeHtml(mm('replay.search'))}</label>
        <div class="signal-lab-episode-filter">
          <input id="open-outcome-episode-search" type="search" data-open-outcome-episode-search aria-controls="open-outcome-episode-select" autocomplete="off" placeholder="${escapeHtml(mm('replay.searchPlaceholder'))}">
          <span data-open-outcome-filter-status aria-live="polite">${episodes.length}/${episodes.length} ${escapeHtml(mm('replay.matchingEvents'))}</span>
        </div>
        <label for="open-outcome-episode-select">${escapeHtml(mm('replay.selectEvent'))}</label>
        <select id="open-outcome-episode-select" data-open-outcome-episode-select>${optionsHtml}</select>
        <p class="signal-lab-episode-empty" data-open-outcome-episode-empty hidden>${escapeHtml(mm('replay.noMatch'))}</p>
        <small>${escapeHtml(sourceLabel)} · ${escapeHtml(mm('replay.generated'))} ${escapeHtml(options.generatedAt)}</small>
      </div>
      ${renderChart(episode, replay)}
      ${renderContext(episode, replay.cursorAt)}
      ${renderForecastForm(forecast, replay.revealed)}
      ${persistenceMessage ? `<p class="signal-lab-missing" data-persistence-message>${escapeHtml(persistenceMessage)}</p>` : ''}
      ${revealSections}
    `, 'OPEN-OUTCOME renders escaped public artifacts and finite chart values only'));
    const selector = host.querySelector('[data-open-outcome-episode-select]');
    if (selector instanceof HTMLSelectElement) selector.value = episode.episodeId;
    const pathAssessmentSelector = host.querySelector('[data-review-path-assessment]');
    if (pathAssessmentSelector instanceof HTMLSelectElement && review?.pathAssessment) {
      pathAssessmentSelector.value = review.pathAssessment;
    }
  };

  const onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)
      || !target.matches('[data-open-outcome-episode-select]')) return;
    if (!episodes.some((episode) => episode.episodeId === target.value)) return;
    selectedEpisodeId = target.value;
    persistenceMessage = '';
    hydrate();
    render();
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)
      || !target.matches('[data-open-outcome-episode-search]')) return;
    const query = target.value.trim().toLocaleLowerCase();
    const selector = host.querySelector('[data-open-outcome-episode-select]');
    if (!(selector instanceof HTMLSelectElement)) return;
    let matchCount = 0;
    for (const option of selector.options) {
      if (!option.value) {
        option.hidden = Boolean(query);
        continue;
      }
      const matches = !query || (option.dataset.episodeSearchText ?? '').includes(query);
      option.hidden = !matches;
      matchCount += matches ? 1 : 0;
    }
    const status = host.querySelector('[data-open-outcome-filter-status]');
    if (status) status.textContent = `${matchCount}/${episodes.length} ${mm('replay.matchingEvents')}`;
    const empty = host.querySelector('[data-open-outcome-episode-empty]');
    if (empty instanceof HTMLElement) empty.hidden = matchCount !== 0;
  };

  const onSubmit = (event: SubmitEvent): void => {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== 'FORM') return;
    const episode = episodes.find((item) => item.episodeId === selectedEpisodeId);
    if (!episode || !replay) return;

    if (form.matches('[data-open-outcome-forecast-form]')) {
      event.preventDefault();
      if (replay.forecast || !form.reportValidity()) return;
      const data = new FormData(form);
      const decision = textValue(data, 'decision') as ForecastDecision;
      const confidencePercent = numberValue(data, 'confidence');
      const horizon = numberValue(data, 'horizon') as OutcomeHorizonTradingDays;
      const metric = textValue(data, 'metric') as ForecastMetric;
      const operator = textValue(data, 'operator') as ForecastPrediction['operator'];
      const thresholdPercent = numberValue(data, 'threshold');
      const probabilityPercent = numberValue(data, 'probability');
      if (!FORECAST_DECISIONS.includes(decision)
        || !OUTCOME_TRADING_DAY_HORIZONS.includes(horizon)
        || !['ABSOLUTE_RETURN', 'MARKET_RELATIVE_RETURN', 'SECTOR_RELATIVE_RETURN'].includes(metric)
        || !['AT_LEAST', 'AT_MOST'].includes(operator)) return;
      const context = contextKnownAt(episode.contextSnapshot, replay.cursorAt);
      const sealedAt = now();
      const forecast: ForecastRecord = {
        forecastId: `${episode.episodeId}:forecast:${sealedAt}`,
        episodeId: episode.episodeId,
        forecastAt: replay.cursorAt,
        predictionHorizonMinutes: horizon * 390,
        question: `${horizon} trading-day ${metric} ${operator} ${thresholdPercent}%`,
        probability: probabilityPercent / 100,
        bullishEvidence: lines(data.get('bullishEvidence')),
        bearishEvidence: lines(data.get('bearishEvidence')),
        missingInformation: context.missingData.map((item) => item.field),
        abstain: false,
        modelVersion: 'human-open-outcome-0',
        promptVersion: 'structured-forecast/v1',
        similarEpisodeCount: 0,
        sealedAt,
        decision,
        confidencePercent,
        thesis: textValue(data, 'thesis'),
        invalidation: textValue(data, 'invalidation'),
        prediction: {
          horizon: { unit: 'TRADING_DAYS', value: horizon },
          metric,
          operator,
          thresholdPercent,
          probabilityPercent,
        },
      };
      try {
        replay = sealReplayForecast(replay, forecast);
      } catch (error) {
        persistenceMessage = error instanceof Error ? error.message : '판단을 봉인하지 못했습니다.';
        render();
        return;
      }
      const saved = persistence.saveForecast(forecast);
      persistenceMessage = saved
        ? 'ForecastRecord가 이 브라우저에 저장되었습니다.'
        : 'ForecastRecord를 현재 세션에서만 유지합니다. 브라우저 저장소를 사용할 수 없습니다.';
      render();
      return;
    }

    if (form.matches('[data-open-outcome-review-form]')) {
      event.preventDefault();
      if (!replay.revealed || !replay.forecast || review || !episode.outcome || !form.reportValidity()) return;
      const data = new FormData(form);
      const verdict = textValue(data, 'verdict') as NonNullable<ReviewRecord['verdict']>;
      const errorClass = textValue(data, 'errorClass') as ReviewErrorClass | '';
      const pathAssessment = textValue(data, 'pathAssessment') as NonNullable<ReviewRecord['pathAssessment']> | '';
      if (!REVIEW_VERDICTS.includes(verdict)
        || (errorClass && !REVIEW_ERROR_CLASSES.includes(errorClass))
        || (pathAssessment && !REVIEW_PATH_ASSESSMENTS.includes(pathAssessment))) return;
      const reviewedAt = now();
      const record: ReviewRecord = {
        reviewId: `${replay.forecast.forecastId}:review`,
        forecastId: replay.forecast.forecastId,
        reviewedAt,
        outcome: episode.outcome,
        errorClasses: errorClass ? [errorClass] : [],
        notes: textValue(data, 'reviewNotes'),
        proposedHypotheses: lines(data.get('hypotheses')),
        verdict,
        ...(pathAssessment ? { pathAssessment } : {}),
      };
      review = record;
      const saved = persistence.saveReview(record);
      persistenceMessage = saved
        ? 'ReviewRecord가 이 브라우저에 저장되었습니다.'
        : 'ReviewRecord를 현재 세션에서만 유지합니다. 브라우저 저장소를 사용할 수 없습니다.';
      render();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-open-outcome-reveal]');
    if (!(button instanceof HTMLButtonElement) || !host.contains(button)) return;
    const episode = episodes.find((item) => item.episodeId === selectedEpisodeId);
    if (!episode?.outcome || !replay?.forecast) return;
    const forecast = replay.forecast;
    replay = revealReplayOutcome(replay);
    const saved = persistence.markOutcomeRevealed(
      episode.episodeId,
      forecast.forecastId,
      now(),
    );
    persistenceMessage = saved
      ? '결과 공개 상태가 저장되었습니다.'
      : '결과 공개 상태를 현재 세션에서만 유지합니다.';
    render();
  };

  host.addEventListener('change', onChange);
  host.addEventListener('input', onInput);
  host.addEventListener('submit', onSubmit);
  host.addEventListener('click', onClick);
  hydrate();
  render();

  const controller: OpenOutcomeReplayController = {
    destroy() {
      host.removeEventListener('change', onChange);
      host.removeEventListener('input', onInput);
      host.removeEventListener('submit', onSubmit);
      host.removeEventListener('click', onClick);
      if (activeControllers.get(host) === controller) activeControllers.delete(host);
    },
    selectEpisode(episodeId) {
      if (!episodes.some((episode) => episode.episodeId === episodeId)) return false;
      selectedEpisodeId = episodeId;
      persistenceMessage = '';
      hydrate();
      render();
      return true;
    },
    getSelectedEpisodeId() {
      return selectedEpisodeId;
    },
  };
  activeControllers.set(host, controller);
  return controller;
}
