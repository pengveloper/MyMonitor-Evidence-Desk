import { COMPANY_RISK_TAG, semiconductorSignals } from './owner-exposure-signals';
import type { OwnerBehaviorContext, OwnerEvent, OwnerIntelligenceEvidence, OwnerInstrumentProfile, OwnerJudgment, OwnerObservation, OwnerPortfolioContext, OwnerPositionContext, EvidenceState } from './owner-intelligence-contract';

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function decimal(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 128 && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}
export function iso(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = typeof value === 'number' ? value : Date.parse(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? value : null;
  }
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}
export function freshness(at: string | null, now: number, maxHours: number): EvidenceState {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t) || t > now + 60_000) return 'UNAVAILABLE';
  return now - t > maxHours * 3_600_000 ? 'STALE' : 'AVAILABLE';
}
export function safeSourceUrl(value: unknown): string | null {
  try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function primarySource(value: string): boolean {
  const host = new URL(value).hostname;
  return host === 'sec.gov' || host.endsWith('.sec.gov');
}
export function ownerPosition(symbol: string, holdingsValue: unknown, universeValue: unknown, healthValue: unknown, now: number): OwnerPositionContext {
  const holdings = record(holdingsValue), universe = record(universeValue), health = record(healthValue);
  const positions = Array.isArray(holdings.holdings) ? holdings.holdings : [];
  const holding = record(positions.find(p => record(p).symbol === symbol));
  const entries = Array.isArray(universe.entries) ? universe.entries : [];
  const entry = record(entries.find(p => record(p).symbol === symbol));
  const at = iso(holding.observedAt ?? holdings.observedAt);
  const actual = decimal(holding.quantity) !== null && Number(holding.quantity) !== 0;
  const authoritative = holdings.schemaVersion === 'tossinvest-owner-portfolio/v1' && at !== null;
  return {
    actualHolding: authoritative ? actual : entry.actualHolding === true,
    recentlyTraded: entry.recentlyTraded === true,
    assetClass: entry.assetClass === 'ETF' || entry.assetClass === 'EQUITY' ? entry.assetClass : 'UNKNOWN',
    priority: actual ? 1 : authoritative && entry.actualHolding === true ? 4 : finite(entry.priority) ?? 4,
    state: actual ? 'OPEN' : authoritative ? 'NOT_HELD' : typeof entry.positionState === 'string' ? entry.positionState : 'UNKNOWN',
    observedAt: at,
    freshness: health.holdings === 'STALE' ? 'STALE' : freshness(at, now, 24),
    quantity: decimal(holding.quantity), averageCost: decimal(holding.averageAcquisitionPrice),
    currency: typeof holding.currency === 'string' ? holding.currency.slice(0, 8) : null,
    unrealizedPnl: decimal(holding.unrealizedPnlAmount), unrealizedPnlPercent: decimal(holding.unrealizedPnlPercent),
    historyComplete: record(health.backfillProgress).complete === true,
  };
}

function boundedText(value: unknown, max = 300): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Canonical metadata wins; name parsing is a transparent fallback, never a ticker rule. */
export function ownerInstrumentProfile(
  supplementValue: unknown,
  position: OwnerPositionContext,
): OwnerInstrumentProfile {
  const supplement = record(supplementValue), source = record(supplement.profile);
  const name = boundedText(source.name);
  const type = boundedText(source.type)?.toUpperCase() ?? '';
  const combined = [name, boundedText(source.category), boundedText(source.description, 1_200)].filter(Boolean).join(' ');
  const assetClass = /ETF|EXCHANGE TRADED FUND/.test(type) || /\bETF\b/i.test(combined)
    ? 'ETF'
    : /COMMON STOCK|EQUITY|ADR/.test(type)
      ? 'EQUITY'
      : position.assetClass;
  const leverage = /\b([1-9](?:\.\d+)?)\s*[xX]\b/.exec(combined);
  const leverageMultiple = leverage ? Number(leverage[1]) : null;
  const leverageDirection: OwnerInstrumentProfile['leverageDirection'] = /\b(inverse|bear|short)\b/i.test(combined)
    ? 'INVERSE'
    : leverageMultiple !== null && /\b(bull|long)\b/i.test(combined)
      ? 'LONG'
      : assetClass === 'ETF' && leverageMultiple === null ? 'UNLEVERAGED' : 'UNKNOWN';
  const dailyReset = assetClass === 'ETF' && leverageMultiple !== null
    ? /\bdaily\b/i.test(combined) || null
    : assetClass === 'ETF' ? null : false;
  // A fund category describes exposure; it does not identify its official index.
  const underlying = boundedText(source.indexName);
  const monitorDimensions: string[] = [];
  if (assetClass === 'ETF') {
    if (/semiconductor/i.test(combined)) monitorDimensions.push('반도체 상대강도·지수 확산도');
    else if (underlying) monitorDimensions.push(`${underlying} 상대강도`);
    else monitorDimensions.push('기초지수 상대강도');
    monitorDimensions.push('실질금리·달러', 'VIX·시장 확산도');
    if (leverageMultiple !== null) monitorDimensions.push('일일 재설정·경로 손실', '거래량·괴리와 리밸런싱');
  } else {
    monitorDimensions.push('SEC 발행·희석 공시', '상장유지·분할·기업행동', '유동성·거래량·변동성');
    if (/shipping|maritime|vessel|tanker|dry bulk/i.test(combined)) {
      monitorDimensions.push('운임·선박 가동률', '연료비·신용·유동성');
    } else monitorDimensions.push('산업 수요·원가', '금리·달러·신용 환경');
  }
  const limitations: string[] = [];
  if (boundedText(source.sourceLimitation, 500)) limitations.push(String(source.sourceLimitation).slice(0, 500));
  if (!name) limitations.push('정식 종목명을 공급자 자료에서 확인하지 못했습니다.');
  if (assetClass === 'ETF' && !underlying) limitations.push('공식 기초지수 미확인: 상품 분류를 지수 이름으로 대신하지 않습니다.');
  if (assetClass === 'ETF' && leverageMultiple === null) limitations.push('공식 투자목표에서 레버리지 배수를 확인하지 못했습니다.');
  if (assetClass === 'UNKNOWN') limitations.push('자산 유형을 확인하지 못했습니다.');
  return {
    state: name ? 'AVAILABLE' : supplement.state === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'UNAVAILABLE',
    name,
    assetClass,
    exchange: boundedText(source.exchange, 80),
    sector: boundedText(source.sector, 120),
    geography: boundedText(source.country, 120),
    underlying,
    leverageMultiple,
    leverageDirection,
    dailyReset,
    monitorDimensions: [...new Set(monitorDimensions)].slice(0, 5),
    limitations,
    sourceUrl: safeSourceUrl(source.sourceUrl) ?? undefined,
    observedAt: iso(source.observedAt),
  };
}

function decimalNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ownerPortfolio(holdingsValue: unknown): OwnerPortfolioContext {
  const holdings = record(holdingsValue);
  const rows = (Array.isArray(holdings.holdings) ? holdings.holdings : []).map(record);
  const bySymbol = (symbol: string) => rows.find(row => row.symbol === symbol && (decimalNumber(row.quantity) ?? 0) !== 0);
  const soxl = bySymbol('SOXL'), soxs = bySymbol('SOXS');
  const notional = (row: Record<string, unknown> | undefined): number | null => {
    if (!row) return null;
    const direct = decimalNumber(row.valuationAmount);
    if (direct !== null) return Math.abs(direct);
    const quantity = decimalNumber(row.quantity), price = decimalNumber(row.currentPrice);
    return quantity !== null && price !== null ? Math.abs(quantity * price) : null;
  };
  const longValue = notional(soxl), inverseValue = notional(soxs);
  const longLeveraged = longValue === null ? null : longValue * 3;
  const inverseLeveraged = inverseValue === null ? null : inverseValue * 3;
  const longCurrency = boundedText(soxl?.currency, 8), inverseCurrency = boundedText(soxs?.currency, 8);
  const sameCurrency = Boolean(longCurrency && inverseCurrency && longCurrency === inverseCurrency);
  const known = longLeveraged !== null && inverseLeveraged !== null && sameCurrency;
  const gross = known ? longLeveraged + inverseLeveraged : null;
  const net = known ? longLeveraged - inverseLeveraged : null;
  const largest = known ? Math.max(longLeveraged, inverseLeveraged) : 0;
  const currencies = [...new Set([boundedText(soxl?.currency, 8), boundedText(soxs?.currency, 8)].filter(Boolean))];
  const pair = Boolean(soxl && soxs);
  return {
    state: !pair ? 'UNKNOWN' : known && currencies.length === 1 ? 'COMPLETE' : 'PARTIAL',
    hasSoxlSoxsPair: pair,
    currency: currencies.length === 1 ? currencies[0]! : null,
    longSemiconductorLeveragedNotional: sameCurrency ? longLeveraged : null,
    inverseSemiconductorLeveragedNotional: sameCurrency ? inverseLeveraged : null,
    netDirectionalExposure: net,
    grossLeveragedExposure: gross,
    offsetRatio: known && largest > 0 ? Math.min(longLeveraged, inverseLeveraged) / largest : null,
    observations: pair ? [
      'SOXL + SOXS 동시 보유: 같은 반도체 지수에 서로 반대 방향의 일일 노출을 갖습니다.',
      '일일 재설정으로 여러 날의 결과는 변동 경로와 리밸런싱에 따라 달라집니다. 동시 보유만으로 손실이나 무위험을 단정할 수 없습니다.',
      '양쪽을 함께 유지하거나 비중을 맞추면 거래비용·보유비용이 커질 수 있습니다.',
      known ? '같은 통화의 브로커 평가금액 × 일일 목표 배수에 따른 근사치입니다. 세금·수수료·장중 체결 차이는 포함하지 않습니다.' : '수량·평가금액 또는 동일 통화가 확인되지 않아 순·총 노출을 계산하지 않습니다.',
    ] : [],
  };
}
export function ownerBehavior(value: unknown, historyComplete: boolean): OwnerBehaviorContext {
  const b = record(value), basis = record(b.basis), quality = record(b.dataQuality);
  const sampleCount = Math.max(0, finite(quality.defensibleRealizedEpisodeCount) ?? 0);
  const eligible = b.schemaVersion === 'owner-behavior/v1' && historyComplete && sampleCount >= 10;
  const facts: string[] = [];
  const limitations = ['거래 기록은 행동 사실입니다. 매매 동기나 인과관계를 입증하지 않습니다.', '관찰 표본의 기술통계이며 미래 성과나 통계적 유의성을 뜻하지 않습니다.'];
  if (!historyComplete) limitations.push('주문 이력 수집이 미완료여서 행동 패턴 해석을 보류합니다.');
  if (sampleCount < 10) limitations.push(`완결된 성과 표본 ${sampleCount}건: 최소 10건 미달.`);
  if (eligible) {
    const wins = finite(b.wins), losses = finite(b.losses);
    if (wins !== null && losses !== null) facts.push(`관측된 완결 거래: 이익 ${wins}건, 손실 ${losses}건.`);
    if (finite(b.tradeFrequencyPer30Days) !== null) facts.push(`30일 환산 거래 빈도 ${Number(b.tradeFrequencyPer30Days).toFixed(1)}회.`);
    if (finite(b.averageHoldingDurationMs) !== null) facts.push(`관측 보유기간 평균 ${(Number(b.averageHoldingDurationMs) / 86_400_000).toFixed(1)}일.`);
    if (finite(b.medianHoldingDurationMs) !== null) facts.push(`관측 보유기간 중앙값 ${(Number(b.medianHoldingDurationMs) / 86_400_000).toFixed(1)}일.`);
    if (finite(b.soxlSoxsSwitchCount) !== null) facts.push(`SOXL/SOXS 전환 기록 ${b.soxlSoxsSwitchCount}회. 전환 이유는 기록되지 않았습니다.`);
    if (finite(b.reentryCount) !== null) facts.push(`재진입 기록 ${b.reentryCount}회.`);
    if (finite(b.addToPositionCount) !== null) facts.push(`포지션 추가 기록 ${b.addToPositionCount}회.`);
    if (finite(b.winnerAverageHoldingDurationMs) !== null && finite(b.loserAverageHoldingDurationMs) !== null) {
      facts.push(`이익 거래 평균 보유 ${(Number(b.winnerAverageHoldingDurationMs) / 86_400_000).toFixed(1)}일 · 손실 거래 평균 보유 ${(Number(b.loserAverageHoldingDurationMs) / 86_400_000).toFixed(1)}일.`);
    }
    const expectancy = record(b.realizedExpectancyByCurrency);
    for (const [currency, value] of Object.entries(expectancy).slice(0, 3)) {
      if (decimal(value) !== null) facts.push(`실현 기대값 ${currency} ${value} (완결 거래 표본 기준).`);
    }
    if (finite(basis.executionCount) !== null) facts.push(`집계 체결 ${basis.executionCount}건.`);
  }
  return { eligible, sampleCount, generatedAt: iso(b.generatedAt), facts, limitations };
}
export function fredObservation(id: string, label: string, value: unknown, now: number): OwnerObservation {
  const s = record(record(value).series);
  const rows = (Array.isArray(s.observations) ? s.observations : []).map(record)
    .filter(r => finite(r.value) !== null && iso(r.date) !== null && Date.parse(String(r.date)) <= now)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = rows[rows.length - 1], prior = rows[rows.length - 2], observedAt = iso(last?.date);
  return { id, label, value: finite(last?.value), previous: finite(prior?.value), previousObservedAt: iso(prior?.date), unit: typeof s.units === 'string' ? s.units : '', observedAt,
    source: 'FRED', url: `https://fred.stlouisfed.org/series/${id}`, state: freshness(observedAt, now, 120), basis: 'DAILY_MACRO',
    limitation: '통계 관측일입니다. 발표일·당시 공개본은 별도 확인이 필요합니다.' };
}

function protectedTokens(text: string): string[] {
  // Korean particles may directly follow a preserved ticker/form/number.
  return [...text.matchAll(/(?<![A-Za-z0-9])(?:[SF]-[13]|[68]-K|10-[KQ]|20-F|424B\d|[A-Z]{2,6}|[+−-]?\d+(?:[.,]\d+)*(?:%|x)?)(?![A-Za-z0-9])/g)].map(m => m[0]).sort();
}
/** Translation is accepted only when symbols, numbers and filing forms survive. */
export function validKoreanTranslation(original: string, translated: unknown): translated is string {
  return typeof translated === 'string' && translated.length <= 1000 && /[가-힣]/.test(translated)
    && JSON.stringify(protectedTokens(original)) === JSON.stringify(protectedTokens(translated));
}
/** A bad translation cannot suppress valid siblings; ambiguous duplicate IDs fail per event. */
export function acceptedOwnerTranslations(events: OwnerEvent[], translations: unknown): Array<{ id: string; titleKo: string }> {
  const rows = Array.isArray(translations) ? translations.map(record) : [];
  return events.flatMap(event => {
    const matches = rows.filter(row => row.id === event.id);
    return matches.length === 1 && validKoreanTranslation(event.title, matches[0]!.titleKo)
      ? [{ id: event.id, titleKo: matches[0]!.titleKo }] : [];
  });
}
/** Ticker text alone can match another issuer (KORU Medical is KRMD, not KORU ETF). */
export function relevantOwnerEvent(symbol: string, event: OwnerEvent): boolean {
  if (event.kind !== 'NEWS') return true;
  return relevantOwnerHeadline(symbol, event.title)
    && (event.scope !== 'INDIRECT' || relevantOwnerRelatedHeadline(event.relatedSymbol, event.title));
}
/** A provider ticker tag alone is not evidence that an indirect article concerns that issuer. */
export function relevantOwnerRelatedHeadline(symbol: string | undefined, title: string): boolean {
  if (symbol === 'NVDA') return /\bNVDA\b|\bNvidia\b|엔비디아/i.test(title);
  if (symbol === 'AMD') return /\bAMD\b|Advanced Micro Devices|어드밴스드 마이크로/i.test(title);
  if (symbol === 'EWY') return /\bEWY\b|\bKorea(?:n)?\b|한국|대한민국/i.test(title)
    && !/koru medical|\bKRMD\b|infusion/i.test(title);
  return true;
}
export function relevantOwnerHeadline(symbol: string, title: string): boolean {
  // Evergreen quote/catalog pages are not newly reported owner events.
  if (/\bprice\b.{0,80}\btoday\s*[|:–-].{0,100}\b(?:live price|market cap|chart)\b/i.test(title)) return false;
  if (/\bstock price,\s*(?:quote|news)\s*[,&]\s*(?:news|analysis)\b/i.test(title)
    || /\binstitutional ownership\s+20\d{2}\s*(?:[-|–].*)?$/i.test(title)) return false;
  // Broker product announcements and personal posts do not establish a fund catalyst.
  if (/\b(?:launch(?:es|ed)?|introduc(?:es|ed|ing))\b.{0,120}\bCFDs?\b/i.test(title)) return false;
  if (/\b(?:bStocks?|tokenized)\b/i.test(title) && /\b(?:distribution|dividend|support)\b/i.test(title)) return false;
  if (/\bsold too early\b/i.test(title) && !/\b(?:earnings|revenue|guidance|filing)\b/i.test(title)) return false;
  if (['SOXL', 'SOXS'].includes(symbol) && /\b(?:red|white) sox\b|\bbaseball\b|\bMLB\b/i.test(title)
    && !/\bSOX[LS]\b|semiconductor|chip stocks|반도체/i.test(title)) return false;
  if (symbol === 'KORU' && /koru medical|infusion|freedom infusion|\bKRMD\b/i.test(title)
    && !/south korea|korean equities|direxion daily south/i.test(title)) return false;
  return true;
}

export function clusterOwnerEvents(items: OwnerEvent[]): OwnerEvent[] {
  const groups: OwnerEvent[] = [];
  const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(t => t.length > 2));
  for (const item of items.slice(0, 120)) {
    const title = item.title.normalize('NFKC').trim();
    if (!title) continue;
    const t = tokens(title);
    const match = groups.find(g => {
      if ((g.translation === 'POLICY_BLOCKED') !== (item.translation === 'POLICY_BLOCKED')) return false;
      if (g.kind !== item.kind || g.form !== item.form || g.publishedAt?.slice(0, 10) !== item.publishedAt?.slice(0, 10)) return false;
      if (item.kind === 'SEC' && item.sources.some(s => s.primary && /\/Archives\/edgar\/data\//i.test(s.url) && g.sources.some(t => t.url === s.url))) return true;
      if (JSON.stringify(protectedTokens(g.title)) !== JSON.stringify(protectedTokens(title))) return false;
      if (g.title.toLowerCase() === title.toLowerCase()) return true;
      const gt = tokens(g.title), intersection = [...t].filter(x => gt.has(x)).length;
      return t.size >= 6 && gt.size >= 6 && intersection / new Set([...t, ...gt]).size >= 0.85;
    });
    if (!match) groups.push({ ...item, title, sources: [...item.sources], tags: [...item.tags] });
    else {
      match.duplicateCount += item.duplicateCount;
      for (const s of item.sources) if (!match.sources.some(x => x.url === s.url)) match.sources.push(s);
      match.tags = [...new Set([...match.tags, ...item.tags])];
      if (item.excerpt && item.excerpt !== match.excerpt) match.excerpt = [match.excerpt, item.excerpt].filter(Boolean).join(' / ').slice(0, 3200);
    }
  }
  return groups.sort((a, b) => Number(a.scope === 'INDIRECT') - Number(b.scope === 'INDIRECT')
    || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 30);
}

export function ownerJudgment(e: Omit<OwnerIntelligenceEvidence, 'judgment'>): OwnerJudgment {
  const m = e.market, position = e.position;
  const drivers: string[] = [], counterevidence: string[] = [], changes: string[] = [], nextChecks: string[] = [];
  const usable = m.state === 'AVAILABLE' && m.price !== null;
  const below = usable && m.ma20 !== null && m.price! < m.ma20;
  if (usable) {
    drivers.push(`${e.symbol} ${m.price} ${m.currency}; ${m.changePercent === null ? '비교 수익률 미확인' : `관측 기준 변화 ${m.changePercent}%`}.`);
    if (m.ma20 !== null) {
      (below ? counterevidence : drivers).push(`현재 가격 ${m.price} ${m.currency} · 20일 이동평균 ${m.ma20} ${m.currency} ${below ? '아래' : '위'}입니다.`);
      changes.push(`20일 이동평균 ${m.ma20} ${m.currency}의 ${below ? '회복' : '이탈'}과 다음 세션 유지 여부.`);
    }
  } else nextChecks.push('현재 시세가 없거나 오래돼 장중 진입 가격을 제시하지 않습니다. 기업·거시 설명은 계속 확인할 수 있습니다.');
  const secRisks = e.events.filter(x => x.scope !== 'INDIRECT' && ((x.kind === 'SEC' && (e.symbol === 'CISS' || x.tags.some(tag => COMPANY_RISK_TAG.test(tag)))) || (e.symbol === 'CISS' && x.kind === 'CORPORATE_ACTION')));
  for (const risk of secRisks.slice(0, 3)) counterevidence.unshift(`공시 확인: ${risk.form ?? ''} ${risk.titleKo ?? risk.title} (${risk.publishedAt ?? '시각 미확인'}). 발행 가능성과 실제 발행은 구분해야 합니다.`);
  if (secRisks.length) changes.unshift('공식 공시의 발행 조건·실제 발행 여부·상장유지 시한을 먼저 확인합니다. 기존 주주 영향이 확인되면 보유·신규 진입 조건을 다시 검토합니다.');
  const vix = e.macro.find(x => x.id === 'VIXCLS');
  if (vix?.state === 'AVAILABLE' && vix.value !== null && vix.previous !== null && vix.value > vix.previous) {
    (e.symbol === 'CISS' ? nextChecks : counterevidence).push(`시장 맥락 · VIX ${vix.previous} → ${vix.value} (${vix.observedAt}): 관측 변동성 상승. 주가 반등을 뜻하지 않습니다.${e.profile.dailyReset === true ? ' 이 상품의 일일 재설정 위험도 함께 점검합니다.' : ' 해당 기업의 유동성과 가격 반응은 별도로 확인합니다.'}`);
  }
  const breadth = e.macro.find(x => x.id === 'BREADTH_50');
  if (breadth?.state === 'AVAILABLE' && breadth.value !== null) nextChecks.push(`50일 평균 위 종목 비중 ${breadth.value}% (${breadth.observedAt}). ${breadth.limitation ?? '저장된 시장 표본의 종가 확산도입니다.'} 업종 흐름과 역방향 상품의 수익 방향을 구분해 비교합니다.`);
  for (const x of e.macro.filter(x => ['DGS10', 'DFII10', 'DCOILWTICO', 'FX_USDKRW'].includes(x.id) && x.state === 'AVAILABLE')) {
    if (x.previous === null || x.previous === x.value) continue;
    nextChecks.push(`${x.label} ${x.previous} → ${x.value} ${x.unit} (${x.observedAt}). ${x.id === 'DCOILWTICO' ? '공급 차질·수요 개선·통화 요인을 구분해 관련 산업 영향을 확인합니다.' : '같은 기간 가격과 비교해야 하며 이 변화만으로 상승·하락 원인을 단정하지 않습니다.'}`);
  }
  const exposureSignals = semiconductorSignals(e);
  for (const signal of exposureSignals) (signal.direction === 'SUPPORTIVE' ? drivers : counterevidence).unshift(signal.detail);
  const freshEvents = e.events.filter(x => x.publishedAt && Date.parse(e.collectedAt) - Date.parse(x.publishedAt) <= 48 * 3_600_000);
  const freshEvent = (e.symbol === 'KORU' ? freshEvents.find(x => x.scope !== 'INDIRECT') : undefined) ?? freshEvents[0];
  if (freshEvent && !secRisks.includes(freshEvent) && !exposureSignals.some(signal => signal.id.endsWith(freshEvent.id))) nextChecks.push(`방향 미확인 사건: ${freshEvent.titleKo ?? freshEvent.title}. 원문 시각과 가격 변화의 순서를 대조해야 합니다.`);
  if (e.secState !== 'AVAILABLE' && e.profile.assetClass !== 'ETF') nextChecks.push('SEC 자료가 미확인이므로 다음 원문 공시를 확인합니다.');
  if (e.shortOptions.state !== 'AVAILABLE') nextChecks.push('옵션·공매도 관측 미확인: 수급 원인 설명은 해당 자료가 들어올 때 확인합니다.');
  const positionImplications = position.actualHolding
    ? [`실제 보유 맥락: ${position.freshness === 'AVAILABLE' ? '확인된 포지션' : '보유정보 갱신 필요'}. ${below ? '추가 진입보다 보유 위험과 축소 조건을 먼저 검토합니다.' : '기존 포지션 유지 조건과 추격 진입 조건을 구분합니다.'}`]
    : ['확인된 현재 보유가 없거나 불명확합니다. 신규 진입 전 포지션 동기화와 반증을 확인합니다.'];
  if (e.market.priceBasis === 'EOD') positionImplications.push('가격은 일별 종가이고 Toss 평가손익은 별도 관측 시점입니다. 표시 가격으로 손익을 재계산하거나 장중 진입·손절 가격으로 사용하지 않습니다.');
  if (position.averageCost !== null) positionImplications.push(`확인된 평균 매수가 ${position.averageCost} ${position.currency ?? ''}; ${position.unrealizedPnlPercent === null ? '공급자 손익률 미제공' : `공급자 손익률 ${position.unrealizedPnlPercent}%`}.`);
  if (['SOXL', 'SOXS', 'KORU'].includes(e.symbol)) positionImplications.push('일일 레버리지 목표 상품: 여러 날의 결과는 단순 배수가 아니며 변동 경로와 보유기간에 민감합니다.');
  if (e.symbol === 'SOXS') positionImplications.push('SOXS 자체 가격 하락은 보유자 손실 방향입니다. 기초지수 방향과 두 번 반전하지 않습니다.');
  const learning = e.learning;
  if (learning?.similarCases.length) nextChecks.push(`비슷한 과거 ${new Set(learning.similarCases.map(c => c.caseId)).size}건의 1·5·20·60거래일 결과와 차이를 비교합니다. 장중 승률은 아닙니다.`);
  nextChecks.push('새 공시·기업행동·뉴스 원문과 시각 확인.', ...e.macro.filter(x => x.state !== 'AVAILABLE').map(x => `${x.label}: 다음 유효 관측 확인.`));
  changes.push(['SOXL', 'SOXS'].includes(e.symbol)
    ? '반도체 기초지수 방향이 바뀌거나 ETF의 일일 추종이 어긋나면 ' + (position.actualHolding ? '보유' : '신규 진입') + ' 판단을 다시 확인합니다.'
    : e.symbol === 'KORU'
      ? 'MSCI Korea 25/50 직접 기준지수와 원화 맥락이 바뀌면 ' + (position.actualHolding ? '보유' : '신규 진입') + ' 판단을 다시 확인합니다.'
      : e.profile.assetClass === 'ETF'
        ? '기초지수·분할·분배 등 공식 상품 조건이 바뀌면 ' + (position.actualHolding ? '보유' : '신규 진입') + ' 판단을 다시 확인합니다.'
        : '새 발행·상장·기업행동 공시가 나오면 위험 판단을 다시 확인합니다.',
    '보유 수량·새 사건·추세 임계값 또는 유효시간이 바뀌면 당시 근거를 보존하고 설명을 갱신합니다.');
  const coverage = [usable, e.secState === 'AVAILABLE', e.events.length > 0, e.macro.filter(x => x.state === 'AVAILABLE').length >= 3, position.freshness === 'AVAILABLE', Boolean(learning?.similarCases.length)].filter(Boolean).length;
  return { now: secRisks.length ? `${e.symbol}: 가격 방향보다 공시의 자본구조 위험을 먼저 확인할 구간입니다.` : exposureSignals[0] ? `${e.symbol}: ${exposureSignals[0].label} · ${e.profile.leverageDirection === 'INVERSE' ? '역방향' : '정방향'} 노출에 ${exposureSignals[0].direction === 'SUPPORTIVE' ? '지지' : '반대'} ${exposureSignals[0].evidenceType === 'HYPOTHESIS' ? '가설' : '근거'}입니다.` : !usable ? `${e.symbol}: 장중 가격 판단은 갱신이 필요하며, 기업·거시 조건은 계속 확인할 수 있습니다.` : below ? `${e.symbol}: 상품 가격의 20일 추세 회복과 보유 위험 관리가 중요합니다.` : `${e.symbol}: 관측 추세 유지 여부와 반대 근거를 함께 확인할 구간입니다.`, drivers, counterevidence,
    posture: !usable || position.freshness !== 'AVAILABLE' ? 'WAIT_FOR_CONFIRMATION' : position.actualHolding && (below || secRisks.length > 0) ? 'REVIEW_REDUCE' : 'REVIEW_HOLD',
    confidence: coverage, confidenceBasis: '가격·SEC·사건·거시·포지션·학습의 6개 근거 충족 개수입니다. 수익 확률이나 매매 성공률이 아닙니다.', changeConditions: changes, nextChecks, positionImplications };
}
