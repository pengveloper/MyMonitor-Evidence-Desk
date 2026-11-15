/**
 * Structured, deterministic situation briefing output. The model consumes
 * canonical observations; it does not fetch, score, predict, or recommend a
 * trade. It is intentionally UI-agnostic so the same result can later be
 * adapted to another intelligence-item contract.
 */

import { buildExecutiveIntelligence, isCurrentIntelligence, type ExecutiveContext, type ExecutiveIntelligence } from './executive-intelligence-model.ts';
import type {
  GlobalRadarCard,
  GlobalRadarModel,
  GlobalRadarSectionView,
  RadarCardSection,
} from './global-radar-model.ts';

export const SITUATION_SYNTHESIS_SCHEMA_VERSION = 'mymonitor-situation-synthesis/v1' as const;

export type BriefingCategory =
  | 'WORLD'
  | 'GEOPOLITICS_SECURITY'
  | 'MARKET'
  | 'MACRO'
  | 'ENERGY_COMMODITIES'
  | 'LOGISTICS_INFRASTRUCTURE'
  | 'COMPANY_SEC'
  | 'WATCHLIST'
  | 'DATA_QUALITY';

export type BriefingAvailability = 'AVAILABLE' | 'UPDATING' | 'DELAYED' | 'UNAVAILABLE' | 'NO_DATA';
export type BriefingFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';
export type CanonicalImportanceLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type SituationSignal =
  | 'GEOPOLITICAL_RISK_UP'
  | 'ENERGY_PRICE_UP'
  | 'LOGISTICS_PRESSURE_UP'
  | 'MARKET_DOWN'
  | 'MARKET_UP'
  | 'VOLATILITY_UP'
  | 'VOLATILITY_DOWN'
  | 'BREADTH_STRONG'
  | 'BREADTH_WEAK'
  | 'ENERGY_PRICE_DOWN'
  | 'DEFENSIVE_RELATIVE_STRENGTH'
  | 'LONG_RATE_UP'
  | 'GROWTH_PRESSURE'
  | 'NEW_SEC_EVIDENCE'
  | 'WATCHLIST_LINK';

export interface BriefingSource {
  id: string;
  label: string;
  mode?: 'LIVE' | 'PUBLIC_SNAPSHOT' | 'STALE' | 'UNAVAILABLE';
  href?: string;
}

export interface CanonicalImportance {
  level: CanonicalImportanceLevel;
  /** Prevents callers from presenting an invented model score as canonical. */
  basis: 'CANONICAL_SEVERITY' | 'CANONICAL_RISK';
}

export interface SituationNextCheckInput {
  label: string;
  reason: string;
  deepLink: string;
}

export interface SituationEvidence {
  context?: ExecutiveContext;
  id: string;
  category: BriefingCategory;
  title: string;
  summary: string;
  originalTitle?: string;
  originalSummary?: string;
  relevanceReason: string;
  observedAt: string | null;
  source: BriefingSource | null;
  freshness: BriefingFreshness;
  evidenceRefs: string[];
  deepLink: string;
  availability: BriefingAvailability;
  importance?: CanonicalImportance;
  signals?: SituationSignal[];
  uncertainty?: string;
  /** Upstream/debug provenance for an explicit detail affordance, never the compact summary. */
  internalReason?: string;
  /** Explicit canonical references that disagree with this observation. */
  conflictsWithEvidenceRefs?: string[];
  nextCheck?: SituationNextCheckInput;
}

export interface BriefingEntry {
  context?: ExecutiveContext;
  id: string;
  category: BriefingCategory;
  title: string;
  summary: string;
  originalTitle?: string;
  originalSummary?: string;
  importanceReason: string;
  observedAt: string | null;
  source: BriefingSource | null;
  freshness: BriefingFreshness;
  evidenceRefs: string[];
  deepLink: string;
  availability: BriefingAvailability;
  importance?: CanonicalImportance;
  signals: SituationSignal[];
  conflictsWithEvidenceRefs: string[];
  details: {
    mainChanges: string[];
    relatedEvidence: string[];
    whyImportant: string;
    uncertainty: string;
    internalReason?: string;
    nextCheck: SituationNextCheckInput;
  };
}

