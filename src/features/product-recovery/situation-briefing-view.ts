import { renderExecutiveHeader, renderExecutiveBody } from './executive-intelligence-view.ts';
import type { IntelligenceBriefingModel } from './intelligence-briefing-model.ts';
import type { IntelligenceChangeType, IntelligenceChangeView } from './executive-intelligence-model.ts';
import {
  SITUATION_AVAILABILITY_LABELS,
  type ActionableNextCheck,
  type BriefingEntry,
  type BriefingSection,
  type SituationBriefingModel,
  type SituationSynthesis,
} from './situation-synthesis-model.ts';
import { getProductLocale } from '@/services/i18n-policy';
import '@/styles/situation-briefing.css';

export interface SituationBriefingMountOptions {
  language?: string;
  sinceLastCheck?: IntelligenceBriefingModel['sinceLastCheck'];
  onMarkChecked?: () => void;
}

export interface MountedSituationBriefing {
  destroy(): void;
}

function append(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function appendLink(parent: HTMLElement, label: string, href: string | undefined, className?: string): HTMLElement {
  const safe = safeHref(href);
  if (!safe) return append(parent, 'span', className, label);
  const link = append(parent, 'a', className, label) as HTMLAnchorElement;
  link.href = safe;
  const resolved = new URL(safe, window.location.origin);
  if (resolved.origin !== window.location.origin) {
    link.target = '_blank';
    link.rel = 'noreferrer';
  }
  return link;
}

function formatTime(value: string | null, language: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(getProductLocale(language), {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(getProductLocale(language), {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(parsed));
}

function compactSource(entry: BriefingEntry): string {
  const id = entry.source?.id ?? '';
  if (/^FRED/i.test(id)) return 'FRED';
  if (/^SEC/i.test(id) || entry.category === 'COMPANY_SEC') return 'SEC';
  return (entry.source?.label ?? '').split(' · ')[0]!.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || id;
}

function availabilityLabel(entry: BriefingEntry): string {
  return entry.source?.mode === 'PUBLIC_SNAPSHOT'
    ? '공개 스냅샷 · 현행 미확인'
    : SITUATION_AVAILABILITY_LABELS[entry.availability];
}

function disclosure(
  parent: HTMLElement,
  className: string,
  summaryText: string,
  listeners: Array<() => void>,
): HTMLDetailsElement {
  const details = append(parent, 'details', className) as HTMLDetailsElement;
  const summary = append(details, 'summary', undefined, summaryText);
  const onToggle = (): void => { summary.textContent = details.open ? '접기' : summaryText; };
  details.addEventListener('toggle', onToggle);
  listeners.push(() => details.removeEventListener('toggle', onToggle));
  return details;
}

function evidenceLabel(entry: BriefingEntry): string {
  return entry.evidenceRefs.length > 0 ? entry.evidenceRefs.join(' · ') : '연결된 근거 식별자 없음';
}

function renderEntry(entry: BriefingEntry, language: string, listeners: Array<() => void>): HTMLElement {
  const article = document.createElement('article');
  article.className = 'briefing-entry';
  article.dataset.briefingEntry = entry.id;
  article.dataset.availability = entry.availability;
  if (entry.category === 'WORLD') article.dataset.worldNewsItem = '';

  const header = append(article, 'header', 'briefing-entry__header');
  appendLink(header, entry.title, entry.deepLink, 'briefing-entry__title');
  append(header, 'span', `control-room-status control-room-status--${entry.availability.toLowerCase()}`, availabilityLabel(entry));
  append(article, 'p', 'briefing-entry__summary', entry.summary);

  const meta = append(article, 'p', 'briefing-entry__meta');
  if (entry.source) appendLink(meta, compactSource(entry), entry.source.href ?? entry.deepLink, 'briefing-entry__source');
  const observed = formatTime(entry.observedAt, language);
  if (observed) {
    const semantic = entry.source?.id.startsWith('RSS:') ? '기사 발행' : '관측';
    const time = append(meta, 'time', undefined, `${semantic} ${observed} · 사건 발생 시각 아님`);
    time.title = `원문 시각 ${entry.observedAt}`;
  }

  if (entry.originalTitle || entry.originalSummary) {
    const original = disclosure(article, 'briefing-entry__original', '원문 보기', listeners);
    if (entry.originalTitle) appendLink(original, entry.originalTitle, entry.deepLink, 'briefing-entry__original-title');
    if (entry.originalSummary) append(original, 'p', undefined, entry.originalSummary);
  }

  const details = disclosure(article, 'briefing-category__details', '더보기', listeners);
  const dl = append(details, 'dl', 'briefing-entry__details');
  const row = (term: string, value: string): void => {
    append(dl, 'dt', undefined, term);
    append(dl, 'dd', undefined, value);
  };
  row('주요 변화', entry.details.mainChanges.join(' · '));
  row('관련 근거', evidenceLabel(entry));
  row('왜 중요한가', entry.details.whyImportant);
  row('반대/불확실성', entry.details.uncertainty);
  row('반대 근거', entry.conflictsWithEvidenceRefs.length > 0
    ? entry.conflictsWithEvidenceRefs.join(' · ')
    : '현재 연결된 반대 근거 없음 — 독립 출처 확인 전 결론 보류');
  row('다음 확인 사항', entry.details.nextCheck.label);
  const linkRow = append(dl, 'div', 'briefing-entry__deep-link');
  append(linkRow, 'dt', undefined, '관련 panel/원문');
  const dd = append(linkRow, 'dd');
  appendLink(dd, '확인하기', entry.details.nextCheck.deepLink || entry.deepLink);
  if (entry.details.internalReason) {
    const status = append(details, 'details', 'control-room-status-details') as HTMLDetailsElement;
    append(status, 'summary', undefined, '상세 상태');
    append(status, 'p', undefined, entry.details.internalReason);
  }
  return article;
}

const VIEW_ORDER = [
  'WORLD', 'MARKET', 'MACRO', 'ENERGY_COMMODITIES', 'LOGISTICS_INFRASTRUCTURE',
  'GEOPOLITICS_SECURITY', 'COMPANY_SEC', 'WATCHLIST', 'DATA_QUALITY',
] as const;

function renderCategory(section: BriefingSection, language: string, listeners: Array<() => void>): HTMLElement {
  const category = document.createElement('section');
  category.className = 'briefing-category';
  category.dataset.briefingCategory = section.category;
  category.id = `global-radar-section-${section.category === 'COMPANY_SEC' ? 'sec' : section.category.toLowerCase()}`;
  const header = append(category, 'header', 'briefing-category__header');
  append(header, 'h3', undefined, section.category === 'WORLD' ? '세계/뉴스' : section.label);
  append(header, 'span', `control-room-status control-room-status--${section.availability.toLowerCase()}`, SITUATION_AVAILABILITY_LABELS[section.availability]);
  append(category, 'p', 'briefing-category__summary', section.summary);
  if (section.entries.length === 0) return category;
  const entries = append(category, 'div', 'briefing-category__entries');
  section.entries.forEach((entry) => entries.append(renderEntry(entry, language, listeners)));
  return category;
}

function renderNextCheck(check: ActionableNextCheck): HTMLElement {
  const item = document.createElement('li');
  item.className = 'next-check';
  item.dataset.nextCheck = check.id;
  appendLink(item, check.label, check.deepLink, 'next-check__link');
  append(item, 'p', 'next-check__reason', `이유 · ${check.reason}`);
  append(item, 'small', 'next-check__evidence', `근거 ${check.evidenceRefs.join(' · ')}`);
  return item;
}

function renderSynthesis(
  parent: HTMLElement,
  synthesis: SituationSynthesis,
  listeners: Array<() => void>,
): void {
  const section = disclosure(parent, 'situation-synthesis__details executive-analysis', '종합 분석 더보기', listeners);
  append(section, 'h3', undefined, '현재 해석');
  append(section, 'p', 'situation-synthesis__basis', synthesis.interpretationBasis === 'RULE_BASED'
    ? '근거 규칙 기반 해석 · 생성형 추론 아님'
    : '해석 방식 미확인');
  append(section, 'p', 'situation-synthesis__interpretation', synthesis.interpretation);
  if (synthesis.conditionalSuggestion) {
    const suggestion = append(section, 'section', 'situation-synthesis__conditional');
    append(suggestion, 'h3', undefined, '조건부 제안');
    append(suggestion, 'p', undefined, `조건 · ${synthesis.conditionalSuggestion.condition}`);
    appendLink(suggestion, `확인 · ${synthesis.conditionalSuggestion.action}`, synthesis.conditionalSuggestion.deepLink);
    append(suggestion, 'p', undefined, `반대 조건 · ${synthesis.conditionalSuggestion.otherwise}`);
    append(suggestion, 'small', undefined, `근거 ${synthesis.conditionalSuggestion.evidenceRefs.join(' · ')}`);
  }
  append(section, 'h3', undefined, '주의할 불확실성');
  append(section, 'p', 'situation-synthesis__uncertainty', synthesis.uncertainty);

  const expanded = section;
  const blocks = append(expanded, 'div', 'situation-synthesis__grid');
  synthesis.expanded.forEach((block) => {
    const article = append(blocks, 'article', 'situation-synthesis__detail');
    article.dataset.synthesisBlock = block.key;
    append(article, 'h3', undefined, `${block.key}. ${block.title}`);
    append(article, 'p', undefined, block.summary);
    if (block.evidenceRefs.length > 0 || block.deepLinks.length > 0) {
      const evidence = append(article, 'details', 'situation-synthesis__evidence') as HTMLDetailsElement;
      append(evidence, 'summary', undefined, `상세/근거 보기 · ${block.evidenceRefs.length}건`);
      const refs = append(evidence, 'ul');
      block.evidenceRefs.slice(0, 10).forEach((ref) => append(refs, 'li', undefined, ref));
      if (block.evidenceRefs.length > 10) append(evidence, 'small', undefined, `외 ${block.evidenceRefs.length - 10}건`);
      if (block.deepLinks[0]) appendLink(evidence, '원문/관련 화면 열기', block.deepLinks[0], 'situation-synthesis__link');
    }
  });
}

function renderSinceLastCheck(
  parent: HTMLElement,
  comparison: IntelligenceChangeView,
  options: SituationBriefingMountOptions,
  language: string,
): void {
  const labels: Readonly<Record<IntelligenceChangeType, string>> = {
    NEW: '신규', ESCALATED: '확대', DE_ESCALATED: '완화', PERSISTENT: '지속', UNCHANGED: '변화 없음',
    NO_LONGER_OBSERVED: '더 이상 관측되지 않음',
  };
  const confidenceLabels = { LOW: '낮음', MEDIUM: '중간', HIGH: '높음' } as const;
  const section = append(parent, 'section', 'situation-briefing__since');
  section.dataset.sinceLastCheck = '';
  append(section, 'h2', undefined, '마지막 확인 이후');
  const headline = comparison.state === 'FIRST_CHECK'
    ? '첫 확인 · 이전 기준 없음'
    : comparison.topChanges.length
      ? `중요 변화 ${comparison.topChanges.length}건`
      : '마지막 확인 이후 중요 변화 없음';
  append(section, 'strong', undefined, headline);
  const comparisonDetail = append(section, 'details', 'executive-comparison-detail');
  append(comparisonDetail, 'summary', undefined, '비교 기준');
  append(comparisonDetail, 'p', undefined, comparison.state === 'FIRST_CHECK'
    ? '여기까지 확인을 누른 뒤부터 점수·근거·관측 상태의 변화가 기록됩니다.'
    : '저장된 owner checkpoint와 현재 관측의 점수·근거·최신성을 비교했습니다.');
  const checked = formatTime(comparison.lastCheckedAt ?? null, language);
  if (checked) append(comparisonDetail, 'time', undefined, `마지막 확인 ${checked}`);
  if (comparison.topChanges.length) {
    const list = append(section, 'ul');
    comparison.topChanges.forEach((item) => {
      const row = append(list, 'li');
      const title = item.currentState?.title ?? item.previousState?.title ?? item.id;
      append(row, 'strong', undefined, `${labels[item.type]} · ${title}`);
      const previous = item.previousState?.label ?? '이전 관측 없음';
      const current = item.currentState?.label ?? '현재 입력에서 관측되지 않음';
      append(row, 'p', undefined, `이전 ${previous} → 현재 ${current}`);
      append(row, 'small', undefined, `신뢰 ${confidenceLabels[item.confidence]} · 관측 ${formatTime(item.observedAt, language) ?? '시각 미확인'}`);
      if (item.type === 'NO_LONGER_OBSERVED') {
        append(row, 'small', undefined, '관측 중단은 해결을 뜻하지 않습니다. 출처 지연·사용 불가 여부를 먼저 확인하세요.');
      }
    });
  }
  if (options.onMarkChecked) {
    const button = append(section, 'button', 'situation-briefing__mark-checked', '여기까지 확인') as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', options.onMarkChecked, { once: true });
  }
}

function disclosureKey(details: HTMLDetailsElement): string | undefined {
  if (details.dataset.executiveDisclosure) return details.dataset.executiveDisclosure;
  const entry = details.closest<HTMLElement>('[data-briefing-entry]')?.dataset.briefingEntry;
  if (entry) return `${entry}:${details.className}`;
  if (details.classList.contains('situation-synthesis__details')) return 'synthesis';
  if (details.classList.contains('briefing-category--missing')) return 'missing-categories';
  return undefined;
}

export function mountSituationBriefing(
  host: HTMLElement,
  model: SituationBriefingModel,
  options: SituationBriefingMountOptions = {},
): MountedSituationBriefing {
  const listeners: Array<() => void> = [];
  const active = document.activeElement;
  const focusedDisclosure = active instanceof HTMLElement && host.contains(active) && active.matches('summary')
    && active.parentElement instanceof HTMLDetailsElement ? disclosureKey(active.parentElement) : null;
  const openDisclosures = new Set([...host.querySelectorAll<HTMLDetailsElement>('details[open]')]
    .map(disclosureKey).filter((key): key is string => Boolean(key)));
  const language = options.language ?? 'ko';
  const root = document.createElement('details');
  root.dataset.executiveDisclosure = 'global-legacy';
  root.open = openDisclosures.has('global-legacy');
  const counts = new Map<string, number>();
  for (const section of model.sections) {
    const label = SITUATION_AVAILABILITY_LABELS[section.availability];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  append(root, 'summary', 'situation-briefing__legacy-summary', 'GLOBAL/LEGACY HEALTH · ' +
    [...counts].map(([label, count]) => label + ' ' + count + '영역').join(' · ') + ' · 상세 보기');
  append(root, 'p', 'situation-briefing__guardrail', '전 세계·레거시 브리핑의 수집 범위입니다. 개인 투자 핵심 데이터 상태와 별도로 평가합니다.');
  root.className = 'situation-briefing';
  root.dataset.situationBriefing = '';
  root.setAttribute('aria-labelledby', 'situation-briefing-title');
  const header = append(root, 'header', 'situation-briefing__header');
  const heading = append(header, 'div');
  append(heading, 'p', 'situation-briefing__eyebrow', 'GLOBAL RADAR · MYMONITOR CONTROL ROOM');
  append(heading, 'h1', undefined, '오늘의 브리핑').id = 'situation-briefing-title';
  const generated = formatTime(model.generatedAt, language);
  if (generated) append(header, 'time', undefined, `종합 ${generated}`);

  renderExecutiveHeader(root, model.executive);
  renderExecutiveBody(root, model.executive);
  renderSinceLastCheck(root, model.executive.changes, options, language);
  renderSynthesis(root, model.synthesis, listeners);

  const checks = append(root, 'section', 'situation-briefing__next-checks');
  checks.dataset.nextChecks = '';
  append(checks, 'h2', undefined, '다음 확인 제안');
  append(checks, 'p', 'situation-briefing__guardrail', '판단을 돕는 확인 순서이며 자동 매수·매도나 주문 실행을 하지 않습니다.');
  const checkList = append(checks, 'ol', 'next-checks');
  model.synthesis.nextChecks.forEach((check) => checkList.append(renderNextCheck(check)));

  const categories = append(root, 'section', 'situation-briefing__categories');
  append(categories, 'h2', undefined, '영역별 브리핑');
  const grid = append(categories, 'div', 'situation-briefing__grid');
  const byCategory = new Map(model.sections.map((section) => [section.category, section]));
  const missing = document.createElement('details');
  missing.className = 'briefing-category briefing-category--missing';
  append(missing, 'summary', undefined, '데이터가 아직 없는 영역');
  const missingGrid = append(missing, 'div', 'briefing-category__missing-grid');
  VIEW_ORDER.forEach((category) => {
    const section = byCategory.get(category);
    if (!section) return;
    const rendered = renderCategory(section, language, listeners);
    const alwaysVisible = section.category === 'WORLD' || section.category === 'MARKET' || section.category === 'WATCHLIST';
    if (!alwaysVisible && section.availability === 'NO_DATA' && section.entries.length === 0) missingGrid.append(rendered);
    else grid.append(rendered);
  });
  if (missingGrid.childElementCount > 0) grid.append(missing);

  host.replaceChildren(root);
  root.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
    const key = disclosureKey(details);
    if (key && openDisclosures.has(key)) details.open = true;
    if (key && key === focusedDisclosure) details.querySelector('summary')?.focus({ preventScroll: true });
  });
  return {
    destroy(): void {
      listeners.splice(0).forEach((remove) => remove());
      root.remove();
    },
  };
}

export function mountSituationRail(host: HTMLElement, synthesis: SituationSynthesis): void {
  host.replaceChildren();
  append(host, 'h2', undefined, '지금 상황');
  append(host, 'p', 'control-room-now-rail__summary', synthesis.oneLineSituation);
  if (synthesis.importantChanges.length > 0) {
    const list = append(host, 'ul', 'control-room-now-rail__changes');
    synthesis.importantChanges.slice(0, 3).forEach((change) => {
      const item = append(list, 'li');
      appendLink(item, change.title, change.deepLink);
    });
  }
  append(host, 'p', 'control-room-now-rail__uncertainty', synthesis.uncertainty);
  const next = synthesis.nextChecks[0];
  if (next) appendLink(host, `다음: ${next.label}`, next.deepLink, 'control-room-now-rail__next');
}
