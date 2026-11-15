import { intelligenceTitle, intelligenceSummary, INTELLIGENCE_TOPIC_LABELS, type ExecutiveIntelligence, type IntelligenceRelationship, type RankedIntelligence } from './executive-intelligence-model.ts';
import type { BriefingEntry } from './situation-synthesis-model.ts';

function add(parent: HTMLElement, tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}
function link(parent: HTMLElement, text: string, href: string): void {
  try {
    const url = new URL(href, window.location.origin);
    if (!['https:', 'http:'].includes(url.protocol)) { add(parent, 'span', '', text); return; }
    const anchor = add(parent, 'a', '', text) as HTMLAnchorElement;
    anchor.href = href;
    if (url.origin !== window.location.origin) { anchor.target = '_blank'; anchor.rel = 'noreferrer'; }
  } catch { add(parent, 'span', '', text); }
}
function references(parent: HTMLElement, title: string, entries: readonly BriefingEntry[], empty: string): void {
  add(parent, 'strong', '', title);
  if (!entries.length) { add(parent, 'p', '', empty); return; }
  const list = add(parent, 'ul', 'executive-evidence');
  entries.slice(0, 5).forEach((entry) => {
    const row = add(list, 'li', '');
    link(row, intelligenceTitle(entry), entry.deepLink);
    add(row, 'small', '', ` · ${entry.observedAt ?? '시각 미확인'} · ${entry.source?.label?.split(' · ')[0]?.slice(0, 28) ?? '출처 미확인'}`);
  });
}
function counterEvidenceDescription(entry: BriefingEntry): string {
  const metric = entry.context?.metric;
  const value = metric?.value ? ` ${metric.value}` : '';
  const change = typeof metric?.changePercent === 'number' && Number.isFinite(metric.changePercent)
    ? ` (${metric.changePercent > 0 ? '+' : ''}${metric.changePercent.toFixed(2)}%)` : '';
  const explanation = entry.signals.includes('VOLATILITY_DOWN')
    ? '변동성 완화 방향으로 위험 확대 가설을 약화'
    : entry.signals.includes('VOLATILITY_UP')
      ? '변동성 상승 방향으로 위험 선호 가설을 약화'
      : entry.signals.includes('MARKET_UP')
        ? '가격 상승 방향으로 시장 약세 가설을 완화'
        : entry.signals.includes('MARKET_DOWN')
          ? '가격 하락 방향으로 시장 강세 가설을 약화'
          : entry.signals.includes('ENERGY_PRICE_DOWN')
            ? '에너지 가격 하락 방향으로 공급 충격 가설을 완화'
            : entry.signals.includes('ENERGY_PRICE_UP')
              ? '에너지 가격 상승 방향으로 공급 안정 가설을 약화'
              : '현재 가설과 충돌하는 별도 근거';
  return `${intelligenceTitle(entry)}${value}${change} · ${explanation}`;
}
function counterReferences(parent: HTMLElement, entries: readonly BriefingEntry[], empty: string): void {
  add(parent, 'strong', '', '현재 반대 근거');
  if (!entries.length) { add(parent, 'p', '', empty); return; }
  const list = add(parent, 'ul', 'executive-evidence');
  entries.slice(0, 5).forEach((entry) => {
    const row = add(list, 'li', '');
    link(row, counterEvidenceDescription(entry), entry.deepLink);
  });
}

const ACTION_LABELS: Readonly<Record<RankedIntelligence['decisionSupport']['status'], string>> = {
  WATCH: '관찰',
  INVESTIGATE: '추가 조사',
  WAIT_FOR_CONFIRMATION: '확인 대기',
  RISK_REDUCE_CANDIDATE: '위험 축소 검토 후보',
  OPPORTUNITY_CANDIDATE: '기회 검토 후보',
  NO_ACTION: '현재 행동 없음',
};