export interface BriefingSection {
  category: BriefingCategory;
  label: string;
  availability: BriefingAvailability;
  summary: string;
  entries: BriefingEntry[];
}

export interface ActionableNextCheck {
  id: string;
  label: string;
  reason: string;
  evidenceRefs: string[];
  deepLink: string;
}

export type SynthesisExpandedKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface SynthesisExpandedBlock {
  key: SynthesisExpandedKey;
  title: string;
  summary: string;
  evidenceRefs: string[];
  deepLinks: string[];
}

export interface SituationSynthesis {
  oneLineSituation: string;
  importantChanges: Array<{
    title: string;
    evidenceRefs: string[];
    deepLink: string;
  }>;
  interpretation: string;
  interpretationBasis: 'RULE_BASED';
  conditionalSuggestion: {
    condition: string;
    action: string;
    otherwise: string;
    evidenceRefs: string[];
    deepLink: string;
  } | null;
  uncertainty: string;
  nextChecks: ActionableNextCheck[];
  expanded: SynthesisExpandedBlock[];
}

export interface SituationBriefingModel {
  executive: ExecutiveIntelligence;
  schemaVersion: typeof SITUATION_SYNTHESIS_SCHEMA_VERSION;
  generatedAt: string;
  sections: BriefingSection[];
  entries: BriefingEntry[];
  synthesis: SituationSynthesis;
}

export interface SituationBriefingInput {
  generatedAt: string;
  evidence: readonly SituationEvidence[];
}

export const SITUATION_CATEGORY_LABELS: Readonly<Record<BriefingCategory, string>> = {
  WORLD: '세계',
  GEOPOLITICS_SECURITY: '지정학/안보',
  MARKET: '시장',
  MACRO: '거시',
  ENERGY_COMMODITIES: '에너지/원자재',
  LOGISTICS_INFRASTRUCTURE: '물류/인프라',
  COMPANY_SEC: '기업/SEC',
  WATCHLIST: '내 관심종목',
  DATA_QUALITY: '데이터 품질',
};

export const SITUATION_AVAILABILITY_LABELS: Readonly<Record<BriefingAvailability, string>> = {
  AVAILABLE: '정상',
  UPDATING: '업데이트 중',
  DELAYED: '업데이트 지연',
  UNAVAILABLE: '사용 불가',
  NO_DATA: '데이터 없음',
};

const CATEGORY_ORDER = Object.keys(SITUATION_CATEGORY_LABELS) as BriefingCategory[];
const IMPORTANCE_ORDER: Readonly<Record<CanonicalImportanceLevel, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

interface SupportedRelation {
  signals: SituationSignal[];
  statement: string;
}

const SUPPORTED_RELATIONS: readonly SupportedRelation[] = [
  {
    signals: ['GEOPOLITICAL_RISK_UP', 'ENERGY_PRICE_UP', 'LOGISTICS_PRESSURE_UP'],
    statement: '지정학 위험, 에너지 가격, 운송 압박 신호가 동시에 관측됐습니다. 인과관계는 확인되지 않았으며 연결 가능성을 추가 확인해야 합니다.',
  },
  {
    signals: ['MARKET_DOWN', 'DEFENSIVE_RELATIVE_STRENGTH'],
    statement: '시장 약세와 방어 업종의 상대 강세가 동시에 관측됐습니다. 위험 회피 흐름일 가능성은 있으나 원인으로 단정할 수 없습니다.',
  },
  {
    signals: ['LONG_RATE_UP', 'GROWTH_PRESSURE'],
    statement: '장기 금리 상승과 성장주 압박이 동시에 관측됐습니다. 두 신호의 연결 가능성은 있으나 별도 요인도 확인해야 합니다.',
  },
  {
    signals: ['NEW_SEC_EVIDENCE', 'WATCHLIST_LINK'],
    statement: '새 기업 공시 근거와 관심종목 연결이 함께 확인됐습니다. 공시 원문을 확인해 실제 영향을 판단할 필요가 있습니다.',
  },
];

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function evidenceRefs(evidence: SituationEvidence): string[] {
  return unique([evidence.id, ...evidence.evidenceRefs]);
}

