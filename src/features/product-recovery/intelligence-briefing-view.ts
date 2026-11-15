import type {
  IntelligenceBriefingAction,
  IntelligenceBriefingActionKind,
  IntelligenceBriefingItem,
  IntelligenceBriefingModel,
  IntelligenceBriefingSourceState,
} from './intelligence-briefing-model.ts';
import { getProductLocale } from '@/services/i18n-policy';
import '@/styles/intelligence-briefing.css';

export interface IntelligenceBriefingMountOptions {
  language?: string;
  onAction?: (action: IntelligenceBriefingAction) => void;
  onMarkChecked?: () => void;
}

export interface MountedIntelligenceBriefing {
  destroy(): void;
}

const STATUS_LABELS = {
  AVAILABLE: '최신',
  STALE: '지연',
  UNAVAILABLE: '사용 불가',
  LOADING: '불러오는 중',
} as const;

const AI_SEAMS: ReadonlyArray<{ kind: IntelligenceBriefingActionKind; label: string }> = [
  { kind: 'ASK_AI', label: 'AI에게 물어보기' },
  { kind: 'WHY_IMPORTANT', label: '왜 중요한가?' },
  { kind: 'WATCHLIST_IMPACT', label: '내 종목 영향 보기' },
];

function append(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function validHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function formatTime(value: string | undefined, language: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(getProductLocale(language), {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(timestamp)) + ' UTC';
}

function renderItem(item: IntelligenceBriefingItem, language: string): HTMLElement {
  const row = document.createElement('li');
  row.className = `intelligence-briefing__item intelligence-briefing__item--${item.status.toLowerCase()}`;
  row.dataset.briefingTopic = item.topic;
  row.dataset.briefingStatus = item.status;
  row.dataset.evidenceIds = item.evidenceCardIds.join(',');
  append(row, 'strong', 'intelligence-briefing__item-label', item.label);
  append(row, 'span', 'intelligence-briefing__item-text', item.text);
  const meta = append(row, 'span', 'intelligence-briefing__item-meta');
  if (item.source) append(meta, 'span', undefined, item.source.label);
  const observed = formatTime(item.observedAt ?? item.source?.observedAt, language);
  if (observed) append(meta, 'time', undefined, observed);
  return row;
}

function renderSource(source: IntelligenceBriefingSourceState): HTMLElement {
  const row = document.createElement('li');
  row.dataset.briefingSource = source.key;
  row.dataset.briefingSourceStatus = source.status;
  append(row, 'span', undefined, source.label);
  append(row, 'strong', `intelligence-briefing__status intelligence-briefing__status--${source.status.toLowerCase()}`, STATUS_LABELS[source.status]);
  if (source.source) {
    const provider = append(row, 'small');
    const href = validHref(source.source.href);
    if (href) {
      const link = append(provider, 'a', 'intelligence-briefing__source-link', source.source.label) as HTMLAnchorElement;
      link.href = href;
      const resolved = new URL(href, window.location.origin);
      if (resolved.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noreferrer';
      }
    } else {
      provider.textContent = source.source.label;
    }
  }
  if (source.note) append(row, 'small', 'intelligence-briefing__source-note', source.note);
  return row;
}

function dispatchAction(
  root: HTMLElement,
  action: IntelligenceBriefingAction,
  options: IntelligenceBriefingMountOptions,
): void {
  options.onAction?.(action);
  root.dispatchEvent(new CustomEvent<IntelligenceBriefingAction>('mymonitor:briefing-action', {
    bubbles: true,
    detail: action,
  }));
}

function renderAction(
  root: HTMLElement,
  action: IntelligenceBriefingAction,
  options: IntelligenceBriefingMountOptions,
  removeListeners: Array<() => void>,
): HTMLElement {
  const href = validHref(action.href);
  const control = href ? document.createElement('a') : document.createElement('button');
  control.className = 'intelligence-briefing__action';
  control.textContent = action.label;
  control.dataset.briefingAction = action.kind;
  control.dataset.evidenceIds = action.evidenceCardIds.join(',');
  if (control instanceof HTMLAnchorElement) control.href = href!;
  else control.type = 'button';
  const onClick = (): void => dispatchAction(root, action, options);
  control.addEventListener('click', onClick);
  removeListeners.push(() => control.removeEventListener('click', onClick));
  return control;
}

export function mountIntelligenceBriefing(
  host: HTMLElement,
  model: IntelligenceBriefingModel,
  options: IntelligenceBriefingMountOptions = {},
): MountedIntelligenceBriefing {
  const removeListeners: Array<() => void> = [];
  const language = options.language ?? 'ko';
  const root = document.createElement('section');
  root.className = 'intelligence-briefing';
  root.dataset.intelligenceBriefing = '';
  root.dataset.briefingState = model.state;
  root.setAttribute('aria-labelledby', 'intelligence-briefing-title');

  const header = append(root, 'header', 'intelligence-briefing__header');
  const titleGroup = append(header, 'div');
  append(titleGroup, 'p', 'intelligence-briefing__eyebrow', 'INTELLIGENCE BRIEFING');
  append(titleGroup, 'h2', 'intelligence-briefing__title', '오늘의 브리핑').id = 'intelligence-briefing-title';
  const generated = formatTime(model.generatedAt, language);
  if (generated) append(header, 'time', 'intelligence-briefing__generated', `수집 ${generated}`);

  const body = append(root, 'div', 'intelligence-briefing__body');
  const today = append(body, 'section', 'intelligence-briefing__today');
  today.setAttribute('aria-labelledby', 'intelligence-briefing-today-title');
  append(today, 'h3', 'intelligence-briefing__section-title', '현재 관측').id = 'intelligence-briefing-today-title';
  if (model.state === 'LOADING') {
    const loading = append(today, 'p', 'intelligence-briefing__empty', '세계·시장·기업 데이터를 불러오는 중입니다.');
    loading.setAttribute('role', 'status');
  } else if (model.today.length === 0) {
    append(today, 'p', 'intelligence-briefing__empty', '현재 표시할 관측 항목이 없습니다. 아래 출처 상태를 확인하세요.');
  } else {
    const list = append(today, 'ul', 'intelligence-briefing__items');
    model.today.forEach((item) => list.append(renderItem(item, language)));
  }

  const since = append(body, 'section', 'intelligence-briefing__since-last-check');
  since.dataset.briefingComparison = model.sinceLastCheck.state;
  since.setAttribute('aria-labelledby', 'intelligence-briefing-since-title');
  append(since, 'h3', 'intelligence-briefing__section-title', '지난 확인 이후').id = 'intelligence-briefing-since-title';
  append(since, 'strong', 'intelligence-briefing__comparison-headline', model.sinceLastCheck.headline);
  append(since, 'p', 'intelligence-briefing__comparison-detail', model.sinceLastCheck.detail);
  const lastChecked = formatTime(model.sinceLastCheck.lastCheckedAt, language);
  if (lastChecked) append(since, 'time', 'intelligence-briefing__last-checked', `마지막 확인 ${lastChecked}`);
  if (model.sinceLastCheck.items.length > 0) {
    const list = append(since, 'ul', 'intelligence-briefing__items intelligence-briefing__items--changes');
    model.sinceLastCheck.items.forEach((item) => list.append(renderItem(item, language)));
  }
  if (options.onMarkChecked && model.state !== 'LOADING') {
    const markChecked = append(
      since,
      'button',
      'intelligence-briefing__action intelligence-briefing__mark-checked',
      '여기까지 확인',
    ) as HTMLButtonElement;
    markChecked.type = 'button';
    markChecked.dataset.briefingMarkChecked = '';
    const onMarkChecked = (): void => options.onMarkChecked?.();
    markChecked.addEventListener('click', onMarkChecked);
    removeListeners.push(() => markChecked.removeEventListener('click', onMarkChecked));
  }

  const footer = append(root, 'footer', 'intelligence-briefing__footer');
  const sourceDetails = append(footer, 'details', 'intelligence-briefing__sources');
  append(sourceDetails, 'summary', undefined, '데이터 상태·출처');
  const sourceList = append(sourceDetails, 'ul');
  model.sources.forEach((source) => sourceList.append(renderSource(source)));

  if (model.nextActions.length > 0) {
    const actions = append(footer, 'nav', 'intelligence-briefing__actions');
    actions.setAttribute('aria-label', '다음 확인할 것');
    append(actions, 'strong', 'intelligence-briefing__actions-title', '다음 확인할 것');
    model.nextActions.forEach((action) => actions.append(renderAction(root, action, options, removeListeners)));
  }

  const seams = append(footer, 'div', 'intelligence-briefing__ai-seams');
  seams.setAttribute('aria-label', '향후 지능형 탐색');
  AI_SEAMS.forEach(({ kind, label }) => {
    seams.append(renderAction(root, { kind, label, evidenceCardIds: model.today.flatMap((item) => item.evidenceCardIds) }, options, removeListeners));
  });
  append(seams, 'small', 'intelligence-briefing__ai-note', '현재는 근거 탐색 인터페이스이며 자동 투자 판단을 제공하지 않습니다.');

  host.replaceChildren(root);
  return {
    destroy(): void {
      removeListeners.splice(0).forEach((remove) => remove());
      root.remove();
    },
  };
}
