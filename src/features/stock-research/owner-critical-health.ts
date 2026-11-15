import type { OwnerIntelligenceResponse } from '../../../shared/owner-intelligence-contract';
import { formatOwnerTime } from '@/services/owner-display';

export interface OwnerHealthRow { label: string; state: string; detail: string }
export function ownerHealthRows(result: OwnerIntelligenceResponse | null): OwnerHealthRow[] {
  const e = result?.evidence;
  if (!e) return [{ label: '개인 투자 근거', state: 'UNAVAILABLE', detail: '조회 실패 또는 아직 수집되지 않음' }];
  const rows: OwnerHealthRow[] = [];
  const row = (label: string, state: string | undefined, detail: string) => rows.push({ label, state: state ?? 'UNAVAILABLE', detail });
  row('시세', e.market.state, [e.market.provider, e.market.priceBasis, formatOwnerTime(e.market.observedAt)].filter(Boolean).join(' · '));
  row('가격 이력·기술 지표', e.market.technicalObservedAt && e.market.ma20 !== null ? e.market.state : 'PARTIAL',
    '기술 관측 ' + formatOwnerTime(e.market.technicalObservedAt) + ' · 전체 이력 연속성은 별도 검증 필요');
  row('SEC·기업행위·ATM/희석', e.secState, '공시 확인 상태 · 발행 가능성과 실제 발행은 별개');
  row('뉴스 수집', e.newsCoverage?.state, e.newsCoverage ? e.newsCoverage.detail + ' · 수집 ' + formatOwnerTime(e.newsCoverage.fetchedAt) : '수집 상태 미확인');
  const news = result?.story?.newsEventClusters.filter(event => event.kind === 'NEWS') ?? [];
  const freshNews = news.filter(event => event.freshness === 'AVAILABLE');
  const newest = news.map(event => event.publishedAt).filter((value): value is string => !!value).sort().reverse()[0];
  row('뉴스 사건 최신성', freshNews.length ? 'AVAILABLE' : news.length && news.every(event => event.freshness === 'STALE') ? 'STALE' : 'UNAVAILABLE',
    `확인된 사건 ${news.length}개 · 최신 범위 ${freshNews.length}개 · 최근 발행 ${formatOwnerTime(newest)} · 수집 시각과 기사 발행 시각은 별개`);
  for (const id of ['BREADTH_20', 'BREADTH_50', 'BREADTH_200', 'VIXCLS', 'DGS10', 'DFII10', 'DTWEXBGS', 'DCOILWTICO', 'BAMLH0A0HYM2', 'FX_USDKRW']) {
    const value = e.macro.find(item => item.id === id);
    row(({ FX_USDKRW: 'USD/KRW 기준환율', VIXCLS: 'VIX 변동성', DGS10: '미국 10년 명목금리', DFII10: '미국 10년 실질금리', DTWEXBGS: '달러 지수', DCOILWTICO: 'WTI 유가', BAMLH0A0HYM2: '하이일드 스프레드', BREADTH_20: '20일 시장 참여율', BREADTH_50: '50일 시장 참여율', BREADTH_200: '200일 시장 참여율' } as Record<string, string>)[id] ?? id, value?.state,
      value ? value.source + ' · 관측 ' + formatOwnerTime(value.observedAt) : '해당 canonical 관측 없음');
  }
  row('반도체·상품 맥락', e.profile.state === 'AVAILABLE' ? 'PARTIAL' : e.profile.state,
    '상품 식별과 관련 사건 연결 · 독립 반도체 지수의 실시간 관측 충족을 뜻하지 않음');
  row('Toss 포지션', e.position.freshness, (e.position.actualHolding ? '현재 보유' : e.position.state === 'NOT_HELD' ? '현재 보유 없음' : '보유 여부 미확인') + ' · 관측 ' + formatOwnerTime(e.position.observedAt));
  row('계좌 노출 계산', e.portfolio.state === 'COMPLETE' ? 'AVAILABLE' : 'PARTIAL', '수량·통화·평가 근거 충족 범위만 계산');
  row('저장 AI 요약', result?.shortSummary?.status === 'READY' ? result.shortSummary.refreshNeeded ? 'OUTDATED' : 'AVAILABLE' : result?.shortSummary?.status,
    result?.shortSummary?.refreshReason ?? '보존된 입력으로 검증 · 생성 ' + formatOwnerTime(result?.shortSummary?.generatedAt));
  row('저장 심층 분석', result?.briefState === 'CURRENT' ? 'AVAILABLE' : result?.briefState,
    result?.brief ? '당시 근거 재검증 · 생성 ' + formatOwnerTime(result.brief.generatedAt) : '검증된 보존본 없음');
  row('시각·출처 추적', e.fingerprint && e.market.observedAt && e.market.provider ? 'AVAILABLE' : 'PARTIAL',
    '현재 화면과 AI 입력 식별자 공유 · 개별 최신성은 위 항목별로 확인');
  return rows;
}

const labels: Record<string, string> = {
  AVAILABLE: '확인됨', PARTIAL: '일부 확인', STALE: '오래된 관측', UNAVAILABLE: '미확인',
  OUTDATED: '갱신 필요', NOT_ANALYZED: '분석 전', FAILED: '실패', PENDING: '대기',
};
export function renderOwnerHealth(host: HTMLElement, symbols: readonly string[], results: Map<string, OwnerIntelligenceResponse>): void {
  const details = document.createElement('details');
  details.className = 'owner-home__diagnostics'; details.dataset.ownerCriticalHealth = '';
  const summary = document.createElement('summary');
  summary.className = 'owner-home__diagnostics-summary';
  const rows = symbols.flatMap(symbol => ownerHealthRows(results.get(symbol) ?? null));
  const gaps = rows.filter(row => row.state !== 'AVAILABLE').length;
  summary.textContent = 'OWNER-CRITICAL HEALTH · 화면 ' + symbols.length + '종목 · ' + (gaps ? '일부 확인' : '확인된 근거') + ' · 투자 핵심 데이터';
  details.append(summary);
  for (const symbol of symbols) {
    const section = document.createElement('section');
    const heading = document.createElement('h4'); heading.textContent = symbol; section.append(heading);
    const list = document.createElement('dl');
    for (const row of ownerHealthRows(results.get(symbol) ?? null)) {
      const term = document.createElement('dt'); term.textContent = row.label + ' · ' + (labels[row.state] ?? '미확인');
      const definition = document.createElement('dd'); definition.textContent = row.detail;
      list.append(term, definition);
    }
    section.append(list); details.append(section);
  }
  if (!symbols.length) summary.textContent = 'OWNER-CRITICAL HEALTH · 대상 종목 미확인';
  host.append(details);
}
