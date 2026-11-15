import type {
  EvidenceState,
  OwnerSignalStory,
  OwnerSignalStoryEvent,
  OwnerSignalStoryItem,
} from '../../../shared/owner-intelligence-contract';

export type OwnerSignalRelationship = 'SUPPORTIVE' | 'COUNTER' | 'MIXED' | 'UNKNOWN' | 'CONTEXT';

export interface OwnerSignalMapNode {
  id: 'benchmark' | 'volatility' | 'rates' | 'breadth' | 'events' | 'position' | 'structure';
  label: string;
  summary: string;
  relationship: OwnerSignalRelationship;
  weight: 1 | 2 | 3;
  evidenceLabel: string;
  evidenceType?: 'DIRECT' | 'INDIRECT' | 'HYPOTHESIS';
  fetchedAt?: string | null;
  state: EvidenceState;
  source: string;
  observedAt: string | null;
  timeMeaning?: 'AS_OF' | 'SOURCE_OBSERVED';
  url?: string;
}

export interface OwnerSignalMapEdge {
  from: OwnerSignalMapNode['id'];
  to: OwnerSignalMapNode['id'];
  kind: 'OFFICIAL_EXPOSURE' | 'PROXY_EXPOSURE' | 'OBSERVED_POSITION' | 'HYPOTHESIS';
  label: string;
  reason: string;
}

/** Edges describe provenance and exposure, never turn product identity into a price signal. */
export function buildOwnerSignalMapEdges(story: OwnerSignalStory): OwnerSignalMapEdge[] {
  const verifiedProfile = story.profile.state === 'AVAILABLE';
  const event = firstEvent(story);
  const proxy = story.symbol === 'KORU' && event?.scope === 'INDIRECT' && event.relatedSymbol === 'EWY';
  return [
    { from: 'events', to: 'benchmark', kind: 'HYPOTHESIS', label: proxy ? '간접 · 대용치 · 영향 가설' : '영향 가설 · 확인 필요', reason: '관련 사건으로 분류됐지만 산업·기업 실적이나 가격에 미친 크기는 아직 검증되지 않았습니다.' },
    { from: 'benchmark', to: 'structure', kind: verifiedProfile ? 'OFFICIAL_EXPOSURE' : 'HYPOTHESIS', label: verifiedProfile ? (story.assetClass === 'ETF' ? '상품의 기초 노출' : '기업의 사업 노출') : '노출 관계 미확인', reason: story.assetClass === 'ETF' ? `${story.profile.underlying ?? '기초지수 미확인'}에 대한 상품 관계입니다. 구성기업 비중이나 상승 근거를 뜻하지 않습니다.` : `${story.profile.sector ?? '업종 미확인'} 사업과 주식의 관계입니다. 사건의 영향 방향은 별도 확인이 필요합니다.` },
    { from: 'structure', to: 'position', kind: story.actualHolding ? 'OBSERVED_POSITION' : 'HYPOTHESIS', label: story.actualHolding ? '보유 스냅샷에서 확인' : '관심·최근 거래 맥락', reason: story.actualHolding ? '실제 보유로 확인된 종목입니다. 시세와 계좌 관측 시각이 다를 수 있습니다.' : '최근 거래나 관심은 현재 보유와 다릅니다. 신규 진입은 시세와 위험 조건을 다시 확인합니다.' },
  ];
}

function observedRelationship(item: OwnerSignalStoryItem | undefined): OwnerSignalRelationship {
  if (!item || item.state !== 'AVAILABLE') return 'UNKNOWN';
  if (item.direction === 'SUPPORTIVE' || item.direction === 'COUNTER') return item.direction;
  return 'CONTEXT';
}

function firstItem(items: readonly OwnerSignalStoryItem[], pattern: RegExp): OwnerSignalStoryItem | undefined {
  return items.find((item) => pattern.test(`${item.id} ${item.label} ${item.detail}`));
}

function firstEvent(story: OwnerSignalStory): OwnerSignalStoryEvent | undefined {
  if (story.symbol === 'CISS') return story.newsEventClusters[0];
  if (story.symbol === 'KORU') {
    const direct = story.newsEventClusters.filter(event => event.scope === 'DIRECT');
    const preferred = direct.find(event => event.freshness === 'AVAILABLE') ?? direct[0];
    if (preferred) return preferred;
  }
  return story.newsEventClusters.find((event) => event.freshness === 'AVAILABLE') ?? story.newsEventClusters[0];
}

function unknownSummary(story: OwnerSignalStory, pattern: RegExp, fallback: string): string {
  return [...story.unknowns, ...story.notWired].find((value) => pattern.test(value)) ?? fallback;
}

/**
 * A bounded visual projection of OwnerSignalStory. It deliberately performs no
 * provider fetch, persistence, scoring, or independent market inference.
 */
