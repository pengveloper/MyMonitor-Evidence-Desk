import {
  JASYNQ_EXPORT_CATEGORIES,
  type IntelligenceItem,
  type JasynqExportCategory,
} from '../../shared/intelligence-bridge-contract';
import {
  getJasynqExportSettings,
  getJasynqPreviewStatus,
  jasynqExportCategoryFor,
  jasynqItemRevisionKey,
  loadJasynqExportPreview,
  updateJasynqExportSettings,
  type JasynqExportSettings,
  type JasynqPreviewResult,
} from '@/services/jasynq-export-settings';

export interface JasynqSettingsResult {
  html: string;
  attach: (container: HTMLElement) => () => void;
}

export interface JasynqSettingsHost {
  loadPreview?: (signal?: AbortSignal) => Promise<JasynqPreviewResult>;
}

export function isJasynqBridgeUiEnabled(
  env: Pick<ImportMetaEnv, 'DEV' | 'VITE_MYMONITOR_JASYNQ_BRIDGE_ENABLED'> = import.meta.env,
): boolean {
  return env.DEV === true && env.VITE_MYMONITOR_JASYNQ_BRIDGE_ENABLED === 'true';
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function labelledValue(label: string, value: string): HTMLElement {
  const row = element('div', 'jasynq-preview-meta-item');
  const term = element('span', 'jasynq-preview-meta-label');
  term.textContent = label;
  const detail = element('span', 'jasynq-preview-meta-value');
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function renderInertList(title: string, values: readonly string[]): HTMLElement | null {
  if (values.length === 0) return null;
  const section = element('div', 'jasynq-preview-inert-data');
  const heading = element('div', 'jasynq-preview-inert-title');
  heading.textContent = title;
  const list = element('ul');
  for (const value of values) {
    const item = element('li');
    item.textContent = value;
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function previewCard(
  item: IntelligenceItem,
  settings: JasynqExportSettings,
  onSettingsChanged: () => void,
): HTMLElement {
  const key = jasynqItemRevisionKey(item);
  const displayAllowed = item.usage_policy.display === 'allow';
  const card = element('article', `jasynq-preview-card${item.item_type === 'data_health' ? ' is-data-health' : ''}`);
  card.dataset.itemRevision = key;

  const title = element('h3');
  title.textContent = displayAllowed ? item.title : 'Restricted revision';
  const summary = element('p', 'jasynq-preview-summary');
  summary.textContent = displayAllowed
    ? item.export_summary
    : 'Item content is hidden because its usage policy denies display.';
  const meta = element('div', 'jasynq-preview-meta');
  meta.append(
    labelledValue('Status', getJasynqPreviewStatus(item, settings).replace(/_/g, ' ')),
    labelledValue('Revision', `${item.revision} · ${item.revision_meta.revision_type}`),
    labelledValue('Usage', `${item.usage_policy.storage}/${item.usage_policy.display}`),
    labelledValue('External LLM', item.usage_policy.external_llm),
  );
  if (displayAllowed) {
    meta.prepend(labelledValue('Category', jasynqExportCategoryFor(item) ?? item.category.toUpperCase()));
  }

  if (displayAllowed && item.data_health) {
    meta.append(labelledValue(
      'Data health',
      `${item.data_health.freshness_state} · ${item.data_health.affected_scope.join(', ')}`,
    ));
  }

  const inert = element('details', 'jasynq-preview-inert');
  const inertSummary = element('summary');
  inertSummary.textContent = 'Source data (display only)';
  const checks = displayAllowed
    ? renderInertList('Suggested checks', item.suggested_checks.map((check) => check.text))
    : null;
  const evidence = renderInertList(
    'Evidence excerpts',
    displayAllowed ? item.evidence
      .filter((entry) => entry.usage.display === 'allow' && entry.excerpt)
      .map((entry) => entry.excerpt!) : [],
  );
  if (checks) inert.append(checks);
  if (evidence) inert.append(evidence);
  if (checks || evidence) card.append(title, summary, meta, inert);
  else card.append(title, summary, meta);

  const controls = element('div', 'jasynq-preview-controls');
  const excluded = settings.excluded_item_revisions.includes(key);
  const exclude = element('button', 'btn btn-secondary jasynq-item-exclude');
  exclude.type = 'button';
  exclude.textContent = excluded ? 'Include revision' : 'Exclude revision';
  exclude.addEventListener('click', () => {
    const current = getJasynqExportSettings();
    const next = new Set(current.excluded_item_revisions);
    if (next.has(key)) next.delete(key); else next.add(key);
    updateJasynqExportSettings({ excluded_item_revisions: [...next] });
    onSettingsChanged();
  });

  const snooze = element('button', 'btn btn-secondary jasynq-item-snooze');
  snooze.type = 'button';
  const snoozed = Date.parse(settings.snoozed_item_revisions[key] ?? '') > Date.now();
  snooze.textContent = snoozed ? 'Clear snooze' : 'Snooze 24h';
  snooze.addEventListener('click', () => {
    const current = getJasynqExportSettings();
    const next = { ...current.snoozed_item_revisions };
    if (Date.parse(next[key] ?? '') > Date.now()) delete next[key];
    else next[key] = new Date(Date.now() + 86_400_000).toISOString();
    updateJasynqExportSettings({ snoozed_item_revisions: next });
    onSettingsChanged();
  });

  const label = element('input', 'jasynq-personal-label');
  label.type = 'text';
  label.maxLength = 128;
  label.placeholder = 'Optional personal label';
  label.setAttribute('aria-label', `Personal label for revision ${key}`);
  label.value = settings.personal_labels[key] ?? '';
  label.addEventListener('change', () => {
    const current = getJasynqExportSettings();
    updateJasynqExportSettings({ personal_labels: { ...current.personal_labels, [key]: label.value } });
    onSettingsChanged();
  });

  const note = element('textarea', 'jasynq-user-note');
  note.maxLength = 2_048;
  note.placeholder = 'Optional user note';
  note.setAttribute('aria-label', `User note for revision ${key}`);
  note.value = settings.user_notes[key] ?? '';
  note.addEventListener('change', () => {
    const current = getJasynqExportSettings();
    updateJasynqExportSettings({ user_notes: { ...current.user_notes, [key]: note.value } });
    onSettingsChanged();
  });
  controls.append(exclude, snooze, label, note);
  card.append(controls);
  return card;
}

function parseFilters(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function renderJasynqSettings(host: JasynqSettingsHost = {}): JasynqSettingsResult {
  const settings = getJasynqExportSettings();
  const categoryControls = JASYNQ_EXPORT_CATEGORIES.map((category) => `
    <label class="jasynq-category-option">
      <input type="checkbox" data-jasynq-category="${category}"${settings.allowed_categories.includes(category) ? ' checked' : ''}>
      <span>${category}</span>
    </label>
  `).join('');

  return {
    html: `
      <section class="jasynq-settings" aria-labelledby="jasynq-settings-title">
        <div class="jasynq-settings-header">
          <div>
            <h2 id="jasynq-settings-title">JASYNQ</h2>
            <p>Local producer preview only. No JASYNQ connection, credential, callback, or delivery is configured.</p>
          </div>
          <span class="jasynq-local-badge">DEV · LOCAL</span>
        </div>
        <div class="jasynq-bridge-status" role="status">
          <span>Bridge foundation</span><strong>Local preview</strong>
          <span>Contract</span><strong>INTELLIGENCE-BRIDGE-0.1</strong>
        </div>
        <div class="jasynq-settings-toggle-row">
          <label><input id="us-jasynq-delivery" type="checkbox"${settings.delivery_enabled ? ' checked' : ''}> Export enabled</label>
          <label><input id="us-jasynq-paused" type="checkbox"${settings.paused ? ' checked' : ''}> Pause all exports</label>
        </div>
        <fieldset class="jasynq-category-fieldset">
          <legend>Allowed categories</legend>
          <div class="jasynq-category-grid">${categoryControls}</div>
        </fieldset>
        <div class="jasynq-filter-grid">
          <label>Entity identities <input id="us-jasynq-entities" type="text" value="" placeholder="sec_cik:0001817760, fred_series:DGS10"></label>
          <label>Ticker aliases <input id="us-jasynq-tickers" type="text" value="" placeholder="SMTK, AAPL"></label>
        </div>
        <div class="jasynq-preview-header">
          <div><h3>Recent export preview</h3><p id="us-jasynq-preview-status">Loading local feed…</p></div>
          <button type="button" class="btn btn-secondary" id="us-jasynq-refresh">Refresh preview</button>
        </div>
        <div id="us-jasynq-preview" class="jasynq-preview-list" aria-live="polite"></div>
      </section>
    `,
    attach(container: HTMLElement): () => void {
      const ac = new AbortController();
      let preview: JasynqPreviewResult | null = null;
      let generation = 0;
      const previewRoot = container.querySelector<HTMLElement>('#us-jasynq-preview');
      const previewStatus = container.querySelector<HTMLElement>('#us-jasynq-preview-status');
      const entityInput = container.querySelector<HTMLInputElement>('#us-jasynq-entities');
      const tickerInput = container.querySelector<HTMLInputElement>('#us-jasynq-tickers');
      entityInput!.value = settings.entity_filters.join(', ');
      tickerInput!.value = settings.ticker_filters.join(', ');

      const renderPreview = (): void => {
        if (!previewRoot || !preview) return;
        previewRoot.replaceChildren();
        const current = getJasynqExportSettings();
        for (const item of preview.items) previewRoot.append(previewCard(item, current, renderPreview));
        if (preview.items.length === 0) {
          const empty = element('p', 'jasynq-preview-empty');
          empty.textContent = 'No revisions are currently staged in the local feed.';
          previewRoot.append(empty);
        }
        if (previewStatus) {
          previewStatus.textContent = `${preview.sync_mode.replace(/_/g, ' ')} · epoch ${preview.feed_epoch}${preview.has_more ? ' · more available' : ''}`;
        }
      };

      const load = (): void => {
        const requestGeneration = ++generation;
        if (previewStatus) previewStatus.textContent = 'Loading local feed…';
        (host.loadPreview ?? loadJasynqExportPreview)(ac.signal).then((result) => {
          if (ac.signal.aborted || requestGeneration !== generation) return;
          preview = result;
          renderPreview();
        }).catch((error: unknown) => {
          if (ac.signal.aborted || requestGeneration !== generation) return;
          if (previewRoot) previewRoot.replaceChildren();
          if (previewStatus) previewStatus.textContent = error instanceof Error ? error.message : 'Preview unavailable';
        });
      };

      container.querySelector<HTMLInputElement>('#us-jasynq-delivery')?.addEventListener('change', (event) => {
        updateJasynqExportSettings({ delivery_enabled: (event.currentTarget as HTMLInputElement).checked });
        renderPreview();
      }, { signal: ac.signal });
      container.querySelector<HTMLInputElement>('#us-jasynq-paused')?.addEventListener('change', (event) => {
        updateJasynqExportSettings({ paused: (event.currentTarget as HTMLInputElement).checked });
        renderPreview();
      }, { signal: ac.signal });
      container.querySelectorAll<HTMLInputElement>('[data-jasynq-category]').forEach((input) => {
        input.addEventListener('change', () => {
          const allowed = Array.from(container.querySelectorAll<HTMLInputElement>('[data-jasynq-category]:checked'))
            .map((entry) => entry.dataset.jasynqCategory)
            .filter((entry): entry is JasynqExportCategory => Boolean(entry));
          updateJasynqExportSettings({ allowed_categories: allowed });
          renderPreview();
        }, { signal: ac.signal });
      });
      entityInput?.addEventListener('change', () => {
        updateJasynqExportSettings({ entity_filters: parseFilters(entityInput.value) });
        renderPreview();
      }, { signal: ac.signal });
      tickerInput?.addEventListener('change', () => {
        updateJasynqExportSettings({ ticker_filters: parseFilters(tickerInput.value) });
        renderPreview();
      }, { signal: ac.signal });
      container.querySelector('#us-jasynq-refresh')?.addEventListener('click', load, { signal: ac.signal });
      load();
      return () => ac.abort();
    },
  };
}