function defaultUncertainty(evidence: SituationEvidence): string {
  if (evidence.availability === 'UNAVAILABLE' || evidence.availability === 'NO_DATA') {
    return '현재 신뢰 가능한 데이터가 부족해 해석을 보류합니다.';
  }
  if (evidence.availability === 'DELAYED' || evidence.freshness === 'STALE') {
    return '관측이 지연되어 현재 상황과 다를 수 있습니다.';
  }
  if (evidence.freshness === 'UNKNOWN') return '관측 시점의 최신성을 추가 확인해야 합니다.';
  return '공개 관측만으로 원인이나 향후 방향을 확정할 수 없습니다.';
}

function defaultNextCheck(evidence: SituationEvidence): string {
  if (evidence.availability === 'DELAYED' || evidence.availability === 'UNAVAILABLE') {
    return '데이터가 복구된 뒤 같은 항목을 다시 확인하세요.';
  }
  if (evidence.category === 'WORLD' || evidence.category === 'GEOPOLITICS_SECURITY') {
    return `“${evidence.title}”의 원문, 후속 보도, 독립 출처를 확인하세요.`;
  }
  if (evidence.category === 'LOGISTICS_INFRASTRUCTURE') return `“${evidence.title}”의 운임·항만·선사 운항 관측과 기준 시각을 확인하세요.`;
  if (evidence.category === 'ENERGY_COMMODITIES') return `“${evidence.title}”의 에너지 가격 방향과 기준 시각을 확인하세요.`;
  if (evidence.category === 'MARKET') return `“${evidence.title}”의 가격 방향·변동성·관측 시각을 확인하세요.`;
  if (evidence.category === 'MACRO') return `“${evidence.title}”의 최신 발표값과 이전 관측을 대조하세요.`;
  if (evidence.category === 'COMPANY_SEC') return 'SEC 공시 원문에서 희석·상장 유지·자금조달 관련 실제 조항을 확인하세요.';
  if (evidence.category === 'WATCHLIST') return `“${evidence.title}”과 관심기업의 실제 노출·최신 공시를 확인하세요.`;
  return `“${evidence.title}”의 데이터 상태와 마지막 정상 관측 시각을 확인하세요.`;
}

function nextCheckFor(evidence: SituationEvidence): SituationNextCheckInput {
  return evidence.nextCheck ?? {
    label: defaultNextCheck(evidence),
    reason: evidence.availability === 'DELAYED' || evidence.availability === 'UNAVAILABLE'
      ? `${SITUATION_CATEGORY_LABELS[evidence.category]} 데이터 상태가 ${SITUATION_AVAILABILITY_LABELS[evidence.availability]}입니다.`
      : evidence.relevanceReason,
    deepLink: evidence.deepLink,
  };
}

