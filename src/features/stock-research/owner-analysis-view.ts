import { ownerNewsClusters } from './owner-news-clusters';
import type { AnalyzeStockResponse } from '@/generated/client/worldmonitor/market/v1/service_client';

function add(host: HTMLElement, tag: string, text: string): HTMLElement {
  const el = document.createElement(tag); el.textContent = text; host.append(el); return el;
}
function section(host: HTMLElement, title: string, values: string[]): void {
  add(host, 'h3', title);
  const list = document.createElement('ul'); host.append(list);
  for (const value of values) add(list, 'li', value);
}
export function renderOwnerAnalysis(host: HTMLElement, a: AnalyzeStockResponse, actions: { outdated: boolean; refresh(): Promise<void>; deep(): Promise<void> }): void {
  host.replaceChildren();
  add(host, 'h2', `${a.symbol} · 투자 판단 브리핑`);
  const status = add(host, 'p', actions.outdated ? 'OUTDATED · 자료가 바뀌어 이전 해석을 다시 검토해야 합니다.' : a.fallback ? '규칙 기반 근거 요약 · AI 심층 분석 전' : 'AI 해석 · 아래 가격·뉴스와 동일한 저장 근거 사용');
  status.setAttribute('role', 'status');
  if (a.fallback && a.summary.startsWith('심층 분석을 완료하지 못했습니다.')) status.textContent = a.summary;
  add(host, 'p', `자료 조회 ${a.generatedAt || '확인 불가'} · 가격 기준 ${a.priceObservationDate || '확인 불가'} · ${a.marketDataProvider || '출처 확인 불가'}`);
  if (!a.available) {
    section(host, 'NOW · 판단 보류', ['가격·분석 근거를 확보하지 못했습니다. 데이터 공백을 매수·매도 신호로 해석하지 않습니다.']);
  } else {
    const maKnown = Number.isFinite(a.ma20) && a.ma20 > 0;
    const priceKnown = Number.isFinite(a.currentPrice) && a.currentPrice > 0;
    const above = maKnown && priceKnown && a.currentPrice >= a.ma20;
    section(host, 'NOW · 현재', [
      `가격 ${a.currentPrice} ${a.currency} · 기준 대비 ${a.changePercent.toFixed(2)}%`,
      maKnown ? `20일 평균 ${a.ma20.toFixed(2)} 대비 ${above ? '위' : '아래'}. ${above ? '추세 유지 조건을 확인할 구간' : '보유 위험과 추세 회복 여부를 먼저 확인할 구간'}입니다.` : '20일 추세 근거가 부족합니다.',
    ]);
    section(host, 'MARKET REGIME · 확인 범위', [
      `종목 자체 가격 추세: ${a.trendStatus.replace('Strong bull','강한 상승').replace('Weak bull','약한 상승').replace('Strong bear','강한 하락').replace('Weak bear','약한 하락').replace('Bull','상승').replace('Bear','하락').replace('Consolidation','횡보')}`,
      '기초지수·금리·달러·시장 확산도는 이 분석 묶음에 아직 결합되지 않았습니다. 종목 가격 추세를 거시 국면으로 대체하지 않습니다.',
    ]);
    const why: string[] = [];
    const counter: string[] = [];
    if (maKnown) (above ? why : counter).push(`가격이 20일 평균 ${a.ma20.toFixed(2)} ${above ? '위' : '아래'}에 있습니다.`);
    if (Number.isFinite(a.macdBar)) (a.macdBar > 0 ? why : counter).push(`MACD 히스토그램 ${a.macdBar.toFixed(3)}: ${a.macdBar > 0 ? '상승' : '상승 둔화·하락'} 모멘텀 관측.`);
    if (Number.isFinite(a.rsi12)) {
      if (a.rsi12 > 70) counter.push(`RSI(12) ${a.rsi12.toFixed(1)}: 과열 가능성. 상승 추세와 추격 진입의 유리함은 별개입니다.`);
      else if (a.rsi12 < 30) counter.push(`RSI(12) ${a.rsi12.toFixed(1)}: 과매도만으로 반등을 확정할 수 없습니다.`);
    }
    section(host, 'WHY · 가격에서 확인한 근거', why.length ? why : ['현재 가격 지표에서 뚜렷한 상승 근거가 확인되지 않습니다.']);
    section(host, 'COUNTER · 반대 근거와 한계', [...counter, '지표와 뉴스의 동시 발생만으로 가격 변동의 원인을 입증하지 않습니다.', 'SEC 위험·실제 포지션·기초지수와 함께 확인해야 하며, 이 점수는 수익 확률이 아닙니다.']);
    section(host, 'NEXT · 판단을 바꿀 조건', [
      ...(maKnown ? [`20일 평균 ${a.ma20.toFixed(2)}의 ${above ? '이탈' : '회복'}이 다음 거래 세션에도 이어지는지 확인.`] : []),
      ...(a.supportLevels.length ? [`지지 후보 ${a.supportLevels.slice(0,2).map(v=>v.toFixed(2)).join(', ')}의 이탈 여부를 거래량과 함께 확인.`] : []),
      ...(a.resistanceLevels.length ? [`저항 후보 ${a.resistanceLevels.slice(0,2).map(v=>v.toFixed(2)).join(', ')}의 돌파·안착 여부를 확인.`] : []),
      '새 공시·발행·기업행동과 최신 사건 원문을 확인하고, 사실이 달라지면 깊게 분석을 다시 실행.',
    ]);
    const clusters = ownerNewsClusters(a.headlines);
    add(host, 'h3', 'NEWS · 최신 원문과 중복 보도');
    if (!clusters.length) add(host, 'p', '확인된 뉴스가 없습니다. 사건이 없다는 뜻이 아닙니다.');
    for (const cluster of clusters) {
      const article = document.createElement('article'); host.append(article);
      add(article, 'h4', cluster.title);
      const age = cluster.publishedAt ? Date.now() - Date.parse(cluster.publishedAt) : null;
      add(article, 'p', cluster.publishedAt
        ? '발행 ' + cluster.publishedAt + ' · ' + (age !== null && age < 0 ? '미래 시각 — 확인 필요' : age !== null && age > 48 * 3600000 ? '48시간 경과' : '48시간 이내')
        : '발행 시각 확인 불가');
      if (cluster.duplicates > 1) add(article, 'small', '동일 제목 보도 ' + cluster.duplicates + '건 묶음');
      for (const source of cluster.sources) {
        const link = document.createElement('a'); link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = source.name + (source.primary ? ' · SEC 원문' : ' · 보도/출처 확인 필요');
        article.append(link, document.createTextNode(' '));
      }
    }
    add(host, 'small', '제목은 원문입니다. 동일 사건의 다른 제목까지 합치거나 사건별 번역을 완료한 상태는 아닙니다. 깊게 분석에서는 이 원문 묶음의 한국어 해석을 제공합니다.');
    if (!a.fallback) {
      section(host, '깊은 분석 · 모델 해석', [a.ratingSummary || a.summary, a.ratingWhyNow || a.whyNow, a.newsSummary].filter(Boolean));
      section(host, '모델이 제시한 반대 근거', a.ratingRiskFactors);
    }
    add(host, 'p', '정확한 평균 매수가·손익·주문 사유가 제공되지 않은 부분은 추정하지 않습니다. 레버리지·인버스 상품은 상품 자체 가격과 기초지수 방향을 구분합니다.');
  }
  const controls = document.createElement('div'); host.append(controls);
  const buttons: HTMLButtonElement[] = [];
  for (const [label, action] of [['새 정보 확인', actions.refresh], ['깊게 분석', actions.deep]] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.disabled = label === '깊게 분석' && !a.available; buttons.push(button); controls.append(button);
    button.addEventListener('click', async () => {
      buttons.forEach(b => { b.disabled = true; });
      status.textContent = label === '깊게 분석' ? '저장된 동일 근거로 분석 중…' : '캐시를 활용해 새 정보 확인 중…';
      try { await action(); } catch { status.textContent = '조회에 실패했습니다. 다시 시도할 수 있습니다.'; }
      finally { buttons.forEach(b => { b.disabled = b.textContent === '깊게 분석' && !a.available; }); }
    });
  }
  add(host, 'small', '새 정보 확인은 LLM을 호출하지 않습니다. 공급자·분석 캐시가 유지되는 동안 같은 자료가 표시될 수 있습니다. 깊게 분석은 근거별로 재사용합니다.');
}
