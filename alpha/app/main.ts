import { mountFieldBriefing } from '../../src/features/global-briefing/field/view.ts';
import { loadServer, loadSynthetic, loadUsgsDirect, requestCollect, type DataMode, type Loaded } from './data.ts';
import { MODE_LABEL, deleteRecord, readRecords, recordFrom, recordMarkdown, saveRecord, savedAtLabel, type SavedRecord } from './records.ts';
import './alpha.css';

// One app, two public run shapes. The host declares which one it is in /alpha-profile.json:
// a static host ships "demo"; the self-hosted server answers "community". The personal run shape
// lives in the private deployment and is not part of this build.
interface Profile { profile: 'demo' | 'community'; usgsLive: boolean }
async function loadProfile(): Promise<Profile> {
  try {
    const value = await (await fetch('./alpha-profile.json', { cache: 'no-store' })).json() as Partial<Profile>;
    return { profile: value.profile === 'community' ? 'community' : 'demo', usgsLive: value.usgsLive === true };
  } catch { return { profile: 'demo', usgsLive: false }; }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
}
function action(label: string, run: () => void): HTMLButtonElement { const b = h('button', label); b.type = 'button'; b.addEventListener('click', run); return b; }

async function start(): Promise<void> {
  const profile = await loadProfile();
  const params = new URLSearchParams(location.search);
  let mode: DataMode = profile.profile === 'community' ? 'server' : profile.usgsLive && params.get('data') === 'usgs' ? 'usgs' : 'synthetic';
  let loaded: Loaded | null = null, busy = false, lastDirectFetch = 0;

  const fieldHost = document.getElementById('alpha-field')!; fieldHost.classList.add('alpha-profile');
  const field = mountFieldBriefing(fieldHost, {});

  // ---- status bar ----
  const bar = h('div', '', 'alpha-bar'); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', '실행 형태와 자료 상태');
  const notice = h('p', '자료를 읽고 있습니다.', 'alpha-notice'); notice.dataset.tone = 'muted';
  const actions = h('div', '', 'alpha-actions');
  const message = h('p', '', 'alpha-message'); message.setAttribute('role', 'status');
  const say = (text: string) => { message.textContent = text; };
  const modes = h('div', '', 'alpha-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '자료 종류');
  const synthetic = action('합성 자료', () => void switchMode('synthetic')), live = action('USGS 실제 자료', () => void switchMode('usgs'));
  if (profile.profile === 'demo' && profile.usgsLive) modes.append(synthetic, live);
  const refresh = action(profile.profile === 'community' ? '지금 수집' : '새로 받기', () => void (profile.profile === 'community' ? collect() : load(true)));
  const save = action('이 사건 기록 저장', saveSelected);
  const openRecords = action('저장한 기록', () => showRecords());
  actions.append(modes, refresh, save, openRecords);
  bar.append(h('strong', profile.profile === 'community' ? 'MyMonitor Alpha · 자체 설치' : 'MyMonitor Alpha · 공개 데모'), notice, actions, message);
  document.getElementById('alpha-bar')!.append(bar);

  function paint(): void {
    synthetic.setAttribute('aria-pressed', String(mode === 'synthetic')); live.setAttribute('aria-pressed', String(mode === 'usgs'));
    refresh.hidden = mode === 'synthetic'; refresh.disabled = busy;
    const count = readRecords(); openRecords.textContent = count === null ? '저장한 기록' : `저장한 기록 ${count.length}`;
    if (loaded) { notice.textContent = loaded.notice.text; notice.dataset.tone = loaded.notice.tone; }
  }
  async function load(manual = false): Promise<void> {
    if (busy) return;
    if (mode === 'usgs' && manual && Date.now() - lastDirectFetch < 60_000) { say('방금 받았습니다. USGS에 부담을 주지 않도록 1분 뒤에 다시 받을 수 있습니다.'); return; }
    busy = true; paint();
    try {
      if (mode === 'usgs') lastDirectFetch = Date.now();
      loaded = mode === 'synthetic' ? loadSynthetic() : mode === 'usgs' ? await loadUsgsDirect() : await loadServer();
      field.update(loaded.update); field.updateSources?.(loaded.sources);
      if (manual) say('');
    } finally { busy = false; paint(); }
  }
  async function switchMode(next: DataMode): Promise<void> {
    if (next === mode || busy) return;
    mode = next; say('');
    const url = new URL(location.href); if (next === 'usgs') url.searchParams.set('data', 'usgs'); else url.searchParams.delete('data');
    history.replaceState(null, '', url);
    await load();
  }
  async function collect(): Promise<void> {
    if (busy) return;
    busy = true; paint(); say('USGS에서 받아 이 서버에 저장하는 중입니다.');
    const result = await requestCollect();
    busy = false; say(result.message); await load();
  }

  // ---- saved records ----
  function saveSelected(): void {
    const eventId = fieldHost.querySelector<HTMLElement>('.gf-detail')?.dataset.eventId;
    const entry = eventId ? loaded?.update.model.entries.find(e => e.id === eventId) : undefined;
    if (!loaded || !entry) { say('먼저 목록이나 지도에서 사건을 선택하세요.'); return; }
    const saved = saveRecord(recordFrom(entry, loaded.update.anchors[entry.id], loaded.mode, loaded.receivedAt));
    say(saved ? `기록을 저장했습니다 · 「${entry.title}」 · '저장한 기록'에서 다시 열 수 있습니다.` : '이 브라우저가 저장을 허용하지 않아 기록하지 못했습니다. 사생활 보호 모드인지 확인하세요.');
    paint();
  }
  const panel = h('dialog', '', 'alpha-panel'); panel.setAttribute('aria-label', '저장한 기록');
  document.getElementById('alpha-records')!.append(panel);
  const setRecordParam = (id: string | null) => { const url = new URL(location.href); if (id) url.searchParams.set('record', id); else url.searchParams.delete('record'); history.replaceState(null, '', url); };
  panel.addEventListener('close', () => { setRecordParam(null); paint(); });
  function frame(title: string, back: boolean): HTMLElement {
    panel.replaceChildren();
    const head = h('header'); const buttons = h('div', '', 'alpha-actions');
    if (back) buttons.append(action('목록', () => showRecords()));
    buttons.append(action('닫기', () => panel.close()));
    head.append(h('h2', title), buttons);
    const body = h('div', '', 'alpha-panel-body'); panel.append(head, body);
    if (!panel.open) panel.showModal();
    return body;
  }
  function download(record: SavedRecord): void {
    const link = h('a'); link.href = URL.createObjectURL(new Blob([recordMarkdown(record)], { type: 'text/markdown;charset=utf-8' }));
    link.download = `mymonitor-record-${record.savedAt.slice(0, 10)}-${record.id}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5_000);
  }
  function showRecords(): void {
    setRecordParam(null);
    const body = frame('저장한 기록', false), records = readRecords();
    body.append(h('p', '기록은 이 브라우저에만 저장됩니다. 다른 기기나 브라우저로 옮겨지지 않으며, 브라우저 저장소를 지우면 사라집니다.', 'alpha-meta'));
    if (records === null) { body.append(h('p', '이 브라우저의 저장소를 읽지 못했습니다. 기록이 없다는 뜻이 아닙니다.')); return; }
    if (!records.length) { body.append(h('p', '저장한 기록이 없습니다. 사건을 선택한 뒤 ‘이 사건 기록 저장’을 누르면 여기에 쌓입니다.')); return; }
    const list = h('ul', '', 'alpha-record-list');
    for (const record of records) {
      const item = h('li'); const rowActions = h('div', '', 'alpha-row-actions');
      rowActions.append(action('열기', () => showRecord(record.id)), action('내보내기', () => download(record)),
        action('삭제', () => { say(deleteRecord(record.id) ? `기록을 삭제했습니다 · 「${record.title}」` : '기록을 삭제하지 못했습니다.'); showRecords(); }));
      item.append(h('span', record.title), h('small', `${savedAtLabel(record)} 저장 · ${MODE_LABEL[record.mode]}`), rowActions); list.append(item);
    }
    body.append(list);
  }
  function showRecord(id: string): void {
    const record = readRecords()?.find(r => r.id === id);
    if (!record) { const body = frame('저장한 기록', true); body.append(h('p', '이 주소의 기록을 이 브라우저에서 찾지 못했습니다. 다른 브라우저에서 저장했거나 삭제된 기록입니다.')); return; }
    setRecordParam(id);
    const body = frame(record.title, true);
    body.append(h('p', `${savedAtLabel(record)}에 저장한 사본입니다. 이후 자료가 바뀌어도 이 기록은 갱신되지 않습니다.`, 'alpha-frozen'), h('p', MODE_LABEL[record.mode], 'alpha-meta'));
    body.append(h('h3', '자료 요약'), h('p', record.summary));
    if (record.facts.length) { const facts = h('ul'); for (const fact of record.facts) facts.append(h('li', fact)); body.append(h('h3', '발표된 내용'), facts); }
    body.append(h('h3', '왜 볼 만한가'), h('p', record.whyImportant || '기록 없음'), h('h3', '아직 확인되지 않은 것'), h('p', record.uncertainty || '기록 없음'));
    if (record.nextCheck) body.append(h('h3', '다음 확인'), h('p', record.nextCheck));
    const foot = h('div', '', 'alpha-actions'); foot.append(action('Markdown으로 내보내기', () => download(record)));
    if (record.sourceHref) { const link = h('a', `${record.sourceLabel ?? '출처'} 원문 열기`, 'alpha-button'); link.href = record.sourceHref; link.target = '_blank'; link.rel = 'noopener noreferrer'; foot.append(link); }
    body.append(h('h3', '내보내기와 출처'), foot);
  }

  await load();
  const resume = params.get('record'); if (resume) showRecord(resume);
  // The self-hosted server may collect on its own schedule; re-read its store now and then. No provider is contacted from here.
  if (profile.profile === 'community') setInterval(() => { if (!panel.open) void load(); }, 5 * 60_000);
}
void start();