function toEntry(evidence: SituationEvidence): BriefingEntry {
  return {
    ...(evidence.context ? { context: evidence.context } : {}),
    id: evidence.id,
    category: evidence.category,
    title: evidence.title,
    summary: evidence.summary,
    ...(evidence.originalTitle ? { originalTitle: evidence.originalTitle } : {}),
    ...(evidence.originalSummary ? { originalSummary: evidence.originalSummary } : {}),
    importanceReason: evidence.relevanceReason,
    observedAt: evidence.observedAt,
    source: evidence.source,
    freshness: evidence.freshness,
    evidenceRefs: evidenceRefs(evidence),
    deepLink: evidence.deepLink,
    availability: evidence.availability,
    ...(evidence.importance ? { importance: evidence.importance } : {}),
    signals: unique(evidence.signals ?? []) as SituationSignal[],
    conflictsWithEvidenceRefs: unique(evidence.conflictsWithEvidenceRefs ?? []),
    details: {
      mainChanges: [evidence.summary],
      relatedEvidence: evidenceRefs(evidence),
      whyImportant: evidence.relevanceReason,
      uncertainty: evidence.uncertainty ?? defaultUncertainty(evidence),
      ...(evidence.internalReason ? { internalReason: evidence.internalReason } : {}),
      nextCheck: nextCheckFor(evidence),
    },
  };
}

function sectionAvailability(entries: readonly BriefingEntry[]): BriefingAvailability {
  if (entries.some((entry) => entry.availability === 'AVAILABLE')) return 'AVAILABLE';
  if (entries.some((entry) => entry.availability === 'UPDATING')) return 'UPDATING';
  if (entries.some((entry) => entry.availability === 'DELAYED')) return 'DELAYED';
  if (entries.some((entry) => entry.availability === 'UNAVAILABLE')) return 'UNAVAILABLE';
  return 'NO_DATA';
}

function sectionSummary(entries: readonly BriefingEntry[]): string {
  const usable = entries.filter((entry) => entry.availability === 'AVAILABLE' || entry.availability === 'DELAYED');
  if (usable.length === 0) return '현재 신뢰 가능한 데이터 부족';
  if (usable[0]?.category === 'WORLD') {
    return `${usable.length}건의 서로 다른 기사 관측이 있습니다. 각 기사의 근거와 시각을 별도로 확인하세요.`;
  }
  return usable.slice(0, 2).map((entry) => entry.summary).join(' · ');
}

function isFreshAvailable(entry: BriefingEntry): boolean {
  return entry.availability === 'AVAILABLE' && entry.freshness === 'FRESH';
}

function importantEntries(entries: readonly BriefingEntry[]): BriefingEntry[] {
  const eligible = entries.filter(isFreshAvailable);
  const classified = eligible.filter((entry) => entry.importance);
  if (classified.length === 0) {
    return eligible.slice(0, 3);
  }
  return classified
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const rank = IMPORTANCE_ORDER[left.entry.importance!.level] - IMPORTANCE_ORDER[right.entry.importance!.level];
      return rank || left.index - right.index;
    })
    .slice(0, 3)
    .map(({ entry }) => entry);
}

function supportedRelations(entries: readonly BriefingEntry[]): Array<{ statement: string; entries: BriefingEntry[] }> {
  const usable = entries.filter(isFreshAvailable);
  return SUPPORTED_RELATIONS.flatMap((relation) => {
    const matches = relation.signals.map((signal) => usable.find((entry) => entry.signals.includes(signal)));
    if (matches.some((entry) => !entry)) return [];
    return [{ statement: relation.statement, entries: matches as BriefingEntry[] }];
  });
}

function makeNextCheck(entry: BriefingEntry): ActionableNextCheck {
  return {
    id: `next:${entry.id}`,
    label: entry.details.nextCheck.label,
    reason: entry.details.nextCheck.reason,
    evidenceRefs: entry.evidenceRefs,
    deepLink: entry.details.nextCheck.deepLink,
  };
}

function nextChecks(entries: readonly BriefingEntry[], important: readonly BriefingEntry[]): ActionableNextCheck[] {
  const degraded = entries.filter((entry) => entry.availability === 'DELAYED' || entry.availability === 'UNAVAILABLE');
  const candidates = [...important, ...degraded, ...entries].filter((entry, index, all) => (
    all.findIndex((candidate) => candidate.id === entry.id) === index && entry.deepLink.length > 0
  ));
  return candidates.slice(0, 3).map(makeNextCheck);
}

