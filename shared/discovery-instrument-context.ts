import { contextObservationUsable } from './discovery-context-integrity';
import type { OwnerInstrumentProfile } from './owner-intelligence-contract';
import type { ContextItem } from './owner-universe-scan-contract';
import type { BreadthState } from './owner-discovery-v2';

export interface VerifiedMechanics {
  symbol:string; profile:OwnerInstrumentProfile; canonicalId:string; fingerprint:string;
  fetchedAt:string; benchmarkId:string; verification:'ISSUER_OBJECTIVE_RECEIPT';
}
export interface SemiconductorContext {
  direct:ContextItem|null; secondary:ContextItem|null;
  state:'UPSIDE'|'DOWNSIDE'|'MIXED'|'UNKNOWN';
  basis:'DIRECT_BENCHMARK'|'PROXY_ONLY'|'UNAVAILABLE';
  conflicts:string[]; evidenceIds:string[];
}
export interface InstrumentContextEffect {
  state:'POTENTIALLY_SUPPORTIVE'|'ADVERSE'|'MIXED'|'UNKNOWN';
  basis:SemiconductorContext['basis']; mechanics:VerifiedMechanics|null;
  evidenceIds:string[]; risks:string[]; reason:string;
  decisionRole:'CONTEXT_ONLY_NOT_CANDIDATE_VOTE';
}
const usable=(v:ContextItem,cutoff:string)=>contextObservationUsable(v,cutoff)
  &&v.value!==null&&Number.isFinite(v.value)&&v.change!==null&&Number.isFinite(v.change);
const direction=(n:number)=>n>0.2?'UPSIDE' as const:n< -0.2?'DOWNSIDE' as const:'MIXED' as const;
/** Market direction is computed once, with no product symbol or leverage multiplier. */
export function semiconductorContext(items:ContextItem[],breadth:BreadthState,cutoff:string):SemiconductorContext {
  const direct=items.find(i=>i.label==='ICESEMIT'&&i.role==='PRIMARY'&&usable(i,cutoff))??null;
  const secondary=items.find(i=>i.label==='SOX'&&i.role==='PROXY'&&usable(i,cutoff))??null;
  const sample=breadth.state==='AVAILABLE'&&breadth.advanceRatio!==null&&breadth.medianChange!==null
    ?breadth.advanceRatio>=0.7&&breadth.medianChange>0.2?'UPSIDE':breadth.advanceRatio<=0.3&&breadth.medianChange< -0.2?'DOWNSIDE':'MIXED':'UNKNOWN';
  const primary=direct??secondary;
  const conflicts:string[]=[];
  if(primary&&breadth.state==='AVAILABLE'&&primary.observedAt?.slice(0,10)!==breadth.observationDate)conflicts.push('INDEX_VS_BREADTH_DATE_MISMATCH');
  if(primary&&sample!=='UNKNOWN'&&sample!=='MIXED'&&direction(primary.change!)!==sample)conflicts.push('INDEX_VS_SAMPLE_BREADTH');
  if(direct&&secondary&&direction(direct.change!)!==direction(secondary.change!))conflicts.push('TARGET_VS_SECONDARY_INDEX');
  // Sample leaders alone cannot impersonate a verified target benchmark.
  return {direct,secondary,state:conflicts.length?'MIXED':primary?direction(primary.change!):'UNKNOWN',
    basis:direct?'DIRECT_BENCHMARK':secondary?'PROXY_ONLY':'UNAVAILABLE',conflicts,
    evidenceIds:[...(direct?[direct.canonicalId]:[]),...(secondary?[secondary.canonicalId]:[]),...breadth.evidenceIds]};
}
/** No ticker heuristics: only a verified issuer objective can transform sector direction. */
export function instrumentContextEffect(symbol:string,market:SemiconductorContext,mechanics:VerifiedMechanics|null,
  cutoff:string,quote:{observedAt:string|null;session:string;stale:boolean}|null):InstrumentContextEffect {
  const p=mechanics?.profile;
  const valid=!!mechanics&&mechanics.symbol===symbol&&mechanics.verification==='ISSUER_OBJECTIVE_RECEIPT'
    &&/^[a-f0-9]{64}$/.test(mechanics.fingerprint)&&mechanics.canonicalId==='mechanics:'+mechanics.fingerprint
    &&Date.parse(mechanics.fetchedAt)<=Date.parse(cutoff)&&mechanics.benchmarkId==='ICESEMIT'
    &&p?.assetClass==='ETF'&&p.dailyReset===true&&p.leverageMultiple!==null&&p.leverageMultiple>0
    &&['LONG','INVERSE'].includes(p.leverageDirection)&&p.underlying==='NYSE Semiconductor Index';
  const risks:string[]=[];
  if(valid)risks.push('DAILY_LEVERAGE_PATH_DEPENDENCY','VOLATILITY_DECAY','OBSERVED_MOVE_NOT_FUTURE_RETURN');
  if(!quote||quote.stale)risks.push('STALE_OR_INSUFFICIENT_PRICE');
  const reference=market.direct??market.secondary;
  if(reference&&quote&&(reference.observedAt?.slice(0,10)!==quote.observedAt?.slice(0,10)||reference.session!==quote.session))risks.push('SESSION_MISMATCH');
  if(market.basis!=='DIRECT_BENCHMARK')risks.push('DIRECT_BENCHMARK_UNAVAILABLE');
  if(market.conflicts.length)risks.push(...market.conflicts);
  let state:InstrumentContextEffect['state']='UNKNOWN';
  if(valid&&market.state==='MIXED')state='MIXED';
  if(valid&&['UPSIDE','DOWNSIDE'].includes(market.state))state=(market.state==='UPSIDE')===(p!.leverageDirection==='LONG')?'POTENTIALLY_SUPPORTIVE':'ADVERSE';
  return {state,basis:market.basis,mechanics:valid?mechanics:null,evidenceIds:[...market.evidenceIds,...(valid?[mechanics!.canonicalId]:[])],risks,
    reason:!valid?'검증된 상품 투자목표 없음: 방향 변환 보류.':market.state==='MIXED'?'반도체 지수와 표본 신호가 혼재합니다. 상품 방향성을 단정하지 않습니다.':market.state==='UNKNOWN'?'직접 지수·검증된 보조 지수 방향 미확인.':
      `${market.basis==='DIRECT_BENCHMARK'?'직접 benchmark':'보조 SOX 대용치만'}의 관측 방향을 일일 ${p!.leverageDirection} 구조에 대응한 조건부 맥락입니다. 미래 수익이나 진입 근거가 아닙니다.`,
    decisionRole:'CONTEXT_ONLY_NOT_CANDIDATE_VOTE'};
}
