import { ownerInstrumentProfile, ownerPosition } from '../../../shared/owner-intelligence-core';
import type { OwnerInstrumentProfile } from '../../../shared/owner-intelligence-contract';
import type { MarketDataResultStatus } from '../../../shared/market-data/contracts';

// Disclosed provider-shaped fixtures, not current market metadata or holdings.
const profiles: Record<string, { name: string; type: string }> = {
  SOXS: { name: 'Daily Semiconductor Bear 3X ETF (fixture)', type: 'ETF' },
  SOXL: { name: 'Daily Semiconductor Bull 3X ETF (fixture)', type: 'ETF' },
  CISS: { name: 'C3is shipping (fixture)', type: 'Common Stock' },
  KORU: { name: 'Daily Korea Bull 3X ETF (fixture)', type: 'ETF' },
};
export function previewProfile(symbol: string): OwnerInstrumentProfile {
  const position = ownerPosition(symbol, null, null, null, Date.parse('2026-09-22T05:00:00Z'));
  return ownerInstrumentProfile({ profile: profiles[symbol] ?? {} }, position);
}
export function describePreviewInstrument(profile: OwnerInstrumentProfile) {
  if (profile.assetClass === 'EQUITY') return {
    kind: '기업 주식', mechanics: '기업 실적과 자본구조를 확인합니다. 상품 분류 자체는 가격 방향의 근거가 아닙니다.',
    condition: '현금흐름이 개선되고 신규 발행에 따른 주당 가치 변화가 확인되는 경우를 검토합니다.',
    evidence: '실적 원문, 발행 주식 수와 실제 발행 공시, 유동성 자료',
    risk: '실적 악화·유동성 부족·희석 가능성을 확인합니다. ATM capacity는 실제 발행을 의미하지 않습니다.',
  };
  if (profile.assetClass === 'ETF') return {
    kind: 'ETF', mechanics: `${profile.leverageDirection === 'INVERSE' ? '역방향' : profile.leverageDirection === 'LONG' ? '같은 방향' : profile.leverageDirection === 'UNLEVERAGED' ? '비레버리지 분류' : '방향 UNKNOWN'} 노출 · 배수 ${profile.leverageMultiple ?? '미확인'}. 구조는 시장 방향의 근거가 아닙니다. ${profile.dailyReset === true ? '일일 재설정으로 누적 성과는 경로에 의존합니다.' : '재설정 주기는 별도 확인해야 합니다.'}`,
    condition: profile.leverageDirection === 'INVERSE' ? '공식 기초지수의 약세와 참여 종목의 폭이 확인되는 경우를 검토합니다.' : profile.leverageDirection === 'LONG' ? '공식 기초지수의 강세와 참여 종목의 폭이 확인되는 경우를 검토합니다.' : '공식 투자목표와 기초 노출을 확인한 뒤 시나리오를 검토합니다.',
    evidence: '운용사 투자목표, 직접 기초지수와 기준시각, 구성종목 참여 폭·환율 자료',
    risk: '기초지수 반전·추적 오차·환율 위험을 확인합니다. 레버리지·역방향 구조만으로 상승이나 하락을 예측하지 않습니다.',
  };
  return { kind: 'UNKNOWN · 상품 유형 미확인', mechanics: '유형 확인 전 기업 주식이나 펀드 설명을 적용하지 않습니다.', condition: null, evidence: '공식 상품 유형·투자목표·발행사 원문', risk: '상품 구조와 방향 모두 미확인입니다.' };
}

export const PREVIEW_STATES = {
  ready: '확인 가능한 샘플', loading: 'LOADING · 불러오는 중', empty: 'EMPTY/MISSING · 저장된 자료 없음',
  unsupported: 'UNSUPPORTED · 구현·연결되지 않은 기능', no_candidate: '조건을 충족한 후보 없음',
  insufficient_evidence: '근거 부족 · 판단 보류', stale: 'STALE · 오래된 근거', partial: '일부 자료만 확인',
  failed: 'FAILED · 일시적 조회 실패', cancelled: '작업 취소', budget_blocked: '예산 한도 · 분석 차단',
  auth_expired: '인증 만료', outdated_analysis: 'OUTDATED · 과거 분석', rejected_historical_analysis: '과거 오류 본문 숨김',
  translation_fallback: 'translation unavailable · 원문 유지',
} as const;
export type PreviewState = keyof typeof PREVIEW_STATES;
export function previewStatePolicy(state: PreviewState) {
  // Data availability and analysis currency remain separate; no production enum is changed.
  const status: MarketDataResultStatus = state === 'unsupported' ? 'UNSUPPORTED' : state === 'empty' ? 'NO_DATA' : state === 'failed' ? 'PROVIDER_ERROR' : state === 'stale' ? 'STALE' : state === 'partial' ? 'PARTIAL' : 'UNKNOWN';
  const blocked = ['unsupported', 'empty', 'failed', 'loading', 'cancelled', 'budget_blocked', 'auth_expired', 'rejected_historical_analysis', 'no_candidate'].includes(state);
  const message = state === 'unsupported' ? '아직 구현·연결되지 않아 재시도로 해결되지 않습니다. 실행 기능을 제공하지 않습니다.'
    : state === 'empty' ? '저장된 자료 없음: 결측을 0이나 정상 값으로 해석하지 않습니다.'
    : state === 'failed' ? '일시적 조회 실패: 실제 연결 후 재시도 대상입니다. 이 샘플에는 조회 경로가 없어 재시도 버튼을 제공하지 않습니다.'
    : state === 'loading' ? '완료 전 판단을 표시하지 않습니다.'
    : state === 'rejected_historical_analysis' ? '검증을 통과하지 못한 본문은 표시하지 않습니다. 감사 원문은 원래 저장 경로에 보존됩니다.'
    : state === 'outdated_analysis' ? '과거 시점의 해석입니다. 현재 판단이 아니며 바뀐 입력을 확인해야 합니다.'
    : state === 'stale' ? '근거가 오래되어 현재 판단은 보류합니다.'
    : state === 'no_candidate' ? '조건을 충족한 후보가 없습니다. 추천이나 선정 결론을 만들지 않습니다.'
    : '판단 보류 · 확인된 판단 근거 없음. 아래 조건은 미확인이며 추천 이유나 현재 결론이 아닙니다.';
  return { status, blocked, message };
}