function relationshipNextChecks(executive: ExecutiveIntelligence): ActionableNextCheck[] {
  const relationshipLabels = {
    OBSERVED: '직접 연결 관측',
    SUPPORTED_HYPOTHESIS: '근거 있는 연결 가설',
    CANDIDATE: '확인 전 연결 후보',
    COUNTER_SIGNAL: '반대 방향 신호',
  } as const;
  return executive.relationships.map((relation) => ({
    id: `next:${relation.id}`,
    label: relation.whatToCheckNext,
    reason: `${relation.source.domain} → ${relation.target.domain} ${relationshipLabels[relation.type]}의 후속 검증`,
    evidenceRefs: unique([...relation.supportingEvidenceRefs, ...relation.counterEvidenceRefs]),
    deepLink: executive.allRanked.find((item) => item.entry.id === relation.source.id)?.entry.deepLink ?? '#mapSection',
  }));
}

function block(
  key: SynthesisExpandedKey,
  title: string,
  entries: readonly BriefingEntry[],
  fallback = '현재 신뢰 가능한 데이터 부족',
): SynthesisExpandedBlock {
  const usable = entries.filter(isFreshAvailable);
  return {
    key,
    title,
    summary: usable.length > 0 ? usable.slice(0, 2).map((entry) => entry.summary).join(' · ') : fallback,
    evidenceRefs: unique(usable.flatMap((entry) => entry.evidenceRefs)),
    deepLinks: unique(usable.map((entry) => entry.deepLink)),
  };
}

function expandedBlocks(
  entries: readonly BriefingEntry[],
  sections: readonly BriefingSection[],
  relations: ReturnType<typeof supportedRelations>,
  checks: readonly ActionableNextCheck[],
): SynthesisExpandedBlock[] {
  const inCategories = (...categories: BriefingCategory[]) => entries.filter((entry) => categories.includes(entry.category));
  const relationEntries = relations.flatMap((relation) => relation.entries);
  const gaps = entries.filter((entry) => (
    entry.availability === 'DELAYED' || entry.availability === 'UNAVAILABLE' || entry.availability === 'NO_DATA'
  ));
  const relationSummary = relations.length > 0
    ? relations.map((relation) => relation.statement).join(' ')
    : '교차 영역 관계를 설명할 충분한 근거가 아직 없습니다.';
  const conflictEntries = entries.filter((entry) => entry.conflictsWithEvidenceRefs.length > 0);
  const missingCategories = sections
    .filter((section) => section.availability === 'NO_DATA')
    .map((section) => section.label);
  const groupedGaps = new Map<string, BriefingEntry[]>();
  for (const entry of gaps) {
    const key = `${entry.category}|${entry.source?.id ?? 'UNKNOWN'}|${entry.availability}`;
    groupedGaps.set(key, [...(groupedGaps.get(key) ?? []), entry]);
  }
  const gapDescriptions = [...groupedGaps.values()].map((group) => {
    const first = group[0]!;
    const examples = group.slice(0, 3).map((entry) => entry.title).join(', ');
    return `${SITUATION_CATEGORY_LABELS[first.category]} · ${first.source?.label ?? '출처 미확인'} · ${SITUATION_AVAILABILITY_LABELS[first.availability]} ${group.length}건${examples ? ` · 예: ${examples}` : ''}`;
  });
  if (missingCategories.length > 0) gapDescriptions.push(`데이터 없음: ${missingCategories.join(', ')}`);
  const gapBlock: SynthesisExpandedBlock = {
    key: 'F',
    title: '데이터 공백',
    summary: gapDescriptions.length > 0
      ? `종합 판단에서 제외: ${gapDescriptions.join(' · ')}`
      : '현재 표시된 관측에는 명시된 데이터 공백이 없습니다.',
    evidenceRefs: unique(gaps.flatMap((entry) => entry.evidenceRefs)),
    deepLinks: unique(gaps.map((entry) => entry.deepLink)),
  };
  return [
    block('A', '현재 세계 상황', inCategories('WORLD', 'GEOPOLITICS_SECURITY')),
    block('B', '시장/거시 의미', inCategories('MARKET', 'MACRO')),
    block('C', '에너지/물류 영향', inCategories('ENERGY_COMMODITIES', 'LOGISTICS_INFRASTRUCTURE')),
    block('D', '기업/SEC/관심종목 연결', inCategories('COMPANY_SEC', 'WATCHLIST')),
    block('E', '서로 상충하는 신호', conflictEntries, '명시적으로 확인된 상충 신호가 없습니다.'),
    gapBlock,
    {
      key: 'G', title: '전체적으로 지금 무엇을 의미하는가', summary: relationSummary,
      evidenceRefs: unique(relationEntries.flatMap((entry) => entry.evidenceRefs)),
      deepLinks: unique(relationEntries.map((entry) => entry.deepLink)),
    },
    {
      key: 'H', title: '다음 행동/확인 제안',
      summary: checks.length > 0 ? checks.map((check) => check.label).join(' · ') : '추가로 제안할 확인 항목이 없습니다.',
      evidenceRefs: unique(checks.flatMap((check) => check.evidenceRefs)),
      deepLinks: unique(checks.map((check) => check.deepLink)),
    },
  ];
}

