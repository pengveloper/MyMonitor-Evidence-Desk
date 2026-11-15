import { COMPANY_RISK_TAG as RISK_TAG, companyEvidencePriority, semiconductorSignals, ownerNewsIsCurrent } from './owner-exposure-signals';
import type {
  EvidenceState,
  OwnerIntelligenceEvidence,
  OwnerSignalStory,
  OwnerSignalStoryItem,
  OwnerStoryChanges,
} from './owner-intelligence-contract';


function item(prefix: string, index: number, detail: string, state: EvidenceState = 'AVAILABLE'): OwnerSignalStoryItem {
  return { id: `${prefix}-${index}`, label: detail.split(/(?:\.(?=\s|$)|[:·])/, 1)[0]?.trim() || detail, detail, state };
}

function eventFreshness(publishedAt: string | null, generatedAt: string): EvidenceState {
  const eventAt = publishedAt ? Date.parse(publishedAt) : NaN;
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(eventAt) || !Number.isFinite(now)) return 'UNAVAILABLE';
  return now - eventAt > 7 * 86_400_000 ? 'STALE' : 'AVAILABLE';
}

function firstSeen(previous: OwnerSignalStory | null | undefined, eventId: string, fallback: string): string {
  return previous?.newsEventClusters.find(event => event.id === eventId)?.firstSeenAt ?? fallback;
}

function learningSummary(e: OwnerIntelligenceEvidence): OwnerSignalStory['learningSummary'] {
  const cases = (e.learning?.similarCases ?? []).filter((entry, index, all) => all.findIndex(other =>
    other.caseId === entry.caseId || (other.symbol === entry.symbol && other.eventAt === entry.eventAt && other.eventType === entry.eventType)) === index);
  const horizons = [1, 5, 20, 60].map(tradingDays => {
    const resolved = cases.filter(entry => entry.outcome?.tradingDays === tradingDays && Number.isFinite(entry.outcome.absoluteReturnPercent));
    return {
      tradingDays,
      n: resolved.length,
      up: resolved.filter(entry => Number(entry.outcome?.absoluteReturnPercent) > 0).length,
      down: resolved.filter(entry => Number(entry.outcome?.absoluteReturnPercent) < 0).length,
      unresolved: cases.length - resolved.length,
    };
  });
  return {
    similarCaseCount: cases.length,
    horizons,
    comparableConditions: [...new Set(cases.flatMap(entry => entry.sharedSignals))].slice(0, 6),
    importantDifferences: [
      ...(!cases.length ? ['현재 근거와 비교 가능한 PIT 사례가 아직 없습니다.'] : []),
      '일별 1·5·20·60거래일 결과입니다. 장중 예측이나 검증된 수익 확률이 아닙니다.',
      ...cases.filter(entry => entry.outcome?.pathCoverage === 'PARTIAL').map(entry => `${entry.symbol} ${entry.eventAt}: 가격 경로 일부만 관측됨`),
    ].slice(0, 6),
    // Existing confidence/accuracy averaging is descriptive, not validated calibration.
    calibrationApplied: false,
    calibrationSampleCount: e.learning?.calibration.sampleCount ?? 0,
  };
}