export function buildOwnerSignalMap(story: OwnerSignalStory): OwnerSignalMapNode[] {
  const demand = story.companyOrEtfSpecific.find(row => row.id.startsWith('underlying-'));
  const benchmark = firstItem(story.companyOrEtfSpecific, /기초|underlying|benchmark|업종|사업|sector/i);
  const volatility = firstItem([...story.marketRegime, ...story.macroChannels], /vix|변동성|volatility/i);
  const rates = (story.symbol === 'KORU' ? firstItem(story.macroChannels, /FX_USDKRW|KRW|원화/) : undefined) ?? firstItem(story.macroChannels, /금리|실질|yield|rate|dgs10/i);
  const breadth = firstItem([...story.marketRegime, ...story.macroChannels], /breadth|확산|상승 종목/i);
  const event = firstEvent(story);
  const proxy = story.symbol === 'KORU' && event?.scope === 'INDIRECT' && event.relatedSymbol === 'EWY';
  const pair = story.portfolio.hasSoxlSoxsPair && ['SOXL', 'SOXS'].includes(story.symbol);
  const semiconductors = ['SOXL', 'SOXS'].includes(story.symbol);
  const exposure = semiconductors ? '반도체 산업' : story.symbol === 'KORU' ? '한국 주식 · 원화 노출' : story.symbol === 'CISS' ? '해운 사업 · 기업 자금조달' : story.profile.sector ?? '사업·산업 노출';

  const nodes: OwnerSignalMapNode[] = [
    {
      id: 'benchmark',
      label: story.symbol === 'KORU' ? 'KORU · MSCI Korea 25/50 Index' : exposure,
      summary: story.profile.underlying ? `기초 노출: ${story.profile.underlying} · 공식 상품 정체이며 가격 방향 관측과 구분합니다.` : benchmark?.detail ?? `${exposure} · 직접 기업 자료 우선`,
      relationship: story.profile.state === 'AVAILABLE' ? 'CONTEXT' : 'UNKNOWN',
      weight: 3,
      evidenceLabel: 'DIRECT · 공식 기초 노출',
      evidenceType: 'DIRECT',
      state: story.profile.state,
      source: story.profile.sourceUrl ? '공식 상품·기업 자료' : benchmark?.source ?? '상품·기업 정보',
      observedAt: story.profile.observedAt ?? benchmark?.observedAt ?? null,
      timeMeaning: 'SOURCE_OBSERVED',
      ...(story.profile.sourceUrl ? { url: story.profile.sourceUrl } : {}),
    },
    {
      id: 'volatility',
      label: 'VIX · 변동성',
      summary: volatility?.detail ?? unknownSummary(story, /vix|변동성|volatility/i, 'VIX 관측이 없어 방향 근거로 사용하지 않습니다.'),
      relationship: observedRelationship(volatility),
      weight: 2,
      evidenceLabel: volatility?.label ?? 'VIX 미확인',
      state: volatility?.state ?? 'UNAVAILABLE',
      source: volatility?.source ?? 'OwnerSignalStory · macro',
      observedAt: volatility?.observedAt ?? null,
      fetchedAt: volatility?.fetchedAt ?? null,
      ...(volatility?.url ? { url: volatility.url } : {}),
    },
    {
      id: 'rates',
      label: rates?.label ?? '금리 관측',
      summary: rates?.detail ?? unknownSummary(story, /금리|실질|yield|rate|dgs10/i, '금리 관측이 없어 영향은 미확인입니다. 명목금리와 실질금리는 서로 다른 지표입니다.'),
      relationship: rates?.state === 'AVAILABLE' ? 'CONTEXT' : 'UNKNOWN',
      weight: 2,
      evidenceLabel: rates?.label ?? '금리 미확인',
      state: rates?.state ?? 'UNAVAILABLE',
      source: rates?.source ?? 'OwnerSignalStory · macro',
      observedAt: rates?.observedAt ?? null,
      fetchedAt: rates?.fetchedAt ?? null,
      ...(rates?.url ? { url: rates.url } : {}),
    },
    {
      id: 'breadth',
      label: '시장 상승 참여율',
      summary: breadth?.detail ?? unknownSummary(story, /breadth|확산|상승 종목/i, 'breadth 미확인 · 다른 근거는 계속 사용할 수 있습니다.'),
      relationship: observedRelationship(breadth),
      weight: 2,
      evidenceLabel: breadth?.state === 'AVAILABLE' ? breadth.label : '상승 참여율 미확인',
      state: breadth?.state ?? 'UNAVAILABLE',
      source: breadth?.source ?? 'OwnerSignalStory · macro',
      observedAt: breadth?.observedAt ?? null,
      fetchedAt: breadth?.fetchedAt ?? null,
      ...(breadth?.url ? { url: breadth.url } : {}),
    },
    {
      id: 'events',
      label: semiconductors ? demand?.label ?? '반도체 수요·지수 방향 미확인' : event ? `${proxy ? '간접 · 대용치 · ' : event.scope === 'INDIRECT' ? '간접 관련 · ' : ''}${event.headline}` : '관련 사건 확인',
      summary: semiconductors ? demand?.detail ?? '방향을 확인할 독립 반도체 근거 없음. 복합 기사는 뉴스 근거에서 별도 확인합니다.' : event
        ? proxy ? `${event.headline}. EWY 대용 ETF에 관한 보도입니다. ${event.relationshipReason ?? 'KORU 직접 기사와 구분하며 가격 영향은 별도 확인이 필요합니다.'}` : `${event.headline} · 가격 원인으로 단정하지 않고 관련 사건 묶음으로 봅니다.`
        : '확인된 관련 사건 묶음이 없습니다. 사건 부재를 뜻하지 않습니다.',
      relationship: semiconductors ? observedRelationship(demand) : event?.freshness === 'AVAILABLE' ? 'CONTEXT' : 'UNKNOWN',
      weight: story.symbol === 'CISS' ? 3 : 2,
      evidenceType: semiconductors ? demand?.evidenceType ?? 'HYPOTHESIS' : event?.scope === 'INDIRECT' ? 'INDIRECT' : 'DIRECT',
      fetchedAt: demand?.fetchedAt ?? null,
      evidenceLabel: semiconductors ? demand?.label ?? '반도체 방향 미확인' : event?.headline ?? '관련 사건 미확인',
      state: semiconductors ? demand?.state ?? 'UNAVAILABLE' : event?.freshness ?? 'UNAVAILABLE',
      source: semiconductors ? demand?.source ?? '독립 근거 미확인' : event?.links[0]?.name ?? 'OwnerSignalStory · events',
      observedAt: semiconductors ? demand?.observedAt ?? null : event?.publishedAt ?? null,
      ...((semiconductors ? demand?.url : event?.links[0]?.url) ? { url: semiconductors ? demand?.url : event?.links[0]?.url } : {}),
    },
    {
      id: 'position',
      label: story.actualHolding ? `${story.symbol} 실제 보유` : `${story.symbol} 관심·최근 거래`,
      summary: pair
        ? 'SOXL + SOXS 동시 3배 노출 · 방향 일부 상쇄와 별개로 총 레버리지, 일일 재설정, 경로 의존성과 리밸런싱 위험을 함께 봅니다.'
        : (story.positionSummary[0] ?? '실제 포지션 영향 근거가 미확인입니다.'),
      relationship: story.actualHolding ? 'CONTEXT' : 'UNKNOWN',
      weight: 3,
      evidenceLabel: pair ? 'SOXL + SOXS 동시 보유' : story.actualHolding ? '보유 확인' : '현재 보유 미확인',
      state: story.actualHolding ? 'AVAILABLE' : 'UNAVAILABLE',
      source: 'OwnerSignalStory · private portfolio projection',
      observedAt: story.generatedAt,
    },
    {
      id: 'structure',
      label: story.assetClass === 'ETF' ? `${story.symbol} · ${story.profile.leverageDirection === 'INVERSE' ? '반대 방향 ' : ''}${story.profile.leverageMultiple ?? ''}${story.profile.leverageMultiple ? '배 ETF' : 'ETF'}` : `${story.symbol} · 기업 주식`,
      summary: story.profile.dailyReset
        ? `일일 ${story.profile.leverageMultiple ?? ''}배 목표는 여러 날의 단순 배수와 다릅니다. 일일 재설정과 경로 의존성으로 보유 결과가 달라집니다.`
        : story.assetClass === 'EQUITY' ? '기업 주식입니다. 공시의 발행 조건·주식 수·유동성을 확인하고 희석 규모가 확인되기 전에는 수치로 추정하지 않습니다.' : unknownSummary(story, /재설정|구조|leverage/i, '상품 구조를 공식 근거로 확인해야 합니다.'),
      relationship: story.profile.state === 'AVAILABLE' ? 'CONTEXT' : 'UNKNOWN',
      weight: 2,
      evidenceLabel: story.profile.dailyReset ? '일일 재설정 구조' : '상품·기업 구조',
      state: story.profile.state,
      source: story.profile.sourceUrl ? '공식 상품·기업 자료' : '상품·기업 정보',
      observedAt: story.profile.observedAt ?? null,
      timeMeaning: 'SOURCE_OBSERVED',
      ...(story.profile.sourceUrl ? { url: story.profile.sourceUrl } : {}),
    },
  ];

  return nodes.map(node => ({ ...node, evidenceType: node.evidenceType ?? (['volatility', 'rates', 'breadth'].includes(node.id) ? 'INDIRECT' : 'DIRECT'), fetchedAt: node.fetchedAt ?? null,
    ...(story.symbol === 'CISS' && ['volatility', 'rates', 'breadth'].includes(node.id) ? { weight: 1 as const, label: `시장 맥락 · ${node.label}` } : {}),
  }));
}
