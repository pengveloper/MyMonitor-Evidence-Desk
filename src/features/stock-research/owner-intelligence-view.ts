import { formatOwnerTime as timeLabel, ownerPriceDisplay, appendOwnerFxDetail } from '@/services/owner-display';
import { fetchOwnerIntelligence, OwnerContextError, OWNER_CONTEXT_CHANGED } from '@/services/owner-context';
import type { OwnerIntelligenceBrief, OwnerIntelligenceResponse, OwnerSignalStory, OwnerSignalStoryItem } from '../../../shared/owner-intelligence-contract';
import { buildOwnerSignalMap, buildOwnerSignalMapEdges, type OwnerSignalMapNode, type OwnerSignalRelationship } from './owner-signal-map';
import './owner-intelligence-view.css';

const add = (host: HTMLElement, tag: string, className: string, value?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (value !== undefined) node.textContent = value;
  host.append(node);
  return node;
};

const POSTURE: Record<OwnerSignalStory['posture'], string> = {
  WAIT_FOR_CONFIRMATION: '관망 · 다음 조건 확인',
  REVIEW_HOLD: '보유 유지 조건 점검',
  REVIEW_REDUCE: '보유 축소 조건 점검',
};

const STATE: Record<string, string> = {
  AVAILABLE: '확인', STALE: '오래됨', UNAVAILABLE: '미확인', NOT_CONFIGURED: '미설정', NOT_WIRED: '미연결',
};

function badge(host: HTMLElement, value: string, tone = 'neutral'): void {
  add(host, 'span', `owner-story__badge owner-story__badge--${tone}`, value);
}