const RELATIONSHIP_LABELS: Readonly<Record<IntelligenceRelationship['type'], string>> = {
  OBSERVED: '직접 연결 관측',
  SUPPORTED_HYPOTHESIS: '근거 있는 연결 가설',
  CANDIDATE: '확인 전 연결 후보',
  COUNTER_SIGNAL: '반대 방향 신호',
};

function marketConfirmationLabel(item: RankedIntelligence): string {
  if (item.marketConfirmation === 'CONFIRMED') return '시장 확인 있음';
  if (item.marketConfirmation === 'NOT_CONFIRMED') return '시장 확인 안 됨';
  return item.entry.category === 'MARKET' ? '시장 직접 관측' : '시장 확인 대상 아님';
}

function formatObservation(value: string | null): string {
  if (!value) return '시각 미확인';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(parsed));
}
function originalAccess(parent: HTMLElement, entry: BriefingEntry): void {
  const href = /^https?:/.test(entry.deepLink) ? entry.deepLink : entry.source?.href;
  if (!href) return;
  const access = add(parent, 'div', 'executive-source-access');
  link(access, '원문 보기', href);
  if (entry.originalTitle && entry.originalTitle !== entry.title) {
    const original = add(access, 'details', 'executive-original');
    original.dataset.executiveDisclosure = `original:${parent.closest('[data-world-hotspots]') ? 'hotspots' : 'priorities'}:${entry.id}`;
    add(original, 'summary', '', '원문 펼치기');
    add(original, 'p', '', entry.originalTitle);
    if (entry.originalSummary) add(original, 'p', '', entry.originalSummary);
  }
}
function rankedItem(parent: HTMLElement, item: RankedIntelligence, index: number, relationships: readonly IntelligenceRelationship[]): void {
  const row = add(parent, 'article', 'executive-item');
  row.dataset.intelligenceId = item.entry.id;
  const details = add(row, 'details', 'executive-ranked') as HTMLDetailsElement;
  details.dataset.executiveDisclosure = `rank:${parent.closest('[data-world-hotspots]') ? 'hotspots' : 'priorities'}:${item.entry.id}`;
  const summary = add(details, 'summary', '');
  add(summary, 'span', 'executive-ranked__number', String(index + 1).padStart(2, '0'));
  const copy = add(summary, 'span', 'executive-ranked__copy');
  const change = item.entry.context?.metric?.changePercent;
  const changeLabel = typeof change === 'number' && Number.isFinite(change) ? ` · ${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '';
  add(copy, 'strong', '', `${intelligenceTitle(item.entry)}${changeLabel}`);
  add(copy, 'small', '', item.topics.map((topic) => INTELLIGENCE_TOPIC_LABELS[topic]).join(' · '));
  add(copy, 'small', 'executive-ranked__meta', `신뢰 ${item.confidence} · ${formatObservation(item.entry.observedAt)} · 근거 ${item.evidenceCount}개/${item.sourceCount}개 출처 · ${marketConfirmationLabel(item)}`);
  const body = add(details, 'div', 'executive-ranked__body');
  add(body, 'strong', '', '무엇이 변했나');
  add(body, 'p', '', intelligenceSummary(item.entry));
  if (item.entry.context?.translation?.status === 'UNAVAILABLE') {
    const reason = item.entry.context.translation.reason;
    add(body, 'p', '', reason === 'BATCH_DEFERRED' ? '번역 상태 · 이번 자동 처리 한도에 도달'
      : reason === 'BUDGET_EXHAUSTED' ? '번역 상태 · 오늘의 처리 예산 소진'
      : reason === 'VALIDATION_REJECTED' ? '번역 검증 실패 · 원문 보존' : '번역 상태 · 서버 공급자의 설정 또는 응답 확인 필요');
  }
  add(body, 'strong', '', '왜 중요한가');
  add(body, 'p', '', `${item.entry.importanceReason} · ${item.rankingReason}`);
  add(body, 'p', 'executive-market-confirmation', marketConfirmationLabel(item));
  references(body, '확인된 근거', item.supporting, '없음');
  counterReferences(body, item.counter, '현재 수집 범위에서 상충 신호 미확인 · 이는 가설 확정을 뜻하지 않습니다.');
  const relation = relationships.find((candidate) => candidate.source.id === item.entry.id);
  if (relation) {
    add(body, 'p', '', `${RELATIONSHIP_LABELS[relation.type]} · ${relation.summary}`);
    add(body, 'p', '', `다음 확인 · ${relation.whatToCheckNext}`);
  }
  const decision = add(body, 'section', 'executive-decision-support');
  add(decision, 'strong', '', `판단 보조 · ${ACTION_LABELS[item.decisionSupport.status]}`);
  add(decision, 'p', '', `이유 · ${item.decisionSupport.because}`);
  add(decision, 'p', '', `반대 근거 · ${item.decisionSupport.counterEvidence}`);
  add(decision, 'p', '', `확인 필요 · ${item.decisionSupport.confirmationNeeded}`);
  add(decision, 'p', '', `무효화 조건 · ${item.decisionSupport.invalidationCondition}`);
  add(body, 'p', '', `한계 · ${item.entry.details.uncertainty}`);
  originalAccess(row, item.entry);
}

export function renderExecutiveHeader(parent: HTMLElement, model: ExecutiveIntelligence): void {
  const section = add(parent, 'section', 'executive-now situation-synthesis');
  section.dataset.synthesisSummary = '';
  add(section, 'h2', '', '오늘의 판단');
  add(section, 'p', 'situation-synthesis__one-line', model.headline);
  const mobileSnapshot = add(section, 'section', 'executive-mobile-snapshot');
  mobileSnapshot.dataset.mobileDecisionSnapshot = '';
  add(mobileSnapshot, 'h3', '', '30초 판단');
  add(mobileSnapshot, 'strong', '', `시장 국면 · ${model.regime.label}`);
  if (model.regime.breadth) {
    const { windows } = model.regime.breadth;
    add(mobileSnapshot, 'p', '', `breadth · 20일 ${windows['20d'].percentage}% · 50일 ${windows['50d'].percentage}% · 200일 ${windows['200d'].percentage}%`);
  }
  const changes = add(mobileSnapshot, 'ol', 'executive-mobile-snapshot__changes');
  if (model.ranking.length) {
    model.ranking.slice(0, 5).forEach((item) => add(changes, 'li', '', intelligenceTitle(item.entry)));
  } else {
    add(changes, 'li', '', '직접 확인된 핵심 변화 없음');
  }
  add(mobileSnapshot, 'p', 'executive-mobile-snapshot__counter', `반대 근거 · ${model.todayBriefing.counterEvidence}`);
  add(mobileSnapshot, 'p', 'executive-mobile-snapshot__next', `다음 신호 · ${model.todayBriefing.nextSignal}`);
  const briefingToggle = add(section, 'button', 'executive-briefing-v2__summary', '확인된 사실·조건부 해석·모르는 것 펼치기') as HTMLButtonElement;
  const briefing = add(section, 'div', 'executive-briefing-v2');
  briefing.id = 'todayBriefingEvidence';
  briefingToggle.type = 'button';
  briefingToggle.setAttribute('aria-controls', briefing.id);
  briefingToggle.setAttribute('aria-expanded', 'false');
  briefingToggle.addEventListener('click', () => {
    const open = briefing.classList.toggle('mobile-open');
    briefingToggle.setAttribute('aria-expanded', String(open));
    briefingToggle.textContent = open ? '브리핑 근거 접기' : '확인된 사실·조건부 해석·모르는 것 펼치기';
  });
  const facts = add(briefing, 'section', 'executive-briefing-v2__facts');
  add(facts, 'h3', '', '확인된 사실');
  const factsList = add(facts, 'ul', 'executive-briefing-v2__list');
  model.todayBriefing.confirmedFacts.forEach((fact) => add(factsList, 'li', '', fact));
  const conditional = add(briefing, 'section', 'executive-briefing-v2__item');
  add(conditional, 'h3', '', '조건부 해석');
  add(conditional, 'p', '', model.todayBriefing.conditionalInterpretation);
  const counter = add(briefing, 'section', 'executive-briefing-v2__item executive-briefing-v2__counter');
  add(counter, 'h3', '', '가장 강한 반대 근거');
  add(counter, 'p', '', model.todayBriefing.counterEvidence);
  const unknown = add(briefing, 'section', 'executive-briefing-v2__item');
  add(unknown, 'h3', '', '아직 모르는 것');
  add(unknown, 'p', '', model.todayBriefing.unknowns);
  const next = add(briefing, 'section', 'executive-briefing-v2__item executive-briefing-v2__next');
  add(next, 'h3', '', '다음 확인할 신호');
  add(next, 'p', '', model.todayBriefing.nextSignal);
}

export function renderExecutiveBody(parent: HTMLElement, model: ExecutiveIntelligence): void {
  const grid = add(parent, 'div', 'executive-grid');
  grid.dataset.importantChanges = '';
  const ranking = add(grid, 'section', 'executive-panel executive-priorities');
  ranking.dataset.intelligenceRanking = '';
  ranking.dataset.worldHotspots = '';
  ranking.dataset.topIntelligence = '';
  add(ranking, 'h2', '', 'Top Intelligence · 최대 5개');
  if (!model.ranking.length) add(ranking, 'p', '', '직접 확인된 핵심 사건은 없습니다. 시장 국면과 다음 확인 신호를 우선 보세요.');
  model.ranking.slice(0, 5).forEach((item, index) => rankedItem(ranking, item, index, model.relationships));
  const market = add(grid, 'section', 'executive-panel executive-market');
  market.dataset.marketRegime = '';
  add(market, 'h2', '', '시장 국면');
  add(market, 'strong', '', model.regime.label);
  if (model.regime.breadth) {
    add(market, 'time', 'executive-market__session', `관측 세션 ${model.regime.breadth.observationDate}`);
    const metrics = add(market, 'div', 'executive-market__metrics');
    (['20d', '50d', '200d'] as const).forEach((key) => {
      const reading = model.regime.breadth!.windows[key];
      const metric = add(metrics, 'div', 'executive-market__metric');
      add(metric, 'span', '', key.replace('d', '일'));
      add(metric, 'strong', '', `${Math.round(reading.percentage * 100) / 100}%`);
      add(metric, 'small', '', reading.coverage !== undefined ? `coverage ${Math.round(reading.coverage * 100) / 100}%` : 'coverage 미확인');
    });
  }
  add(market, 'p', '', model.regime.interpretation);
  add(market, 'p', 'executive-market__confirmation', `시장 확인 · ${model.regime.marketConfirmation}`);
  add(market, 'p', 'executive-market__counter', `반대 근거 · ${model.regime.counterEvidence[0]}`);
  add(market, 'p', 'executive-market__next', `다음 확인 · ${model.regime.nextSignal}`);
  if (model.relationships.length) {
    const relations = add(grid, model.relationships.some((relation) => relation.type !== 'CANDIDATE') ? 'section' : 'details', 'executive-panel executive-relations');
    relations.dataset.intelligenceRelationships = '';
    if (relations instanceof HTMLDetailsElement) add(relations, 'summary', '', `직접 관찰된 관계 없음 · 확인 전 연결 후보 ${model.relationships.length}개`);
    else add(relations, 'h2', '', '영향 연결');
    const list = add(relations, 'ul', 'executive-relations__list');
    model.relationships.slice(0, 3).forEach((relation) => {
      const row = add(list, 'li', '');
      add(row, 'strong', '', `${INTELLIGENCE_TOPIC_LABELS[relation.source.domain]} → ${INTELLIGENCE_TOPIC_LABELS[relation.target.domain]} · ${RELATIONSHIP_LABELS[relation.type]}`);
      add(row, 'p', '', relation.summary);
      add(row, 'small', '', `다음 확인 · ${relation.whatToCheckNext}`);
    });
  }
  const investment = add(grid, 'details', 'executive-panel executive-investment');
  investment.dataset.executiveDisclosure = 'investment';
  const investmentSummary = add(investment, 'summary', '');
  add(investmentSummary, 'strong', '', '투자 관점');
  add(investmentSummary, 'span', '', model.investment.direction);
  const body = add(investment, 'div', 'executive-investment__body');
  add(body, 'p', '', model.investment.action);
  references(body, '확인된 방향의 근거', model.investment.supporting, '방향 판단 가능한 최신 근거 없음');
  counterReferences(body, model.investment.currentCounterEvidence, model.investment.counterNote);
  add(body, 'strong', '', '판단 변경 조건');
  add(body, 'p', '', model.investment.changeConditions.join(' · '));
  add(body, 'strong', '', '다음 확인'); add(body, 'p', '', model.investment.next);
  const counter = add(grid, 'section', 'executive-panel executive-counter');
  add(counter, 'h2', '', '현재 반대 근거');
  add(counter, 'p', '', model.investment.currentCounterEvidence.length
    ? model.investment.currentCounterEvidence.slice(0, 2).map(counterEvidenceDescription).join(' · ')
    : model.investment.counterNote);
  const conditions = add(grid, 'section', 'executive-panel executive-change-conditions');
  add(conditions, 'h2', '', '판단 변경 조건');
  const conditionList = add(conditions, 'ul', 'executive-change-conditions__list');
  model.investment.changeConditions.forEach((condition) => add(conditionList, 'li', '', condition));
  const watchlist = add(grid, 'section', 'executive-panel executive-watchlist');
  watchlist.dataset.executiveWatchlist = '';
  add(watchlist, 'h2', '', '관심종목 영향');
  if (model.watchlist.length) model.watchlist.slice(0, 2).forEach((item) => {
    const row = add(watchlist, 'p', '');
    const symbols = [...new Set(item.supporting.flatMap((entry) => entry.context?.symbols ?? []))];
    const relationship = model.relationships.find((candidate) => (
      candidate.source.id === item.entry.id && candidate.target.domain === 'WATCHLIST'
    ));
    const linkState = relationship?.type === 'OBSERVED' ? '직접 근거 연결'
      : relationship?.type === 'SUPPORTED_HYPOTHESIS' ? '근거 있는 연결 가설'
        : '확인 전 연결 후보';
    link(row, `${symbols.join('·')} · ${linkState} · ${intelligenceTitle(item.entry)}`, item.entry.deepLink);
  });
  else {
    add(watchlist, 'p', '', '현재 세계·시장 관측에서 내 종목에 연결된 최신 근거가 없습니다.');
    add(watchlist, 'p', '', '보유 여부와는 별개입니다. 종목 화면에서 보유 상태·기업 공시·뉴스 근거를 확인하세요.');
    link(watchlist, '내 종목 확인', '#controlRoomStockSummaryMount');
  }
  const coverage = add(grid, 'details', 'executive-panel executive-coverage');
  coverage.dataset.executiveDisclosure = 'coverage';
  coverage.dataset.essentialCoverage = '';
  const ready = model.essentialCoverage.filter((item) => item.status === 'READY').length;
  const degraded = model.essentialCoverage.filter((item) => item.status === 'DEGRADED').length;
  add(coverage, 'summary', '', `필수 인텔리전스 범위 · 정상 ${ready} · 제한 ${degraded} · 사용 불가 ${model.essentialCoverage.length - ready - degraded}`);
  add(coverage, 'p', '', '실제 판단에 필요한 7개 영역만 평가합니다. 사용하지 않는 catalog와 on-demand 항목은 분모에서 제외합니다.');
  const list = add(coverage, 'ul', 'executive-coverage__list');
  model.essentialCoverage.forEach((item) => {
    const status = item.status === 'READY' ? '정상' : item.status === 'DEGRADED' ? '제한' : '사용 불가';
    add(list, 'li', '', `${item.label} · ${status} · ${item.detail}`);
  });
  references(coverage, '제외한 관측', model.excluded, '현재 입력 중 제외 없음');

}
