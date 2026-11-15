import type { CandidateLedger } from '../../../shared/owner-candidate-contract';
import { candidateView } from './candidate-view';
import type { PublicDiscoverySnapshot } from '../../../shared/owner-discovery-contract';
import { publicEvidenceView } from './public-evidence-view';
import { fxEvidenceView } from './fx-evidence-view';
import { quoteEvidenceView } from './quote-evidence-view';
import { macroEvidenceView } from './macro-evidence-view';
import { OWNER_PREVIEW_NAVIGATION, OWNER_FEATURES, findOwnerFeatures, type OwnerPreviewSection } from '../../config/owner-feature-registry';
import { stockResearchUrl } from '../stock-research/stock-research-route';
import { PREVIEW_STATES, previewProfile, describePreviewInstrument, previewStatePolicy, type PreviewState as State } from './presentation';
export { PREVIEW_STATES } from './presentation';
const SYMBOLS = ['SOXS', 'SOXL', 'CISS', 'KORU'] as const;
const pref = 'mymonitor:preview:favorites:v1';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className)
        node.className = className;
    return node;
}
function action(label: string, fn: () => void) { const b = el('button', label); b.type = 'button'; b.addEventListener('click', fn); return b; }
export function mountOwnerPreview(host: HTMLElement, publicEvidence: PublicDiscoverySnapshot | null = null, candidateLedger: CandidateLedger | null = null): () => void {
    let url = new URL(window.location.href);
    let section: OwnerPreviewSection = 'today', variant = 'A', symbol = 'SOXS', state: State = 'ready', query = '';
    let favorites: string[] = [];
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(pref) || '[]');
        if (Array.isArray(saved))
            favorites = saved.filter((x): x is string => typeof x === 'string' && OWNER_FEATURES.some(f => f.id === x));
    }
    catch { /* Preference loss must not block reading. */ }
    const readUrl = () => { url = new URL(window.location.href); section = OWNER_PREVIEW_NAVIGATION.find(n => n.id === url.searchParams.get('page'))?.id ?? 'today'; variant = url.searchParams.get('layout') === 'B' ? 'B' : 'A'; symbol = /^[A-Z][A-Z0-9.-]{0,14}$/.test(url.searchParams.get('symbol') ?? '') ? url.searchParams.get('symbol')! : 'SOXS'; state = Object.prototype.hasOwnProperty.call(PREVIEW_STATES, url.searchParams.get('state') ?? 'ready') ? url.searchParams.get('state') as State || 'ready' : 'ready'; };
    readUrl();
    const saveUrl = () => { url.searchParams.set('page', section); url.searchParams.set('layout', variant); url.searchParams.set('symbol', symbol); url.searchParams.set('state', state); history.pushState(null, '', url); };
    const change = (fn: () => void) => { fn(); saveUrl(); render(); host.querySelector<HTMLElement>('h1')?.focus(); };
    const card = (title: string, text: string) => { const c = el('article', '', 'card'); c.append(el('h2', title), el('p', text)); return c; };
    const detail = () => {
        const box = el('section', '', 'detail');
        box.setAttribute('aria-label', '종목 판단 샘플');
        box.append(el('span', '설계 샘플 · 실시간 데이터 아님', 'eyebrow'), el('h2', symbol + ' · 판단을 서두르기 전'), el('p', '실제 보유·수량·평가금액은 이 미리보기에 연결하지 않았습니다.', 'muted'));
        const status = el('p', PREVIEW_STATES[state], 'state');
        status.setAttribute('role', 'status');
        box.append(status);
        const policy = previewStatePolicy(state);
        const instrument = describePreviewInstrument(previewProfile(symbol));
        box.append(el('p', policy.message));
        if (policy.blocked) {
            const link = el('a', 'SEC 공식 원문 확인 경로 (분석 근거 아님)');
            link.href = 'https://www.sec.gov/'; link.target = '_blank'; link.rel = 'noopener noreferrer';
            box.append(link, el('p', '원문은 직접 확인할 수 있지만 이 샘플은 수집·재조회하지 않습니다.'));
            return box;
        }
        box.append(card('상품 유형 · ' + instrument.kind, instrument.mechanics));
        if (instrument.condition) box.append(card('조건부 시나리오 · 미확인', instrument.condition + ' 아직 충족 여부를 확인하지 않았으며 판단은 보류합니다.'));
        box.append(card('필요한 추가 근거', instrument.evidence), card('반대 조건·위험 확인', instrument.risk), card('내 포지션에서 아직 모르는 것', '보유 수량과 평가금액을 연결하기 전에는 순노출·축소 비율을 제안하지 않습니다.'));
        const sources = el('details');
        sources.append(el('summary', '근거·시점·원문 펼치기'));
        sources.append(el('p', '샘플 시각: 2026-09-22 14:00 KST (05:00 UTC). 실제 시장 가격과 연결되지 않았습니다.'));
        sources.append(el('p', state === 'translation_fallback' ? 'translation unavailable · 원문 제목: Semiconductor sector update (설계용 가상 제목)' : '한국어 표시 예시 · 검증된 실제 기사 아님'));
        const source = el('a', 'SEC 공식 출처 안내');
        source.href = 'https://www.sec.gov/';
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        sources.append(source, el('p', '위 링크는 출처 종류 안내이며 샘플 가설을 뒷받침하는 실제 공시가 아닙니다.'));
        sources.append(el('p', '기존 종목 경로: ' + stockResearchUrl(symbol) + ' · 운영 화면 이동은 이 미리보기에서 실행하지 않습니다.'));
        box.append(sources);
        return box;
    };
    function render() {
        host.replaceChildren();
        host.className = 'owner-preview layout-' + variant;
        const banner = el('div', publicEvidence ? '공개 SEC snapshot 1건 + ECB FX reference 1건 + SOXL 저장 가격 관측 1건 + DGS10 저장 거시 관측 1건 + 설계 샘플 · Production 실시간 미연결 · 실제 잔고/추천 아님' : '설계 샘플 · Production 미연결 · 실제 잔고/가격/추천 아님', 'banner');
        host.append(banner);
        const header = el('header');
        header.append(el('strong', 'MyMonitor'), el('span', '나의 투자 판단 공간', 'muted'));
        const tools = el('div', '', 'tools');
        for (const [v, label] of [['A', 'A · 오늘의 판단'], ['B', 'B · 종목 작업 공간']]) {
            const b = action(label!, () => change(() => { variant = v!; }));
            b.setAttribute('aria-pressed', String(variant === v));
            tools.append(b);
        }
        const label = el('label', '화면 상태 ');
        const select = el('select');
        select.setAttribute('aria-label', '화면 상태');
        for (const [key, text] of Object.entries(PREVIEW_STATES)) {
            const o = el('option', text);
            o.value = key;
            select.append(o);
        }
        select.value = state;
        select.onchange = () => change(() => { state = select.value as State; });
        label.append(select);
        tools.append(label);
        header.append(tools);
        host.append(header);
        const nav = el('nav');
        nav.setAttribute('aria-label', '주 메뉴');
        for (const n of OWNER_PREVIEW_NAVIGATION) {
            const a = el('a', n.label);
            const u = new URL(url);
            u.searchParams.set('page', n.id);
            a.href = u.pathname + u.search;
            if (n.id === section)
                a.setAttribute('aria-current', 'page');
            a.onclick = e => { e.preventDefault(); change(() => { section = n.id; }); };
            nav.append(a);
        }
        host.append(nav);
        const main = el('main');
        const h = el('h1', OWNER_PREVIEW_NAVIGATION.find(n => n.id === section)!.label);
        h.tabIndex = -1;
        main.append(h);
        if (candidateLedger && ['today', 'invest', 'discover'].includes(section)) main.append(candidateView(candidateLedger, symbol, variant));
        const evidenceHost = candidateLedger ? el('details') : main;
        if (candidateLedger) evidenceHost.append(el('summary', '기존 공개 근거 보존본 비교 · 추출 당시 기준시각'),
            el('p', '아래는 각 원본 snapshot의 추출 당시 평가입니다. 위 후보 결과는 하나의 cutoff에서 재검증했습니다. CISS 공시는 SOXL 후보 입력에서 제외했습니다.'));
        if (publicEvidence?.fxReference && ['today', 'invest', 'discover'].includes(section)) evidenceHost.append(fxEvidenceView(publicEvidence.fxReference));
        if (publicEvidence?.quoteReference && ((symbol === 'SOXL' && ['today', 'invest'].includes(section)) || section === 'discover')) evidenceHost.append(quoteEvidenceView(publicEvidence.quoteReference));
        if (publicEvidence?.macroReference && ['today', 'invest', 'discover'].includes(section)) evidenceHost.append(macroEvidenceView(publicEvidence.macroReference));
        if (publicEvidence && ((symbol === 'CISS' && (section === 'today' || section === 'invest')) || section === 'discover')) evidenceHost.append(publicEvidenceView(publicEvidence));
        if (candidateLedger && ['today', 'invest', 'discover'].includes(section)) main.append(evidenceHost);
        if (section === 'today' || section === 'invest') {
            if (variant === 'A' && section === 'today') {
                main.append(card('오늘, 먼저 확인할 변화', '새로 바뀐 근거 → 내 포지션 영향 → 반대 가설 순서로 확인합니다. 같은 뉴스 요약을 여러 카드에 반복하지 않습니다.'));
                const row = el('div', '', 'context-grid');
                row.append(card('시장 맥락', '직접 지수 · breadth · 금리 · FX를 기준시각과 함께 비교'), card('아직 모르는 것', '직접 근거와 포지션 입력이 연결되지 않아 판단 보류'));
                main.append(row);
            }
            const workspace = el('div', '', 'workspace');
            const list = el('div', '', 'symbols');
            list.setAttribute('aria-label', '종목 선택');
            for (const s of SYMBOLS) {
                const b = action(s, () => change(() => { symbol = s; }));
                b.setAttribute('aria-pressed', String(s === symbol));
                list.append(b);
            }
            workspace.append(list, detail());
            main.append(workspace);
        }
        else if (section === 'discover') {
            main.append(card(candidateLedger ? '전체 종목 탐색 · 미연결 설계 샘플' : '지금의 근거로 후보 찾기', candidateLedger ? '위 결과는 한 종목의 저장 근거만 검증합니다. 전체 종목 탐색·자료 수집·후보 비교는 연결되지 않았습니다.' : '현재 요청 → 기존 자료 확인 → 부족한 자료 수집 → 시점 고정 → 후보 비교. 실제 실행은 아직 연결되지 않았습니다.'));
            const catalog = el('a', '전체 기능에서 연결 범위 확인');
            const target = new URL(url); target.searchParams.set('page', 'all');
            catalog.href = target.pathname + target.search;
            catalog.onclick = e => { e.preventDefault(); change(() => { section = 'all'; }); };
            main.append(el('p', PREVIEW_STATES.unsupported, 'state'), el('p', previewStatePolicy('unsupported').message), catalog, card('후보가 없어도 정상 결과', '연결 이후에는 자료 부족·조건 미충족·일시적 실패를 구분해야 합니다. 네 회귀 종목을 전체 후보군으로 가장하지 않습니다.'));
        }
        else if (section === 'records') {
            main.append(card('당시 판단과 이후 결과', '원본 근거 → 분석 revision → 선정/보류 이유 → 실제 또는 모의 행동 → 결과. 현재는 기록 화면의 구조만 검토합니다.'));
            main.append(card('현재 분석과 이력 분리', 'OUTDATED 분석은 삭제하지 않습니다. 오류 본문은 일반 화면에서 숨기고 감사 이력에 보존합니다.'));
            main.append(detail());
        }
        else {
            const input = el('input');
            input.type = 'search';
            input.placeholder = '기능·목적 검색';
            input.setAttribute('aria-label', '전체 기능 검색');
            input.value = query;
            const result = el('div', '', 'catalog');
            const count = el('p', '', 'muted');
            count.setAttribute('role', 'status');
            const draw = () => { result.replaceChildren(); const found = [...findOwnerFeatures(query)].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id))); count.textContent = found.length + '개 기능 · 운영 검수 결과와 구분'; for (const f of found) {
                const c = card(f.label, f.purpose);
                c.dataset.featureId = f.id;
                c.append(el('span', f.implementation === 'PROPOSED' ? '미연결' : '기존 구현 · 이번 검수 전', 'badge'));
                const more = el('details');
                more.addEventListener('keydown', event => {
                    if (event.key === 'Escape' && more.open) {
                        event.preventDefault(); more.open = false; more.querySelector('summary')?.focus();
                    }
                });
                more.append(el('summary', '연결 범위'), el('p', f.note));
                const b = action(favorites.includes(f.id) ? '즐겨찾기 해제' : '즐겨찾기', () => { favorites = favorites.includes(f.id) ? favorites.filter(x => x !== f.id) : [...favorites, f.id]; try {
                    localStorage.setItem(pref, JSON.stringify(favorites));
                }
                catch { } draw(); result.querySelector<HTMLElement>('[data-feature-id="' + f.id + '"] button')?.focus(); });
                b.setAttribute('aria-label', f.label + ' 즐겨찾기');
                b.setAttribute('aria-pressed', String(favorites.includes(f.id)));
                c.append(b, more);
                result.append(c);
            } };
            input.oninput = () => { query = input.value; draw(); };
            main.append(input, count, result);
            draw();
        }
        const footer = el('footer', '기존 지도·뉴스·위험·학습 기능은 보존합니다. Actual Galaxy Fold: NOT TESTED. MyMonitor is based on World Monitor · AGPL-3.0.');
        main.append(footer);
        host.append(main);
        for (const disclosure of host.querySelectorAll('details')) {
            disclosure.addEventListener('keydown', event => {
                if (event.key === 'Escape' && disclosure.open) {
                    event.preventDefault(); disclosure.open = false;
                    disclosure.querySelector('summary')?.focus();
                }
            });
        }
    }
    const pop = () => { readUrl(); render(); };
    window.addEventListener('popstate', pop);
    render();
    return () => { window.removeEventListener('popstate', pop); host.replaceChildren(); };
}