function displayStoryDetail(value: OwnerSignalStoryItem): string {
  if (value.id !== 'macro-FX_USDKRW' || !value.value || !Number.isFinite(Number(value.value))) return value.detail;
  return value.detail.replace(value.value, Number(value.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
}

function storyItems(host: HTMLElement, values: OwnerSignalStoryItem[], empty: string): void {
  if (!values.length) {
    add(host, 'p', 'owner-story__empty', empty);
    return;
  }
  const list = add(host, 'ul', 'owner-story__detail-list');
  for (const value of values) {
    const row = add(list, 'li', 'owner-story__detail-item');
    const top = add(row, 'div', 'owner-story__detail-top');
    add(top, 'strong', 'owner-story__detail-label', value.label);
    badge(top, STATE[value.state] ?? value.state, value.state.toLowerCase());
    add(row, 'p', 'owner-story__detail-copy', displayStoryDetail(value));
    if (value.source || value.observedAt) add(row, 'small', 'owner-story__detail-meta', [value.source, value.observedAt ? timeLabel(value.observedAt) : null].filter(Boolean).join(' · '));
    if (value.url) {
      const link = add(row, 'a', 'owner-story__source', '원문') as HTMLAnchorElement;
      link.href = value.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  }
}

function disclosure(
  host: HTMLElement,
  key: string,
  title: string,
  count: number,
  render: (body: HTMLElement) => void,
  kind: 'quick' | 'section' = 'section',
): HTMLDetailsElement {
  const details = add(host, 'details', `owner-story__disclosure owner-story__disclosure--${kind}`) as HTMLDetailsElement;
  details.dataset.storySection = key;
  const summary = add(details, 'summary', 'owner-story__disclosure-summary');
  add(summary, 'span', 'owner-story__disclosure-title', title);
  add(summary, 'span', 'owner-story__disclosure-count', String(count));
  const body = add(details, 'div', 'owner-story__disclosure-body');
  render(body);
  return details;
}

function learning(host: HTMLElement, story: OwnerSignalStory): void {
  const summary = story.learningSummary;
  add(host, 'p', 'owner-story__learning-lead', `유사 사례 ${summary.similarCaseCount}건 · 비교 표본 n=${summary.calibrationSampleCount}. 관측된 과거 결과이며 예측 확률이 아닙니다.`);
  const grid = add(host, 'div', 'owner-story__horizons');
  for (const horizon of summary.horizons.filter(value => value.n > 0 || value.unresolved > 0)) {
    const card = add(grid, 'article', 'owner-story__horizon');
    add(card, 'strong', 'owner-story__horizon-title', `${horizon.tradingDays}거래일 후`);
    add(card, 'span', 'owner-story__horizon-stat', `n=${horizon.n} · 상승 ${horizon.up} / 하락 ${horizon.down} · 결과 대기 ${horizon.unresolved}건`);
  }
  if (!grid.childElementCount) add(host, 'p', 'owner-story__empty', '아직 후속 가격이 관측된 사례가 없습니다. 결과는 자동으로 갱신됩니다.');
  add(host, 'p', 'owner-story__detail-copy', '일봉 기준 결과를 장중 승률로 사용하지 않습니다. 동일 사건·중복 기사는 독립 표본이 아닙니다.');
  if (summary.comparableConditions.length) add(host, 'p', 'owner-story__detail-copy', `비교 조건 · ${summary.comparableConditions.join(' · ')}`);
  if (summary.importantDifferences.length) add(host, 'p', 'owner-story__detail-copy', `중요한 차이 · ${summary.importantDifferences.join(' · ')}`);
}

function portfolio(host: HTMLElement, story: OwnerSignalStory): void {
  const value = story.portfolio;
  if (!value.hasSoxlSoxsPair || !['SOXL', 'SOXS'].includes(story.symbol)) {
    add(host, 'p', 'owner-story__empty', story.actualHolding ? `${story.symbol} 실제 보유 맥락입니다.` : `${story.symbol}의 확인된 현재 보유가 없습니다. 관심·최근 거래는 별도 맥락입니다.`);
    for (const line of story.positionSummary) add(host, 'p', 'owner-story__detail-copy', line);
    return;
  }
  const callout = add(host, 'article', 'owner-story__portfolio-callout');
  add(callout, 'strong', 'owner-story__portfolio-title', 'SOXL + SOXS 동시 보유');
  badge(callout, value.state === 'COMPLETE' ? '계산 입력 확인' : '일부 입력 미확인', value.state === 'COMPLETE' ? 'available' : 'stale');
  const metrics = add(callout, 'dl', 'owner-story__portfolio-metrics');
  const rows: Array<[string, number | null, string]> = [
    ['롱 반도체 레버리지', value.longSemiconductorLeveragedNotional, value.currency ?? ''],
    ['인버스 반도체 레버리지', value.inverseSemiconductorLeveragedNotional, value.currency ?? ''],
    ['근사 순방향 노출', value.netDirectionalExposure, value.currency ?? ''],
    ['총 레버리지 노출', value.grossLeveragedExposure, value.currency ?? ''],
    ['상쇄 비율', value.offsetRatio === null ? null : value.offsetRatio * 100, '%'],
  ];
  for (const [label, metric, unit] of rows) {
    add(metrics, 'dt', '', label);
    add(metrics, 'dd', '', metric === null ? '미확인' : `${metric.toFixed(2)} ${unit}`.trim());
  }
  for (const observation of value.observations) add(callout, 'p', 'owner-story__detail-copy', observation);
  storyItems(host, story.positionSummary.map((detail, index) => ({ id: `position-${index}`, label: detail.split(/[:·]|\.(?=\s|$)/, 1)[0] ?? detail, detail, state: 'AVAILABLE' })), '포지션 설명이 없습니다.');
}

function events(host: HTMLElement, story: OwnerSignalStory): void {
  if (!story.newsEventClusters.length) {
    add(host, 'p', 'owner-story__empty', story.newsCoverage?.state === 'AVAILABLE' ? '이번 수집에서 관련 새 사건이 없습니다. 공급자가 모든 사건을 포함한다는 뜻은 아닙니다.' : '뉴스 수집 상태를 확인할 수 없습니다. 관련 사건이 없다고 판단하지 않습니다.');
    return;
  }
  for (const event of story.newsEventClusters.slice(0, 10)) {
    const card = add(host, 'article', `owner-story__event${event.primarySource ? ' owner-story__event--primary' : ''}`);
    const top = add(card, 'div', 'owner-story__event-top');
    badge(top, event.kind === 'SEC' ? `SEC ${event.form ?? ''}`.trim() : event.kind, event.kind === 'SEC' ? 'risk' : 'neutral');
    if (event.primarySource) badge(top, '1차 출처', 'available');
    badge(top, event.scope === 'INDIRECT' ? event.relatedSymbol === 'EWY' ? '간접 · 대용치 EWY' : `간접 관련 · ${event.relatedSymbol ?? '산업·구성기업'}` : '직접 관련', 'neutral');
    badge(top, event.translationState === 'TRANSLATED' ? '한국어 번역' : event.translationState === 'TRANSLATION_FAILED' ? '번역 실패 · 원문 유지' : /[가-힣]/.test(event.originalHeadline) ? '한국어 원문' : '번역 미제공 · 원문 유지', event.translationState === 'TRANSLATION_FAILED' ? 'stale' : 'neutral');
    if (event.kind === 'NEWS' && event.freshness === 'STALE') badge(top, '과거 기사 · 현재 촉매 미확인', 'stale');
    add(card, 'h4', 'owner-story__event-title', event.headline);
    add(card, 'p', 'owner-story__event-summary', `${story.symbol} 관련 사건 근거입니다. 가격 원인으로 단정하지 않고 시장·포지션 관측과 함께 확인합니다.`);
    if (event.scope === 'INDIRECT' && event.relationshipReason) {
      add(card, 'p', 'owner-story__event-summary', event.relationshipReason);
      add(card, 'small', 'owner-story__event-meta', event.relationshipAsOf ? `관계 기준일 · ${event.relationshipAsOf}` : `관계 자료 확인 · ${timeLabel(event.relationshipObservedAt ?? null)} · 구성 비중의 기준일과 다릅니다.`);
      if (event.relationshipSource) {
        const relationshipLink = add(card, 'a', 'owner-story__source', '간접 관계의 공식 근거') as HTMLAnchorElement;
        relationshipLink.href = event.relationshipSource; relationshipLink.target = '_blank'; relationshipLink.rel = 'noopener noreferrer';
      }
    }
    add(card, 'small', 'owner-story__event-meta', `${timeLabel(event.publishedAt)} · 최초 확인 ${timeLabel(event.firstSeenAt)} · 출처 ${event.sourceCount}개 · ${STATE[event.freshness]}`);
    if (event.headline !== event.originalHeadline) add(card, 'p', 'owner-story__event-original', `원문 · ${event.originalHeadline}`);
    if (event.tags.length) add(card, 'p', 'owner-story__event-tags', event.tags.join(' · '));
    const links = add(card, 'div', 'owner-story__event-links');
    for (const source of event.links) {
      const link = add(links, 'a', 'owner-story__source', `${source.primary ? '1차' : '보도'} · ${source.name}`) as HTMLAnchorElement;
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  }
}

const RELATIONSHIP: Record<OwnerSignalRelationship, { label: string; symbol: string }> = {
  SUPPORTIVE: { label: '지지', symbol: '+' },
  COUNTER: { label: '반대', symbol: '−' },
  MIXED: { label: '혼재', symbol: '±' },
  UNKNOWN: { label: '미확인', symbol: '?' },
  CONTEXT: { label: '관계 설명', symbol: '·' },
};

function renderSignalMapDetail(host: HTMLElement, node: OwnerSignalMapNode): void {
  host.replaceChildren();
  host.dataset.signalMapDetail = node.id;
  const top = add(host, 'div', 'owner-signal-map__detail-top');
  add(top, 'strong', '', node.label);
  add(top, 'span', `owner-signal-map__relation owner-signal-map__relation--${node.relationship.toLowerCase()}`, `${RELATIONSHIP[node.relationship].symbol} ${RELATIONSHIP[node.relationship].label}`);
  add(host, 'p', 'owner-signal-map__detail-copy', node.summary);
  add(host, 'p', 'owner-signal-map__detail-evidence', `근거 · ${node.evidenceType} · ${node.evidenceLabel}`);
  add(host, 'small', 'owner-signal-map__detail-meta', `${node.source} · ${node.timeMeaning === 'AS_OF' ? '관계 기준일 ' : node.timeMeaning === 'SOURCE_OBSERVED' ? '자료 확인 ' : ''}${timeLabel(node.observedAt)} · ${STATE[node.state] ?? node.state}`);
  if (node.fetchedAt) add(host, 'small', 'owner-signal-map__detail-meta', `수집 ${timeLabel(node.fetchedAt)}`);
  if (node.timeMeaning === 'SOURCE_OBSERVED') add(host, 'small', 'owner-signal-map__detail-meta', '자료를 확인한 시각이며 구성 비중이나 상품 변경의 기준일을 뜻하지 않습니다.');
  add(host, 'p', 'owner-signal-map__detail-evidence', node.id === 'events' ? '다음 확인 · 공식 후속 발표와 같은 기간의 가격·사업 관측이 이 사건의 영향을 뒷받침하는지 확인합니다.' : node.id === 'position' ? '다음 확인 · 계좌의 최신 수량·평가금액과 시세 기준 시각을 확인합니다.' : '다음 확인 · 현재 값과 이전 비교값의 시각·단위가 같고, 상품 노출과 실제 변화가 구분되는지 확인합니다.');
  if (node.url) {
    const link = add(host, 'a', 'owner-story__source', '근거 원문') as HTMLAnchorElement;
    link.href = node.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
}

function renderSignalMap(host: HTMLElement, story: OwnerSignalStory): void {
  const section = add(host, 'section', 'owner-signal-map');
  section.dataset.signalMap = story.symbol;
  const heading = add(section, 'header', 'owner-signal-map__header');
  const title = add(heading, 'div', '');
  add(title, 'div', 'owner-story__eyebrow', '사건에서 내 포지션까지');
  add(title, 'h3', 'owner-signal-map__title', `${story.symbol} 영향 지도`);
  add(heading, 'p', 'owner-signal-map__hint', '파선은 검증 전 가설입니다. 노드를 눌러 근거·시각·다음 확인을 봅니다.');
  const stage = add(section, 'div', 'owner-signal-map__path');
  stage.setAttribute('aria-label', '사건 → 산업·기업 → 상품 → 내 포지션');
  const nodes = buildOwnerSignalMap(story);
  const edges = buildOwnerSignalMapEdges(story);
  const context = add(section, 'div', 'owner-signal-map__context');
  context.setAttribute('aria-label', '함께 볼 시장 관측');
  const detail = add(section, 'aside', 'owner-signal-map__detail');
  detail.setAttribute('aria-live', 'polite');
  const buttons: HTMLButtonElement[] = [];
  const activate = (node: OwnerSignalMapNode, button: HTMLButtonElement): void => {
    buttons.forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
    renderSignalMapDetail(detail, node);
  };
  const pathIds = ['events', 'benchmark', 'structure', 'position'];
  const ordered = [...pathIds.map(id => nodes.find(node => node.id === id)!), ...nodes.filter(node => !pathIds.includes(node.id))];
  for (const node of ordered) {
    const parent = pathIds.includes(node.id) ? stage : context;
    const button = add(parent, 'button', 'owner-signal-map__node') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.signalMapNode = node.id;
    button.dataset.relationship = node.relationship;
    button.setAttribute('aria-pressed', 'false');
    add(button, 'span', 'owner-signal-map__node-label', node.label);
    add(button, 'small', 'owner-signal-map__relation', node.evidenceType ?? 'HYPOTHESIS');
    add(button, 'span', `owner-signal-map__relation owner-signal-map__relation--${node.relationship.toLowerCase()}`, `${RELATIONSHIP[node.relationship].symbol} ${RELATIONSHIP[node.relationship].label}`);
    buttons.push(button);
    button.addEventListener('click', () => activate(node, button));
    const edge = edges.find(candidate => candidate.from === node.id);
    if (edge) {
      const line = add(stage, 'button', `owner-signal-map__edge${edge.kind === 'HYPOTHESIS' ? ' owner-signal-map__edge--hypothesis' : ''}`) as HTMLButtonElement;
      line.type = 'button';
      line.dataset.signalMapEdge = `${edge.from}-${edge.to}`;
      line.dataset.relationshipKind = edge.kind;
      line.title = edge.reason;
      line.setAttribute('aria-label', `${edge.label} · 연결 이유 보기`);
      add(line, 'span', 'owner-signal-map__edge-label', edge.label);
      const arrow = add(line, 'span', 'owner-signal-map__edge-arrow', '↓');
      arrow.setAttribute('aria-hidden', 'true');
      line.addEventListener('click', () => {
        const target = nodes.find(candidate => candidate.id === edge.to);
        const targetButton = buttons.find(candidate => candidate.dataset.signalMapNode === edge.to);
        if (target && targetButton) {
          activate(target, targetButton);
          add(detail, 'p', 'owner-signal-map__detail-copy', `연결 이유 · ${edge.reason}`);
        }
      });
    }
  }
  if (ordered[0] && buttons[0]) activate(ordered[0], buttons[0]);
}

function deepAnalysis(host: HTMLElement, brief: OwnerIntelligenceBrief): void {
  const section = add(host, 'section', 'owner-story__deep');
  add(section, 'div', 'owner-story__eyebrow', '보존된 근거로 작성한 심층 분석');
  add(section, 'h3', 'owner-story__deep-title', '깊게 분석');
  if (brief.revalidationWarnings?.length) add(section, 'p', 'owner-story__state', '과거 분석 일부 문장은 당시 근거와 맞지 않아 숨겼습니다. 원래 기록과 근거는 보존되며 새 분석이 필요합니다.');
  const rows: Array<[string, string[]]> = [
    ['1. 지금 가장 중요한 변화', [brief.mostImportantChange ?? brief.summary]],
    ['2. 왜 움직이는가', brief.whyMoving ?? brief.drivers],
    ['3. 가장 강한 상승·긍정 근거', brief.strongestPositive ?? brief.drivers],
    ['4. 가장 강한 반대 근거', brief.counterevidence],
    ['5. 현재 판단', brief.currentPosture ? [brief.currentPosture] : []],
    ['6. 근거 충족도와 불확실성', brief.coverageAndUncertainty ?? []],
    ['7. 내 실제 포지션 기준 위험·기회', brief.positionRiskOpportunity ?? []],
    ['8. 판단을 바꿀 조건', brief.changeConditions],
    ['9. 다음 확인 신호', brief.nextChecks],
    ['10. 당시 근거가 남아 있는 유사 사례', brief.similarCases ?? []],
    ['11. 내 거래에서 관측된 패턴', brief.ownerBehaviorPattern ?? []],
    ['12. 데이터가 부족한 부분', brief.dataGaps ?? []],
  ];
  for (const [title, values] of rows) {
    const row = add(section, 'article', 'owner-story__deep-row');
    add(row, 'h4', 'owner-story__deep-heading', title);
    if (!values.length) add(row, 'p', 'owner-story__empty', '통계적으로 방어 가능한 근거 없음');
    for (const value of values) add(row, 'p', 'owner-story__detail-copy', value);
  }
}

export function renderOwnerIntelligence(host: HTMLElement, result: OwnerIntelligenceResponse): void {
  const summaryExpanded = host.querySelector('[data-summary-toggle]')?.getAttribute('aria-expanded') === 'true';
  const openSections = [...host.querySelectorAll<HTMLDetailsElement>('[data-story-section][open]')].map(section => section.dataset.storySection);
  const selectedMapNode = host.querySelector<HTMLButtonElement>('[data-signal-map-node][aria-pressed="true"]')?.dataset.signalMapNode;
  host.replaceChildren();
  host.classList.remove('owner-story__skeleton');
  host.classList.add('owner-intelligence-evidence');
  const story = result.story;
  const stateCopy = result.error ?? (result.briefState === 'OUTDATED'
    ? '갱신 필요 · 중요한 근거가 바뀌었습니다. 이전 심층 분석의 당시 근거는 보존됩니다.'
    : result.briefState === 'CURRENT' ? '심층 분석과 현재 화면의 주요 근거가 일치합니다.' : '저장된 근거 요약 · 심층 분석 전');
  if (!story) {
    const state = add(host, 'p', `owner-story__state owner-story__state--${result.briefState.toLowerCase()}`, stateCopy);
    state.setAttribute('role', 'status');
    return;
  }
  host.dataset.evidenceFingerprint = story.evidenceFingerprint;
  host.dataset.briefState = result.briefState;

  const hero = add(host, 'header', 'owner-story__hero');
  const identity = add(hero, 'div', 'owner-story__identity');
  add(identity, 'div', 'owner-story__eyebrow', story.assetClass === 'ETF' ? 'ETF · 내 투자 판단' : '기업 주식 · 내 투자 판단');
  add(identity, 'h2', 'owner-story__symbol', story.symbol);
  if (story.profile.name) add(identity, 'p', 'owner-story__name', story.profile.name);
  const badges = add(identity, 'div', 'owner-story__badges');
  if (story.actualHolding) badge(badges, '실제 보유', 'holding');
  if (story.recentlyTraded) badge(badges, '최근 거래', 'recent');
  if (story.profile.leverageMultiple) badge(badges, `${story.profile.leverageMultiple}배 레버리지 ETF`, 'leverage');
  if (!story.actualHolding) badge(badges, ['FLAT', 'NOT_HELD'].includes(story.positionState) ? '현재 보유 없음' : '보유 상태 미확인', 'neutral');

  const quote = add(hero, 'div', 'owner-story__quote');
  const display = ownerPriceDisplay(story);
  add(quote, 'strong', 'owner-story__price', display.text);
  appendOwnerFxDetail(quote, display.detail);
  if (story.price.changePercent !== null) add(quote, 'span', `owner-story__change owner-story__change--${story.price.changePercent >= 0 ? 'up' : 'down'}`, `${story.price.changePercent >= 0 ? '+' : ''}${story.price.changePercent.toFixed(2)}%`);
  add(quote, 'small', 'owner-story__freshness', `${story.price.timingLabel ?? (story.price.delayed ? story.price.delayedMinutes ? `${story.price.delayedMinutes}분 지연` : '종가 · 실시간 가격 아님' : '시세')} · ${timeLabel(story.price.observedAt)} · ${story.price.source || '출처 미확인'}${story.price.delayed ? ' · 브로커 손익과 관측 시점이 다릅니다' : ''}`);

  const signal = add(host, 'section', 'owner-story__signal');
  add(signal, 'div', 'owner-story__eyebrow', '무슨 일 · 내게 무슨 의미 · 다음 조건');
  add(signal, 'h3', 'owner-story__headline', story.headline);
  const reason = !result.shortSummary?.refreshNeeded && result.shortSummary?.text ? result.shortSummary.text : story.oneLineReason;
  if (reason.trim() !== story.headline.trim()) {
    const copy = add(signal, 'p', 'owner-story__reason', reason);
    if (reason.length > 180) {
      copy.id = `owner-summary-${story.symbol}`;
      const toggle = add(signal, 'button', 'owner-story__summary-toggle') as HTMLButtonElement;
      toggle.type = 'button'; toggle.dataset.summaryToggle = 'true';
      toggle.setAttribute('aria-controls', copy.id);
      const expand = (expanded: boolean): void => {
        copy.classList.toggle('owner-story__reason--compact', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '요약 접기' : '요약 전체 보기';
      };
      expand(summaryExpanded);
      toggle.addEventListener('click', () => expand(toggle.getAttribute('aria-expanded') !== 'true'));
    }
  }
  const summaryLabel = result.shortSummary?.status === 'READY' ? result.shortSummary.refreshNeeded ? '현재 근거 요약 · 이전 AI 요약 갱신 대기' : '저장된 AI 한국어 요약' : result.shortSummary?.status === 'PENDING' ? '근거 요약 · AI 요약 갱신 중' : result.shortSummary?.status === 'FAILED' ? '근거 요약 · AI 생성 실패' : result.shortSummary?.status === 'BUDGET_LIMITED' ? '근거 요약 · AI 예산 한도' : '확인된 근거 요약';
  add(signal, 'small', 'owner-story__summary-meta', `${summaryLabel} · 1~5거래일 맥락${result.shortSummary?.generatedAt ? ` · ${timeLabel(result.shortSummary.generatedAt)}` : ''}`);
  if (result.shortSummary?.refreshNeeded) add(signal, 'p', 'owner-story__summary-refresh', `갱신 필요 · ${result.shortSummary.refreshReason ?? '중요한 근거가 바뀌었습니다.'}`);
  if (result.shortSummary?.refreshNeeded && result.shortSummary.generatedAt) {
    const past = add(signal, 'details', 'owner-story__previous-summary');
    add(past, 'summary', '', `당시 AI 요약 · ${timeLabel(result.shortSummary.generatedAt)}`);
    add(past, 'p', 'owner-story__detail-copy', result.shortSummary.text);
  }
  if (story.changeConditions[0]) add(signal, 'p', 'owner-story__next-condition', `다음 조건 · ${story.changeConditions[0].detail}`);
  add(signal, 'strong', `owner-story__posture owner-story__posture--${story.actualHolding ? story.posture.toLowerCase() : 'wait_for_confirmation'}`, story.actualHolding ? POSTURE[story.posture] : story.posture === 'REVIEW_REDUCE' ? '신규 진입 전 위험 확인' : '신규 진입 전 조건 확인');
  add(signal, 'small', 'owner-story__coverage', `근거 ${story.evidenceCoverage.available}/${story.evidenceCoverage.total} · 확률이 아니라 관측 범위`);
  if (story.price.intradayUsable === false) add(signal, 'small', 'owner-story__coverage', '현재 장중 진입 가격 제안은 제한합니다. 기업·시장 맥락은 계속 확인할 수 있습니다.');

  const chips = add(host, 'div', 'owner-story__chips');
  const compactSignals = (story.symbol === 'CISS' ? story.companyOrEtfSpecific : story.symbol === 'KORU' ? [...story.companyOrEtfSpecific.slice(0, 2), ...story.macroChannels.filter(row => /KRW|KOREA/.test(row.id))] : [...story.marketRegime, ...story.macroChannels])
    .filter((value, index, values) => values.findIndex((candidate) => candidate.id === value.id) === index)
    .slice(0, 4);
  for (const value of compactSignals) {
    const missingBreadth = /breadth|확산/i.test(`${value.id} ${value.label}`) && value.state !== 'AVAILABLE';
    const chip = add(chips, 'span', `owner-story__chip owner-story__chip--${value.state.toLowerCase()}`, missingBreadth ? '시장 상승 참여율 미확인' : displayStoryDetail(value));
    chip.title = value.observedAt ?? STATE[value.state] ?? value.state;
  }
  if (story.symbol !== 'CISS' && ![...story.marketRegime, ...story.macroChannels].some((value) => /breadth|확산/i.test(`${value.id} ${value.label}`))) {
    add(chips, 'span', 'owner-story__chip owner-story__chip--unavailable', '시장 상승 참여율 미확인');
  }
  if (story.learningSummary.similarCaseCount) add(chips, 'span', 'owner-story__chip', `유사사례 ${story.learningSummary.similarCaseCount}건`);

  if (result.changes && result.changes.changedCount > 0) {
    const changed = add(host, 'aside', `owner-story__changed${result.changes.postureChanged ? ' owner-story__changed--posture' : ''}`);
    add(changed, 'strong', '', `새 정보 ${result.changes.changedCount}건`);
    add(changed, 'span', '', result.changes.postureChanged ? '판단 변경' : '판단 변경 없음');
    for (const value of result.changes.items) add(changed, 'p', '', value);
  }

  const quick = add(host, 'section', 'owner-story__quick-actions');
  disclosure(quick, 'why', '상승·지지 근거', story.topDrivers.length, body => storyItems(body, story.topDrivers, '확인된 방향 근거가 없습니다.'), 'quick');
  disclosure(quick, 'counter', '반대 근거', story.counterSignals.length, body => storyItems(body, story.counterSignals, '확인된 반대 근거가 없습니다.'), 'quick');
  disclosure(quick, 'next', '판단 변경 조건', story.changeConditions.length + story.nextChecks.length, body => {
    add(body, 'h4', 'owner-story__subheading', '판단을 바꿀 조건'); storyItems(body, story.changeConditions, '조건이 없습니다.');
    add(body, 'h4', 'owner-story__subheading', '다음 확인'); storyItems(body, story.nextChecks, '다음 확인 신호가 없습니다.');
  }, 'quick');
  disclosure(quick, 'cases', '비슷한 과거', story.learningSummary.similarCaseCount, body => learning(body, story), 'quick');

  renderSignalMap(host, story);

  const disclosures = add(host, 'section', 'owner-story__sections');
  disclosure(disclosures, 'position', '내 포지션', story.positionSummary.length + (story.portfolio.hasSoxlSoxsPair ? 1 : 0), body => portfolio(body, story));
  disclosure(disclosures, 'market', story.symbol === 'CISS' ? '시장 맥락 · 보조 관측' : '시장 환경', story.marketRegime.length + story.macroChannels.length, body => {
    add(body, 'h4', 'owner-story__subheading', '시장 국면');
    storyItems(body, story.marketRegime, '확인된 시장 국면이 없습니다.');
    add(body, 'h4', 'owner-story__subheading', '매크로·인터마켓');
    storyItems(body, story.macroChannels, '확인된 매크로 관측이 없습니다.');
  });
  disclosure(disclosures, 'profile', story.assetClass === 'ETF' ? 'ETF 구조' : '기업 구조', story.companyOrEtfSpecific.length, body => {
    const list = add(body, 'ul', 'owner-story__monitor-list');
    for (const value of story.profile.monitorDimensions) add(list, 'li', '', value);
    add(body, 'h4', 'owner-story__subheading', story.assetClass === 'ETF' ? 'ETF 구조' : '기업 고유 위험');
    storyItems(body, story.companyOrEtfSpecific, '확인된 세부 구조가 없습니다.');
  });
  disclosure(disclosures, 'events', '뉴스/이벤트', story.newsEventClusters.length, body => events(body, story));
  disclosure(disclosures, 'sources', '근거/출처', story.primarySources.length, body => {
    if (!story.primarySources.length) add(body, 'p', 'owner-story__empty', '확인된 1차 출처가 없습니다.');
    for (const source of story.primarySources) {
      const row = add(body, 'article', 'owner-story__source-row');
      const link = add(row, 'a', 'owner-story__source', source.name) as HTMLAnchorElement;
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      add(row, 'small', '', timeLabel(source.publishedAt));
    }
  });
  disclosure(disclosures, 'limits', '제약/모르는 것', story.unknowns.length + story.notWired.length, body => {
    const state = add(body, 'p', `owner-story__state owner-story__state--${result.briefState.toLowerCase()}`, stateCopy);
    state.setAttribute('role', 'status');
    add(body, 'p', 'owner-story__detail-copy', `생성 ${timeLabel(story.generatedAt)} · 원본 UTC ${story.generatedAt} · evidenceFingerprint ${story.evidenceFingerprint}`);
    const viewport = window.visualViewport;
    add(body, 'p', 'owner-story__detail-copy', `화면 진단 · CSS ${window.innerWidth}×${window.innerHeight} · 화면 배율 ${window.devicePixelRatio} · 표시 영역 ${viewport ? `${Math.round(viewport.width)}×${Math.round(viewport.height)}` : '미확인'}. 기기 모델은 이 값으로 추정하지 않습니다.`);
    if (story.unknowns.length) add(body, 'p', 'owner-story__detail-copy', `미확인 · ${story.unknowns.join(' · ')}`);
    if (story.notWired.length) add(body, 'p', 'owner-story__detail-copy', `연결 대기 · ${story.notWired.join(' · ')}`);
  });

  if (result.brief && result.briefState === 'CURRENT') deepAnalysis(host, result.brief);
  if (result.brief && result.briefState === 'OUTDATED') {
    disclosure(disclosures, 'deep-history', '이전 심층 분석 · 갱신 필요', 12, body => {
      add(body, 'p', 'owner-story__detail-copy', timeLabel(result.brief!.generatedAt) + ' 당시 근거로 작성했습니다. 아래 가격·포지션·판단은 과거 기록이며 현재 판단이 아닙니다.');
      deepAnalysis(body, result.brief!);
    });
  }
  const feedback = add(host, 'section', 'owner-story__feedback');
  feedback.setAttribute('aria-label', '설명에 대한 내 피드백');
  add(feedback, 'strong', '', '이 설명이 도움이 됐나요?');
  const feedbackActions = add(feedback, 'div', 'owner-story__feedback-actions');
  const feedbackStatus = add(feedback, 'p', 'owner-story__detail-copy', '이 기기에만 저장됩니다. 피드백은 예측 성과와 별개입니다.');
  feedbackStatus.setAttribute('role', 'status');
  for (const label of ['도움 됨', '틀림', '다시 볼 이유']) {
    const button = add(feedbackActions, 'button', '', label) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', () => {
      try {
        const key = 'mymonitor-owner-explanation-feedback-v1';
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        const previous = Array.isArray(raw) ? raw.slice(-49) : [];
        const record = { symbol: story.symbol, evidenceBundleId: result.shortSummary?.evidenceBundleId ?? story.evidenceFingerprint, label, recordedAt: new Date().toISOString() };
        localStorage.setItem(key, JSON.stringify([...previous, record]));
        feedbackStatus.textContent = `“${label}” 저장됨 · 이 기기에서만 보관하며 예측 정확도를 뜻하지 않습니다.`;
        for (const candidate of feedbackActions.querySelectorAll('button')) candidate.setAttribute('aria-pressed', String(candidate === button));
      } catch { feedbackStatus.textContent = '기기 저장소를 사용할 수 없어 저장하지 못했습니다.'; }
    });
  }
  for (const details of host.querySelectorAll<HTMLDetailsElement>('[data-story-section]')) details.open = openSections.includes(details.dataset.storySection);
  if (selectedMapNode) {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-signal-map-node]')) if (button.dataset.signalMapNode === selectedMapNode) button.click();
  }
}

export function mountOwnerIntelligence(host: HTMLElement, symbol: string): () => void {
  let disposed = false, generation = 0, pending = false;
  let lastProviderRefresh = 0;
  let current: OwnerIntelligenceResponse | null = null;
  const body = document.createElement('div'), controls = document.createElement('div');
  controls.className = 'owner-intelligence-controls';
  host.replaceChildren(body, controls);
  const refresh = document.createElement('button'), deep = document.createElement('button');
  refresh.type = deep.type = 'button'; refresh.textContent = '새 정보 확인'; deep.textContent = '깊게 분석';
  controls.append(refresh, deep);
  const status = add(controls, 'p', 'owner-intelligence-controls__status', '저장된 요약을 먼저 표시하고 새 정보를 확인합니다. 긴 분석은 버튼으로 실행합니다.');
  status.setAttribute('role', 'status');
  body.className = 'owner-story__skeleton';
  for (let index = 0; index < 3; index += 1) body.append(document.createElement('span'));

  let lastActionError: string | null = null;
  const run = async (mode: 'refresh' | 'deep' | 'status'): Promise<void> => {
    if (pending || disposed) return;
    if (mode === 'refresh') lastProviderRefresh = Date.now();
    const id = ++generation; pending = true; refresh.disabled = deep.disabled = true;
    if (mode !== 'status') status.textContent = mode === 'deep' ? '화면에 표시된 근거로 깊게 분석 중…' : '가격·뉴스·공시·보유 상태를 확인 중…';
    try {
      const result = await fetchOwnerIntelligence(symbol, mode, current?.story?.evidenceFingerprint);
      if (disposed || id !== generation) return;
      current = result; renderOwnerIntelligence(body, result);
      if (mode !== 'status') lastActionError = result.error ?? (mode === 'deep' && result.briefState === 'OUTDATED' ? '분석 중 근거가 바뀌었습니다. 새 근거를 확인하고 다시 분석할 수 있습니다.' : null);
      status.textContent = result.error ?? lastActionError ?? (mode === 'refresh' && result.changes
        ? `새 정보 ${result.changes.changedCount}건 · ${result.changes.postureChanged ? '판단 변경' : '판단 변경 없음'}`
        : result.briefState === 'CURRENT' && result.brief ? '표시된 심층 분석의 근거를 보존했습니다.' : '현재 화면은 저장된 검증 근거로 구성했습니다.');
    } catch (error) {
      if (disposed || id !== generation) return;
      if (current?.story) {
        current = { ...current, story: { ...current.story, status: 'OUTDATED' }, briefState: 'OUTDATED' };
        renderOwnerIntelligence(body, current);
      } else body.replaceChildren();
      const reason = error instanceof OwnerContextError && [401, 403].includes(error.status)
        ? 'Cloudflare Access 인증을 다시 확인해 주세요.'
        : error instanceof OwnerContextError && error.status >= 500
          ? '서버에서 분석·자료 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : error instanceof Error && error.name === 'TimeoutError'
            ? '처리 시간이 초과됐습니다. 저장된 결과를 확인한 뒤 다시 시도해 주세요.'
            : '연결 또는 자료 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      lastActionError = reason + ' 이전 판단은 갱신 필요로 표시합니다.';
      status.textContent = lastActionError;
    } finally {
      if (id === generation) { pending = false; refresh.disabled = false; deep.disabled = !current?.story; }
    }
  };
  refresh.addEventListener('click', () => { void run('refresh'); });
  deep.addEventListener('click', () => { void run('deep'); });
  const changed = (): void => { generation++; pending = false; current = null; body.replaceChildren(); void run('refresh'); };
  window.addEventListener(OWNER_CONTEXT_CHANGED, changed);
  const poll = window.setInterval(() => { if (current?.story && document.visibilityState === 'visible') void run(Date.now() - lastProviderRefresh >= 300_000 ? 'refresh' : 'status'); }, 30_000);
  void run('status').then(() => { if (!disposed) void run('refresh'); });
  return () => { disposed = true; generation++; clearInterval(poll); window.removeEventListener(OWNER_CONTEXT_CHANGED, changed); host.replaceChildren(); };
}