function profileItems(e: OwnerIntelligenceEvidence): OwnerSignalStoryItem[] {
  const profile = e.profile;
  const rows: OwnerSignalStoryItem[] = [];
  if (profile.assetClass === 'ETF') {
    rows.push({ ...item('etf', rows.length, `기초 노출: ${profile.underlying ?? '공식 지수 미확인'}`, profile.underlying ? 'AVAILABLE' : 'NOT_WIRED'), url: profile.sourceUrl, source: 'ETF 상품 자료', observedAt: profile.observedAt, direction: 'NEUTRAL' });
    rows.push(item('etf', rows.length, `일일 목표: ${profile.leverageDirection === 'INVERSE' ? '역방향' : profile.leverageDirection === 'LONG' ? '같은 방향' : '방향 미확인'}${profile.leverageMultiple ? ` ${profile.leverageMultiple}배` : ''}`, profile.leverageMultiple ? 'AVAILABLE' : 'UNAVAILABLE'));
    rows.push(item('etf', rows.length, profile.dailyReset === true
      ? '일일 재설정: 여러 날의 수익률은 단순 배수가 아니며 변동 경로에 따라 달라집니다.'
      : '재설정 주기: 공식 투자목표 확인 필요', profile.dailyReset === true ? 'AVAILABLE' : 'NOT_WIRED'));
    if (profile.leverageDirection === 'INVERSE') rows.push(item('etf', rows.length, '역방향 상품: ETF 가격 하락은 보유자 손실이며 기초지수 방향과 혼동하지 않습니다.'));
    rows.push(item('etf', rows.length, '구성종목 비중: 공식 기준일과 기업별 비중 미확인. 스왑 보유표를 기업 비중으로 사용하지 않습니다.', 'NOT_WIRED'));
    for (const limitation of profile.limitations.filter(value => /수집 시각|Direxion/.test(value))) rows.push(item('etf-source', rows.length, limitation));
  } else {
    const risks = e.events.filter(event => companyEvidencePriority(event) >= 2).sort((a, b) => companyEvidencePriority(b) - companyEvidencePriority(a));
    for (const risk of risks.slice(0, 4)) rows.push({
      ...item('company-risk', rows.length, `${risk.form ?? '공시'} · ${risk.titleKo ?? risk.title}`),
      source: risk.sources[0]?.name,
      observedAt: risk.publishedAt,
      url: risk.sources[0]?.url,
    });
    if (!risks.length) rows.push(item('company-risk', 0, e.secState === 'AVAILABLE' ? '읽은 SEC 자료에서 분류된 자본구조 위험 사건 없음. 공시 전체의 위험 부재를 뜻하지 않습니다.' : 'SEC 발행·희석·상장유지 자료 확인 필요', e.secState));
  }
  return rows;
}