function buildSynthesis(
  entries: readonly BriefingEntry[],
  sections: readonly BriefingSection[],
  executive: ExecutiveIntelligence,
): SituationSynthesis {
  const important = importantEntries(entries);
  const relations = supportedRelations(entries);
  const relationshipChecks = relationshipNextChecks(executive);
  const checks = [...relationshipChecks, ...nextChecks(entries, important)]
    .filter((check, index, all) => all.findIndex((candidate) => candidate.label === check.label) === index)
    .slice(0, 3);
  const usable = entries.filter(isFreshAvailable);
  const delayed = entries.filter((entry) => entry.availability === 'DELAYED' || entry.freshness === 'STALE');
  const unavailable = entries.filter((entry) => entry.availability === 'UNAVAILABLE' || entry.availability === 'NO_DATA');
  const oneLineSituation = relations[0]?.statement
    ?? important[0]?.summary
    ?? '현재 신뢰 가능한 데이터를 충분히 확보하지 못했습니다.';
  const interpretation = relations.length > 0
    ? relations.map((relation) => relation.statement).join(' ')
    : usable.length > 0
      ? '확인된 관측은 있지만, 서로의 관계나 인과를 판단할 근거는 아직 부족합니다.'
      : '현재는 종합 해석보다 데이터 복구와 출처 확인이 우선입니다.';
  const uncertaintyParts = [
    delayed.length > 0 ? `${delayed.length}개 관측이 지연됐습니다.` : '',
    unavailable.length > 0 ? `${unavailable.length}개 영역에 신뢰 가능한 데이터가 부족합니다.` : '',
    '공개 관측의 동시 발생은 인과관계를 뜻하지 않습니다.',
  ];
  return {
    oneLineSituation,
    importantChanges: important.map((entry) => ({
      title: entry.title,
      evidenceRefs: entry.evidenceRefs,
      deepLink: entry.deepLink,
    })),
    interpretation,
    interpretationBasis: 'RULE_BASED',
    conditionalSuggestion: important[0] ? {
      condition: `“${important[0].title}”의 최신 독립 근거가 같은 방향을 확인하면`,
      action: important[0].details.nextCheck.label,
      otherwise: '확인되지 않거나 반대 근거가 나오면 현재 해석을 보류하고 다음 관측을 기다리세요.',
      evidenceRefs: important[0].evidenceRefs,
      deepLink: important[0].details.nextCheck.deepLink,
    } : null,
    uncertainty: uncertaintyParts.filter(Boolean).join(' '),
    nextChecks: checks,
    expanded: expandedBlocks(entries, sections, relations, checks),
  };
}

