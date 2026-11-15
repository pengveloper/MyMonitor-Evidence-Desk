import { contextObservationUsable } from './discovery-context-integrity';
import { semiconductorContext, instrumentContextEffect, type VerifiedMechanics, type SemiconductorContext, type InstrumentContextEffect } from './discovery-instrument-context';
import type { UniverseScan, ContextItem } from './owner-universe-scan-contract';
export type FactorState = 'SUPPORTIVE' | 'MIXED' | 'ADVERSE' | 'UNKNOWN';
export const FACTORS = ['SEMICONDUCTOR_TREND','BREADTH','LEADERS','BROAD_MARKET','RATES','FX','VOLATILITY','TECHNICAL_STATE','NEWS_EVENTS'] as const;
export type FactorName = typeof FACTORS[number];
export interface Factor { group: FactorName; scope:'MARKET_CONTEXT'|'INSTRUMENT'|'RISK'; state: FactorState; reason: string; evidenceIds: string[]; hardAdverse: boolean; }
export interface HistoryState {
  symbol: string; state: 'AVAILABLE' | 'UNAVAILABLE'; reason: string; canonicalId: string;
  fingerprint: string; fetchedAt: string; source: string; observationDate: string | null;
  adjustment: 'SPLIT_AND_DIVIDEND_ADJUSTED_AS_RETRIEVED'; session: 'DAILY_CLOSE_DATE_ONLY';
  knowledge: 'CURRENT_READ_OF_HISTORY_NOT_HISTORICAL_VINTAGE'; count: number;
  ma5: number | null; ma20: number | null; last: number | null; return5: number | null;
  recentHigh: number | null; recentLow: number | null; volatility: number | null;
}
export interface BreadthState {
  scope: 'SELECTED_CONTEXT_BASKET_NOT_FULL_INDEX'; state: 'AVAILABLE' | 'UNAVAILABLE';
  advances: number; declines: number; unchanged: number; total: number; advanceRatio: number | null;
  medianChange: number | null; observationDate: string | null; evidenceIds: string[];
  weightedContribution: null; selectedTotal:number; coverageRatio:number|null; conflictedLabels:string[]; reason: string;
}
/** Display-only evaluation at cutoff; never part of a canonical quote or its fact identity. */
export interface QuoteAvailability {
  status: 'MARKET_CLOSED_LAST_KNOWN' | 'PROVIDER_STALE_WHILE_SESSION_ACTIVE' | 'SESSION_OBSERVATION_AVAILABLE' | 'SESSION_BOUNDARY_REFERENCE' | 'UNAVAILABLE';
  label: string;
  cutoffAt: string;
  cutoffSession: 'pre' | 'regular' | 'post' | 'closed' | 'unknown';
  observedSession: string;
  freshness: string;
}
export interface DiscoveryV2 {
  version: 'owner-discovery/v2'; ruleVersion: 'conservative-trend-review/v2.4'; cutoffAt: string;
  sourceScanFingerprint: string; fingerprint: string;
  quoteAvailability?: Record<string, QuoteAvailability>;
  breadth: BreadthState;
  semiconductor:SemiconductorContext;
  results: Array<{symbol: string; analysisEligibility: 'ANALYSIS_READY'|'NOT_READY';
    marketCandidate: 'CANDIDATE_FOR_REVIEW'|'NOT_A_CANDIDATE'; factors: Factor[];
    blockers: string[]; unresolved: string[]; nextChecks: string[];
    contextEffect:InstrumentContextEffect;
    personalContext: {existingExposure: 'UNKNOWN'; directionalOverlap: 'UNKNOWN'; hedgeRelationship: 'UNKNOWN'; positionDataFreshness:'UNAVAILABLE'; connection:'UNCONNECTED'; decisionRole:'SEPARATE_FROM_MARKET_CANDIDATE'};
  }>;
  newsLinks: Array<{canonicalId:string; affectedInstruments:string[]; affectedGroups:string[]; topics:string[];
    direction:'UNRESOLVED'; confidence:'UNASSESSED'; freshness:string; reason:string}>;
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const median=(xs:number[])=>{const v=[...xs].sort((a,b)=>a-b);return v.length%2?v[Math.floor(v.length/2)]!:(v[v.length/2-1]!+v[v.length/2]!)/2;};
function usable(i:ContextItem,cutoff:string) {
  return contextObservationUsable(i,cutoff);
}
/** Descriptive participation only; no inferred membership, weights or index contribution. */
export function selectedBasketBreadth(items:ContextItem[],cutoff:string):BreadthState {
  const grouped=new Map<string,ContextItem[]>();
  for(const item of items){const key=item.label??item.canonicalId;grouped.set(key,[...(grouped.get(key)??[]),item]);}
  const conflictedLabels=[...grouped].filter(([,values])=>new Set(values.map(i=>JSON.stringify([i.fingerprint,i.change,i.observedAt,i.session]))).size>1).map(([key])=>key);
  const rows=[...grouped].filter(([key])=>!conflictedLabels.includes(key)).map(([,values])=>values[0]!)
    .filter(i=>usable(i,cutoff)&&finite(i.change));
  const dates=new Set(rows.map(i=>i.observedAt!.slice(0,10)));
  const aligned=rows.length>=5&&dates.size===1&&new Set(rows.map(i=>i.session)).size===1;
  const values=rows.map(i=>i.change!);const advances=values.filter(n=>n>0).length,declines=values.filter(n=>n<0).length;
  return {scope:'SELECTED_CONTEXT_BASKET_NOT_FULL_INDEX',state:aligned?'AVAILABLE':'UNAVAILABLE',advances,declines,
    unchanged:rows.length-advances-declines,total:rows.length,advanceRatio:aligned?advances/rows.length:null,
    medianChange:aligned?median(values):null,observationDate:aligned?rows[0]!.observedAt!.slice(0,10):null,
    evidenceIds:rows.map(i=>i.canonicalId),weightedContribution:null,selectedTotal:grouped.size,
    coverageRatio:grouped.size?rows.length/grouped.size:null,conflictedLabels,
    reason:aligned?'같은 관측일·세션의 선택 basket. 공식 전체 구성·비중·기여도는 미확인.':'동일 세션의 유효한 구성 관측이 5개 미만이거나 시점이 다릅니다.'};
}
/** Additive result: old candidate records are never relabelled or overwritten. No IO or model decision. */
export function evaluateDiscoveryV2(scan:UniverseScan,histories:Record<string,HistoryState>,mechanics:Record<string,VerifiedMechanics>={}):DiscoveryV2 {
  const items=scan.marketContext.groups.flatMap(g=>g.items), pick=(label:string)=>items.find(i=>i.label===label&&usable(i,scan.cutoffAt));
  const leaders=scan.marketContext.groups.find(g=>g.group==='SEMICONDUCTOR_LEADERS')?.items??[];
  const breadth=selectedBasketBreadth(leaders,scan.cutoffAt);
  const semiconductor=semiconductorContext(items,breadth,scan.cutoffAt);
  const leaderSymbols=new Set(leaders.map(i=>i.label).filter(Boolean));
  const newsLinks=scan.marketContext.news.events.map(e=>({canonicalId:e.event.id,affectedInstruments:[...e.affectedInstruments],
    affectedGroups:e.affectedInstruments.some(s=>leaderSymbols.has(s))?['SEMICONDUCTOR_LEADERS','NEWS_EVENTS']:e.relevance==='MARKET_CONTEXT'?['BROAD_MARKET','NEWS_EVENTS']:['NEWS_EVENTS'],topics:[...e.topics],
    direction:'UNRESOLVED' as const,confidence:'UNASSESSED' as const,freshness:e.freshness,
    reason:'관련성은 방향이나 인과 증거가 아닙니다. 제목 감성으로 방향을 만들지 않았습니다.'}));
  const results=scan.results.map(r=>{
    const factors:Factor[]=FACTORS.map(group=>({group,scope:group==='TECHNICAL_STATE'?'INSTRUMENT':group==='VOLATILITY'?'RISK':'MARKET_CONTEXT',state:'UNKNOWN',reason:'판정에 필요한 검증된 근거가 없습니다.',evidenceIds:[],hardAdverse:false}));
    const set=(name:FactorName,state:FactorState,reason:string,evidenceIds:string[],hardAdverse=false)=>Object.assign(factors.find(f=>f.group===name)!,{state,reason,evidenceIds,hardAdverse});
    const semis=pick('SOX');
    // Underlying context is descriptive. Inverse/leveraged objectives do not create supportive votes.
    set('SEMICONDUCTOR_TREND',semiconductor.direct?(semiconductor.state==='UPSIDE'?'SUPPORTIVE':semiconductor.state==='DOWNSIDE'?'ADVERSE':'MIXED'):'UNKNOWN',semiconductor.direct?'공식 target benchmark의 관측 방향; 미래 전망이 아닙니다.':`직접 ICESEMIT 미확보. SOX는 보조 맥락만: ${semis?.change??'UNKNOWN'}%. 상충 신호: ${semiconductor.conflicts.join(', ')||'없음/미확인'}`,semiconductor.evidenceIds);
    if(breadth.state==='AVAILABLE') {
      const state:FactorState=breadth.advanceRatio!>=0.7&&breadth.medianChange!>0.2?'SUPPORTIVE':breadth.advanceRatio!<=0.3&&breadth.medianChange!< -0.2?'ADVERSE':'MIXED';
      set('BREADTH',state,`반도체 시장 관점: sample leaders breadth · 선택 표본 상승 ${breadth.advances}/${breadth.total}, 하락 ${breadth.declines}/${breadth.total}, 중앙값 ${breadth.medianChange!.toFixed(2)}%. 전체 지수 확산도 아님. 역방향 상품 유불리로 자동 변환하지 않습니다.`,breadth.evidenceIds);
      set('LEADERS',state,'반도체 시장 관점. BREADTH와 같은 관측 묶음이며 독립적인 추가 신호로 세지 않습니다.',breadth.evidenceIds);
    }
    const broad=[pick('SPY'),pick('QQQ')].filter((x):x is ContextItem=>!!x&&finite(x.change));
    if(broad.length===2)set('BROAD_MARKET',broad.every(i=>i.change!>0.2)?'SUPPORTIVE':broad.every(i=>i.change!< -0.2)?'ADVERSE':'MIXED',`주식 시장 관점: SPY ${broad[0]!.change!.toFixed(2)}% / QQQ ${broad[1]!.change!.toFixed(2)}%. 관련 맥락이며 서로 독립 표나 역방향 상품 판단이 아닙니다.`,broad.map(i=>i.canonicalId));
    const rates=items.filter(i=>usable(i,scan.cutoffAt)&&/DGS2|DGS10|DFII10/.test((i.label??'')+' '+i.signalFamily));
    if(rates.length)set('RATES','MIXED','금리 수준은 확인되지만 동일 날짜 변화·상품 민감도 없이 유불리를 단정하지 않습니다.',rates.map(i=>i.canonicalId));
    const fx=pick('DXY')??pick('USDJPY');
    if(fx)set('FX','MIXED','환율 수준·변화를 맥락으로 보존합니다. JPY와 FXY를 두 표로 세지 않습니다.',[fx.canonicalId]);
    const vix=pick('VIX');
    if(vix&&finite(vix.value))set('VOLATILITY',vix.value>=30?'ADVERSE':'MIXED',`VIX ${vix.value}; 30 이상이면 높은 변동성 위험으로 후보 보류.`,[vix.canonicalId],vix.value>=30);
    const h=histories[r.instrument.symbol];
    const hValid=h?.symbol===r.instrument.symbol&&h.state==='AVAILABLE'&&h.count>=30&&finite(h.ma5)&&finite(h.ma20)&&finite(h.last)
      &&Date.parse(h.fetchedAt)<=Date.parse(scan.cutoffAt)&&!!h.observationDate&&h.observationDate<=scan.cutoffAt.slice(0,10)
      &&Date.parse(scan.cutoffAt)-Date.parse(h.observationDate+'T23:59:59Z')<=5*86400000;
    if(hValid) {
      const bullish=h.last!>h.ma20!&&h.ma5!>h.ma20!&&h.return5!==null&&h.return5>0;
      const bearish=h.last!<h.ma20!&&h.ma5!<h.ma20!;
      set('TECHNICAL_STATE',bullish?'SUPPORTIVE':bearish?'ADVERSE':'MIXED',`상품 자체 조정 종가 ${h.last}, MA5 ${h.ma5}, MA20 ${h.ma20}, 5세션 변화 ${h.return5}%. 기준일 ${h.observationDate}.`,[h.canonicalId],bearish);
    }
    const relevant=newsLinks.filter(e=>e.affectedInstruments.includes(r.instrument.symbol)||e.affectedGroups.includes('BROAD_MARKET'));
    if(relevant.length)set('NEWS_EVENTS','UNKNOWN',`${relevant.length}개 관련 이벤트. 방향·인과·중요도 검증 전이므로 지지 근거에 포함하지 않습니다.`,relevant.map(e=>e.canonicalId));
    const ready=r.outcome==='CANDIDATE_FOR_REVIEW'&&r.blockers.length===0;
    const blockers=[...r.blockers];
    if(!hValid)blockers.push('TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE');
    if(!factors.some(f=>f.scope==='INSTRUMENT'&&f.state==='SUPPORTIVE'&&f.evidenceIds.length))blockers.push('NO_VERIFIED_SUPPORTIVE_EVIDENCE');
    for(const f of factors.filter(f=>f.hardAdverse))blockers.push(f.group+':HARD_ADVERSE');
    // Technical-only trend is insufficient: require cross-check of actual current direction.
    const quote=r.frozenInputs.quote?.evidence?.market;
    if(!quote||!finite(quote.changePercent)||quote.changePercent<=0)blockers.push('CURRENT_PRICE_NOT_CONFIRMING_TREND');
    const contextEffect=instrumentContextEffect(r.instrument.symbol,semiconductor,mechanics[r.instrument.symbol]??null,scan.cutoffAt,quote?{observedAt:quote.observedAt,session:quote.session??'UNKNOWN',stale:r.blockers.some(b=>b.startsWith('quote:'))}:null);
    return {symbol:r.instrument.symbol,contextEffect,analysisEligibility:ready?'ANALYSIS_READY' as const:'NOT_READY' as const,
      marketCandidate:ready&&blockers.length===0?'CANDIDATE_FOR_REVIEW' as const:'NOT_A_CANDIDATE' as const,factors,blockers,
      unresolved:[...r.unresolved.filter(x=>!x.includes('자료 준비도만')&&!(hValid&&x.includes('원시 history'))),'방향성이 확인되지 않은 거시·뉴스는 지지 근거에 사용하지 않았습니다.','개인 노출 적합성은 미평가입니다.'],
      nextChecks:['조정 종가 추세와 최신 관측 가격의 방향이 일치하는지 확인','직접 benchmark·공식 구성 breadth와 원문 이벤트의 반대 근거 확인'],
      personalContext:{existingExposure:'UNKNOWN' as const,directionalOverlap:'UNKNOWN' as const,hedgeRelationship:'UNKNOWN' as const,positionDataFreshness:'UNAVAILABLE' as const,connection:'UNCONNECTED' as const,decisionRole:'SEPARATE_FROM_MARKET_CANDIDATE' as const}};
  });
  return {version:'owner-discovery/v2',ruleVersion:'conservative-trend-review/v2.4',cutoffAt:scan.cutoffAt,
    sourceScanFingerprint:scan.fingerprint,fingerprint:'',breadth,semiconductor,results,newsLinks};
}

/** Optional narrative input only. Model text cannot write the authoritative result. */
export function discoveryExplanationInput(scan:UniverseScan,discovery:DiscoveryV2,symbol:string) {
  if(scan.fingerprint!==discovery.sourceScanFingerprint||scan.cutoffAt!==discovery.cutoffAt)throw Error('DISCOVERY_CONTEXT_DRIFT');
  const result=discovery.results.find(r=>r.symbol===symbol);
  if(!result)throw Error('INSTRUMENT_OUTSIDE_DISCOVERY');
  return structuredClone({fingerprint:discovery.fingerprint,cutoffAt:discovery.cutoffAt,result,
    marketContext:scan.marketContext,newsLinks:discovery.newsLinks,
    instruction:'Explain factors and conflicts only. The deterministic outcome is immutable. Unknown personal exposure stays unknown.'});
}
