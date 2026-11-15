import { renderScan } from '../owner-discovery/scan-view';
export { renderScan } from '../owner-discovery/scan-view';
import type { DiscoveryV2 } from '../../../shared/owner-discovery-v2';
import type { UniverseScan } from '../../../shared/owner-universe-scan-contract';
import { DEFAULT_UNIVERSE, validateUniverse } from '../../../shared/owner-universe';
const element = <T extends keyof HTMLElementTagNameMap>(tag: T, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
export function mountScanPreview(host: HTMLElement) {
  let scan: UniverseScan | null = null;
  let discoveryResult: DiscoveryV2 | undefined;
  let layout: 'A' | 'B' = new URL(location.href).searchParams.get('layout') === 'B' ? 'B' : 'A';
  let selected = new URL(location.href).searchParams.get('symbol') ?? 'SOXL';
  const banner = element('p', '격리 미리보기 · 데이터 출처 확인 중 · 자동 갱신 없음'); banner.className = 'banner';
  const toolbar = element('header'), status = element('p'), content = element('div'); status.setAttribute('role', 'status');
  const render = () => { if (scan) renderScan(content, scan, layout, selected, symbol => { selected = symbol; updateUrl(); render(); content.querySelector('h2')?.scrollIntoView({ block: 'nearest' }); },discoveryResult); };
  const updateUrl = () => { const u = new URL(location.href); u.searchParams.set('layout', layout); u.searchParams.set('symbol', selected); history.pushState(null, '', u); };
  for (const value of ['A', 'B'] as const) { const button = element('button', value === 'A' ? 'A · Home / Today' : 'B · Discovery / Comparison'); button.onclick = () => { layout = value; updateUrl(); render(); }; toolbar.append(button); }
  const settings = element('details'); settings.append(element('summary', '종목군 설정 · 미리보기만 변경'));
  const trade = element('input'), discovery = element('input'); trade.value = DEFAULT_UNIVERSE.trade.join(','); discovery.value = DEFAULT_UNIVERSE.discovery.join(',');
  const tradeLabel = element('label', '집중 종목 '), discoveryLabel = element('label', '검사 종목 5~20개 '); tradeLabel.append(trade); discoveryLabel.append(discovery);
  settings.append(tradeLabel, discoveryLabel, element('p', '시장 맥락은 출처가 확인된 공개 근거입니다. 선택한 주요 종목은 검증된 벤치마크 구성비가 아닙니다. CISS/C3IS/KORU는 회귀 전용입니다.'));
  const load = async (custom: boolean) => {
    status.textContent = 'LOADING · 저장 근거 검사 중';
    try {
      const universe = custom ? validateUniverse({ ...DEFAULT_UNIVERSE, trade: trade.value.split(','), discovery: discovery.value.split(',') }) : null;
      const response = await fetch('/__owner-scan', { method: custom ? 'POST' : 'GET', credentials: 'same-origin', ...(universe ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(universe) } : {}) });
      if (!response.ok) throw Error('SCAN_FAILED');
      const result = await response.json() as { scan: UniverseScan; reused: boolean; discovery?:DiscoveryV2 }; scan = result.scan;discoveryResult=result.discovery;
      banner.textContent = scan.results.some(r => r.dataMode === 'PUBLIC_PROVIDER_READ_THROUGH') ? '격리 미리보기 · 실제 공개 데이터의 고정 시점 배치 · 자동 갱신 없음 · mock 가격 없음' : '격리 미리보기 · 저장 snapshot과 미연결 항목 · 자동 갱신 없음';
      status.textContent = result.reused ? '동일 입력 · 기존 revision 재사용' : '고정 시점 근거 검사 완료 · 이 화면에서는 provider 호출 없음'; render();
    } catch { status.textContent = 'FAILED · 설정 또는 미리보기 연결을 확인하세요. 이전 결과는 그대로 보존합니다.'; }
  };
  const apply = element('button', '이 종목군 검사'); apply.onclick = () => void load(true); settings.append(apply);
  host.append(banner, toolbar, settings, status, content);
  window.addEventListener('popstate', () => { const u = new URL(location.href); layout = u.searchParams.get('layout') === 'B' ? 'B' : 'A'; selected = u.searchParams.get('symbol') ?? 'SOXL'; render(); });
  void load(false);
}