export function buildSituationBriefing(input: SituationBriefingInput): SituationBriefingModel {
  const entries = input.evidence.map(toEntry).map((entry) => {
    if (entry.freshness !== 'FRESH' || entry.availability !== 'AVAILABLE' || isCurrentIntelligence(entry, input.generatedAt)) return entry;
    return { ...entry, freshness: 'STALE' as const, availability: 'DELAYED' as const };
  });
  const sections = CATEGORY_ORDER.map((category): BriefingSection => {
    const sectionEntries = entries.filter((entry) => entry.category === category);
    return {
      category,
      label: SITUATION_CATEGORY_LABELS[category],
      availability: sectionAvailability(sectionEntries),
      summary: sectionSummary(sectionEntries),
      entries: sectionEntries.slice(0, 2),
    };
  });
  const executive = buildExecutiveIntelligence(entries, input.generatedAt);
  const synthesis = buildSynthesis(entries, sections, executive);
  return {
    executive,
    schemaVersion: SITUATION_SYNTHESIS_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    sections,
    entries,
    synthesis: { ...synthesis, oneLineSituation: executive.headline },
  };
}

const RADAR_CATEGORY: Readonly<Record<RadarCardSection, BriefingCategory>> = {
  WORLD: 'WORLD',
  MARKET: 'MARKET',
  MACRO: 'MACRO',
  SEC: 'COMPANY_SEC',
  WATCHLIST: 'WATCHLIST',
};

const RADAR_RELEVANCE: Readonly<Record<RadarCardSection, string>> = {
  WORLD: '세계 상황의 변화와 후속 위험을 확인하는 공개 근거입니다.',
  MARKET: '시장 방향과 변동성 환경을 확인하는 관측입니다.',
  MACRO: '금리와 경기 여건이 시장과 경제에 연결될 수 있는 관측입니다.',
  SEC: '기업의 공식 공시 근거가 관심종목 판단에 연결될 수 있습니다.',
  WATCHLIST: '소유자가 선택한 관심종목과 연결된 공개 관측입니다.',
};

function radarAvailability(section: GlobalRadarSectionView): BriefingAvailability {
  if (section.status === 'AVAILABLE') return 'AVAILABLE';
  if (section.status === 'STALE') return 'DELAYED';
  return 'UNAVAILABLE';
}

function radarFreshness(card: GlobalRadarCard): BriefingFreshness {
  if (card.source.mode === 'STALE') return 'STALE';
  if (card.source.mode === 'LIVE') return 'FRESH';
  return 'UNKNOWN';
}

function radarCardAvailability(card: GlobalRadarCard, section: GlobalRadarSectionView): BriefingAvailability {
  if (card.source.mode === 'LIVE' || card.source.mode === 'PUBLIC_SNAPSHOT') return 'AVAILABLE';
  if (card.source.mode === 'STALE') return 'DELAYED';
  return radarAvailability(section);
}

function radarObservedAt(card: GlobalRadarCard): string | null {
  return card.observedAt ?? card.source.observedAt ?? null;
}