export function assembleOwnerSignalStory(
  e: OwnerIntelligenceEvidence,
  previous?: OwnerSignalStory | null,
): OwnerSignalStory {
  const macro = e.macro.map((observation): OwnerSignalStoryItem => ({
    id: `macro-${observation.id}`,
    label: observation.label,
    detail: [observation.value === null ? `${observation.label} 관측 미확인` : `${observation.label} ${observation.value} ${observation.unit}`.trim(),
      observation.previous !== null ? `이전 관측 ${observation.previous}${observation.unit} (${observation.previousObservedAt ?? '시각 미확인'})` : '',
      observation.basis === 'EOD' ? '종가 기준' : '',
      observation.sampleCount != null ? `표본 ${observation.sampleCount}종목 · coverage ${observation.coveragePercent ?? '미확인'}${observation.coveragePercent == null ? '' : '%'}` : '',
      observation.limitation ?? '',
    ].filter(Boolean).join(' · '),
    value: observation.value === null ? undefined : String(observation.value),
    state: observation.state,
    source: observation.source,
    observedAt: observation.observedAt,
    fetchedAt: observation.fetchedAt,
    url: observation.url || undefined,
    direction: observation.value === null ? 'UNKNOWN' : 'NEUTRAL',
  }));
  const riskFirst = [...e.events].sort((left, right) => {
    if (e.symbol === 'CISS') return companyEvidencePriority(right) - companyEvidencePriority(left) || (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '');
    const leftRisk = left.kind === 'SEC' && left.tags.some(tag => RISK_TAG.test(tag)) ? 1 : 0;
    const rightRisk = right.kind === 'SEC' && right.tags.some(tag => RISK_TAG.test(tag)) ? 1 : 0;
    return rightRisk - leftRisk || (e.symbol === 'KORU' ? Number(left.scope === 'INDIRECT') - Number(right.scope === 'INDIRECT') : 0)
      || (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '');
  });
  const newsEventClusters = riskFirst.map(event => ({
    id: event.id,
    headline: event.titleKo ?? event.title,
    originalHeadline: event.title,
    translationState: event.titleKo && event.titleKo !== event.title
      ? 'TRANSLATED' as const
      : event.translation === 'FAILED' || event.translation === 'POLICY_BLOCKED'
        ? 'TRANSLATION_FAILED' as const
        : 'ORIGINAL_ONLY' as const,
    publishedAt: event.publishedAt,
    firstSeenAt: firstSeen(previous, event.id, e.collectedAt),
    sourceCount: event.sources.length,
    primarySource: event.sources.some(source => source.primary),
    impactedOwnerSymbols: [e.symbol],
    freshness: event.kind === 'NEWS' && event.publishedAt && Number.isFinite(Date.parse(event.publishedAt))
      ? ownerNewsIsCurrent(event.publishedAt, e.collectedAt) ? 'AVAILABLE' as const : 'STALE' as const
      : eventFreshness(event.publishedAt, e.collectedAt),
    kind: event.kind,
    form: event.form,
    tags: event.tags,
    links: event.sources,
    scope: event.scope,
    relatedSymbol: event.relatedSymbol,
    relationshipReason: event.relationshipReason,
    relationshipSource: event.relationshipSource,
    relationshipAsOf: event.relationshipAsOf,
    relationshipObservedAt: event.relationshipObservedAt,
  }));
  const primarySources = newsEventClusters.flatMap(event => event.links
    .filter(link => link.primary)
    .map(link => ({ url: link.url, name: link.name, publishedAt: event.publishedAt })))
    .filter((source, index, all) => all.findIndex(candidate => candidate.url === source.url) === index);
  const notWired = [
    ...e.macro.filter(value => value.state === 'NOT_WIRED' || value.state === 'NOT_CONFIGURED').map(value => value.label),
    ...e.profile.limitations,
    ...(e.shortOptions.state !== 'AVAILABLE' ? ['옵션·공매도 기준일 관측'] : []),
    ...(e.profile.assetClass === 'ETF' && !e.profile.underlying ? ['공식 ETF 기초지수·구성종목'] : []),
  ];
  const unknowns = [
    ...e.macro.filter(value => value.state === 'UNAVAILABLE' || value.state === 'STALE').map(value => `${value.label}: ${value.state}`),
    ...(e.secState !== 'AVAILABLE' && e.profile.assetClass !== 'ETF' ? [`SEC 근거: ${e.secState}`] : []),
    ...(e.market.state !== 'AVAILABLE' ? [`가격: ${e.market.state}`] : []),
  ];
  const delayMinutes = e.market.priceBasis === 'DELAYED' ? (e.market.delayedMinutes ?? 20) : null;
  const topDrivers: OwnerSignalStoryItem[] = e.judgment.drivers.slice(0, 5).map((value, index) => ({ ...item('driver', index, value), direction: /20일 이동평균 .*위/.test(value) ? 'SUPPORTIVE' as const : 'NEUTRAL' as const }));
  const counterSignals: OwnerSignalStoryItem[] = e.judgment.counterevidence.slice(0, 6).map((value, index) => ({ ...item('counter', index, value), direction: 'COUNTER' as const }));
  const exposure = semiconductorSignals(e);
  for (const signal of exposure) {
    const target = signal.direction === 'SUPPORTIVE' ? topDrivers : counterSignals;
    const index = target.findIndex(row => row.detail === signal.detail);
    if (index >= 0) target.splice(index, 1);
    target.unshift(signal);
  }
  const oneLineReason = e.symbol === 'CISS' && counterSignals.some(row => row.detail.startsWith('공시 확인:'))
    ? counterSignals.find(row => row.detail.startsWith('공시 확인:'))!.detail
    : exposure[0]?.detail || [topDrivers[0]?.label, counterSignals[0]?.label].filter(Boolean).join(' + ').slice(0, 180)
    || e.judgment.now;
  return {
    schemaVersion: 'owner-signal-story/v1',
    symbol: e.symbol,
    generatedAt: e.collectedAt,
    evidenceFingerprint: e.fingerprint,
    status: 'CURRENT',
    assetClass: e.profile.assetClass,
    actualHolding: e.position.actualHolding,
    recentlyTraded: e.position.recentlyTraded,
    positionState: e.position.state,
    price: {
      value: e.market.price,
      changePercent: e.market.changePercent,
      currency: e.market.currency,
      observedAt: e.market.observedAt,
      fetchedAt: e.market.fetchedAt ?? null,
      freshness: e.market.state,
      delayedMinutes: delayMinutes,
      delayed: e.market.priceBasis === 'DELAYED' || e.market.priceBasis === 'EOD',
      source: e.market.provider,
      basis: e.market.priceBasis,
      session: e.market.session,
      intradayUsable: e.market.intradayUsable,
      timingLabel: e.market.timingLabel,
    },
    headline: e.judgment.now,
    oneLineReason,
    topDrivers,
    counterSignals,
    changeConditions: e.judgment.changeConditions.map((value, index) => item('condition', index, value)),
    nextChecks: e.judgment.nextChecks.map((value, index) => item('next', index, value)),
    marketRegime: [
      item('regime', 0, `가격 ${e.market.ma20 !== null && e.market.price !== null ? e.market.price >= e.market.ma20 ? '20일선 위' : '20일선 아래' : '추세 미확인'}`, e.market.state),
      ...macro.filter(value => ['macro-VIXCLS', 'macro-BREADTH_50'].includes(value.id)),
    ],
    macroChannels: macro,
    companyOrEtfSpecific: [...profileItems(e), ...exposure],
    newsEventClusters,
    newsCoverage: e.newsCoverage,
    horizons: {
      currentSession: e.market.intradayUsable ? '현재 장: 확인된 실시간 관측 시각부터 5분 이내 가격 참고' : '현재 장: 장중 진입 가격 제시 제한 · 관측 시각과 지연 확인',
      scenario: '1~5거래일: 추세·공시·거시 조건이 유지되는지 확인',
      longerContext: e.profile.dailyReset === true ? '20~60거래일: 일일 재설정과 과거 결과를 구분해 해석' : '20~60거래일: 기업 구조·유동성과 과거 결과를 구분해 해석',
    },
    primarySources,
    learningSummary: learningSummary(e),
    ownerBehaviorSummary: e.behavior,
    positionSummary: e.judgment.positionImplications,
    portfolio: e.portfolio,
    profile: e.profile,
    posture: e.judgment.posture,
    evidenceCoverage: { available: e.judgment.confidence, total: 6, label: e.judgment.confidenceBasis },
    unknowns: [...new Set(unknowns)].slice(0, 12),
    notWired: [...new Set(notWired)].slice(0, 12),
  };
}

export function ownerStoryChanges(previous: OwnerSignalStory | null, current: OwnerSignalStory): OwnerStoryChanges {
  const items: string[] = [];
  if (previous) {
    if (previous.price.value !== current.price.value) items.push(`가격 ${previous.price.value ?? '미확인'} → ${current.price.value ?? '미확인'} ${current.price.currency}`);
    if (previous.posture !== current.posture) items.push(`판단 ${previous.posture} → ${current.posture}`);
    if (previous.actualHolding !== current.actualHolding || previous.positionState !== current.positionState) items.push(`포지션 ${previous.positionState} → ${current.positionState}`);
    const previousEvents = new Set(previous.newsEventClusters.map(event => event.id));
    const newEvents = current.newsEventClusters.filter(event => !previousEvents.has(event.id));
    if (newEvents.length) items.push(`새 사건·공시 ${newEvents.length}건`);
    if (previous.headline !== current.headline) items.push('핵심 상황 설명 변경');
  }
  return {
    changedCount: items.length,
    postureChanged: Boolean(previous && previous.posture !== current.posture),
    previousPosture: previous?.posture ?? null,
    currentPosture: current.posture,
    items,
  };
}