function radarSignals(card: GlobalRadarCard): SituationSignal[] {
  const change = card.changePercent;
  if (typeof change !== 'number' || !Number.isFinite(change) || change === 0) return [];
  if (/SP500|\^GSPC/i.test(card.id)) return [change < 0 ? 'MARKET_DOWN' : 'MARKET_UP'];
  if (/VIX/i.test(card.id)) return [change > 0 ? 'VOLATILITY_UP' : 'VOLATILITY_DOWN'];
  return [];
}
function radarEvidence(card: GlobalRadarCard, section: GlobalRadarSectionView): SituationEvidence {
  return {
    id: card.id,
    category: RADAR_CATEGORY[card.section],
    context: {
      // Radar news region is the publisher country, not an event location.
      region: card.section === 'WORLD' || card.originCardId ? undefined : card.region,
      symbols: card.stockLinks?.map((link) => link.symbol) ?? (card.section === 'WATCHLIST' ? card.symbols : []),
      ownerNew: card.ownerChange === 'NEW',
      ...(card.translation ? { translation: { status: card.translation.status, reason: card.translation.reason } } : {}),
      confirmed: card.evidenceStatus === 'CONFIRMED',
      originId: card.originCardId,
      ...(card.section === 'MARKET' || card.section === 'MACRO' ? {
        metric: { id: card.id, value: card.value, changePercent: card.changePercent },
      } : {}),
    },
    signals: radarSignals(card),
    title: card.title,
    summary: card.detail ?? (card.value ? `${card.title} ${card.value}` : card.title),
    ...(card.originalTitle ? { originalTitle: card.originalTitle } : {}),
    ...(card.originalDetail ? { originalSummary: card.originalDetail } : {}),
    relevanceReason: RADAR_RELEVANCE[card.section],
    observedAt: radarObservedAt(card),
    source: {
      id: card.source.id,
      label: card.source.label,
      mode: card.source.mode,
      ...(card.source.href ? { href: card.source.href } : {}),
    },
    freshness: radarFreshness(card),
    evidenceRefs: card.originCardId ? [card.originCardId] : [],
    deepLink: card.href ?? card.source.href ?? '#panelsGrid',
    availability: radarCardAvailability(card, section),
  };
}

function radarDataQualityEvidence(section: GlobalRadarSectionView): SituationEvidence | null {
  if (section.status === 'AVAILABLE') return null;
  const delayed = section.status === 'STALE';
  const internalReason = section.unavailableSources?.map((failure) => (
    `${failure.label ?? failure.id} ${failure.reason}`
  )).join(' · ') || section.unavailableReason;
  return {
    id: `data-quality:${section.key.toLowerCase()}`,
    category: 'DATA_QUALITY',
    title: `${SITUATION_CATEGORY_LABELS[RADAR_CATEGORY[section.key]]} ${delayed ? '업데이트 지연' : '사용 불가'}`,
    summary: delayed
      ? `${section.title}의 마지막 정상 관측 이후 업데이트가 지연되고 있습니다.`
      : `${section.title}의 신뢰 가능한 최신 관측을 현재 확인할 수 없습니다.`,
    relevanceReason: '데이터 공백을 숨기지 않고 해석 범위를 제한하기 위한 상태 근거입니다.',
    observedAt: section.source.observedAt ?? section.source.capturedAt ?? null,
    source: {
      id: section.source.id,
      label: section.source.label,
      ...(section.source.href ? { href: section.source.href } : {}),
    },
    freshness: delayed ? 'STALE' : 'UNKNOWN',
    evidenceRefs: [],
    deepLink: '#panelsGrid',
    availability: delayed ? 'DELAYED' : 'UNAVAILABLE',
    uncertainty: delayed ? '마지막 관측이 현재 상황과 다를 수 있습니다.' : '최신 데이터를 확인할 수 없습니다.',
    ...(internalReason ? { internalReason } : {}),
  };
}

/**
 * Thin adapter for the current canonical Global Radar model. Other panel
 * adapters can append energy, logistics, or other evidence without changing
 * the synthesis rules.
 */
export function buildSituationBriefingFromRadar(
  radar: GlobalRadarModel,
  additionalEvidence: readonly SituationEvidence[] = [],
): SituationBriefingModel {
  const radarEntries = radar.sections.flatMap((section) => section.cards.map((card) => radarEvidence(card, section)));
  const dataQuality = radar.sections.flatMap((section) => {
    const evidence = radarDataQualityEvidence(section);
    return evidence ? [evidence] : [];
  });
  return buildSituationBriefing({
    generatedAt: radar.generatedAt,
    evidence: [...radarEntries, ...dataQuality, ...additionalEvidence],
  });
}
