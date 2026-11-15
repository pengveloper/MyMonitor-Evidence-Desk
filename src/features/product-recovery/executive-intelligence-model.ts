import type { BriefingCategory, BriefingEntry, SituationSignal } from './situation-synthesis-model.ts';
import { assessMarketRegime, type MarketBreadthObservation, type MarketRegimeAssessment } from './market-regime.ts';

export type IntelligenceTopic = 'WORLD' | 'DISASTER' | 'GEOPOLITICS' | 'ENERGY' | 'LOGISTICS' | 'MACRO' | 'MARKET' | 'COMPANY' | 'SEC' | 'WATCHLIST';
export interface ExecutiveContext {
  observationKind?: 'EVENT';
  translation?: { status: string; reason?: string };
  region?: string;
  symbols?: string[];
  ownerNew?: boolean;
  confirmed?: boolean;
  originId?: string;
  metric?: { id: string; value?: string; changePercent?: number };
  marketBreadth?: MarketBreadthObservation;
  impact?: {
    magnitude?: number;
    casualties?: number;
    infrastructureImpactConfirmed?: boolean;
    marketImpactConfirmed?: boolean;
  };
}
export type IntelligenceReasonCode =
  | 'HIGH_IMPACT'
  | 'NEW_ESCALATION'
  | 'CROSS_DOMAIN'
  | 'MULTI_SOURCE'
  | 'MARKET_CONFIRMATION'
  | 'PERSONAL_RELEVANCE'
  | 'LOW_CONFIDENCE'
  | 'STALE_SOURCE'
  | 'NO_TRANSMISSION_YET'
  | 'FRESH_EVIDENCE'
  | 'SEVERE_SCALE';
export interface RankedIntelligence {
  entry: BriefingEntry;
  topics: IntelligenceTopic[];
  score: number;
  /** Compatibility alias for pre-V2 view consumers. */
  priority: number;
  reasons: string[];
  reasonCodes: IntelligenceReasonCode[];
  rankingReason: string;
  confidence: '중간' | '높음' | '낮음';
  supporting: BriefingEntry[];
  counter: BriefingEntry[];
  evidenceCount: number;
  sourceCount: number;
  marketConfirmation: 'CONFIRMED' | 'NOT_CONFIRMED' | 'NOT_APPLICABLE';
  decisionSupport: IntelligenceDecisionSupport;
}
export type IntelligenceDecisionStatus =
  | 'WATCH'
  | 'INVESTIGATE'
  | 'WAIT_FOR_CONFIRMATION'
  | 'RISK_REDUCE_CANDIDATE'
  | 'OPPORTUNITY_CANDIDATE'
  | 'NO_ACTION';
export interface IntelligenceDecisionSupport {
  status: IntelligenceDecisionStatus;
  because: string;
  counterEvidence: string;
  confirmationNeeded: string;
  invalidationCondition: string;
}
export type IntelligenceRelationshipType = 'OBSERVED' | 'SUPPORTED_HYPOTHESIS' | 'CANDIDATE' | 'COUNTER_SIGNAL';
export interface IntelligenceRelationship {
  id: string;
  source: { id: string; title: string; domain: IntelligenceTopic };
  target: { domain: IntelligenceTopic; entity?: string };
  type: IntelligenceRelationshipType;
  summary: string;
  supportingEvidenceRefs: string[];
  counterEvidenceRefs: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  whatToCheckNext: string;
}
export type IntelligenceChangeType = 'NEW' | 'ESCALATED' | 'DE_ESCALATED' | 'PERSISTENT' | 'UNCHANGED' | 'NO_LONGER_OBSERVED';
export interface IntelligenceStateSnapshot {
  id: string;
  title: string;
  score: number;
  observedAt: string | null;
  confidence: RankedIntelligence['confidence'];
  status: 'OBSERVED' | 'SOURCE_STALE' | 'SOURCE_UNAVAILABLE' | 'NOT_OBSERVED';
  label: string;
  evidenceFingerprint: string;
}
export interface IntelligenceChange {
  id: string;
  type: IntelligenceChangeType;
  previousState: IntelligenceStateSnapshot | null;
  currentState: IntelligenceStateSnapshot | null;
  changedAt: string;
  observedAt: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface IntelligenceChangeView {
  state: 'FIRST_CHECK' | 'COMPARED';
  lastCheckedAt?: string;
  items: IntelligenceChange[];
  topChanges: IntelligenceChange[];
}
export interface ExecutiveIntelligence {
  headline: string;
  hotspots: RankedIntelligence[];
  ranking: RankedIntelligence[];
  allRanked: RankedIntelligence[];
  coverage: { topic: IntelligenceTopic; count: number; kind: '관측' | '보도' | '없음' }[];
  essentialCoverage: EssentialCoverageItem[];
  excluded: BriefingEntry[];
  relationships: IntelligenceRelationship[];
  changes: IntelligenceChangeView;
  confidence: string;
  regime: MarketRegimeAssessment & { breadth?: MarketBreadthObservation; evidence: BriefingEntry[] };
  todayBriefing: {
    confirmedFacts: string[];
    conditionalInterpretation: string;
    counterEvidence: string;
    unknowns: string;
    nextSignal: string;
  };
  investment: {
    direction: string;
    action: string;
    counter: BriefingEntry[];
    currentCounterEvidence: BriefingEntry[];
    counterNote: string;
    changesWhen: string;
    changeConditions: string[];
    next: string;
    supporting: BriefingEntry[];
  };
  regions: { key: string; label: string; x: number; y: number; items: RankedIntelligence[] }[];
  watchlist: RankedIntelligence[];
}
export type EssentialCoverageDomain =
  | 'WORLD_NEWS'
  | 'GEOPOLITICS'
  | 'MARKET'
  | 'MACRO'
  | 'ENERGY'
  | 'LOGISTICS'
  | 'COMPANY_WATCHLIST';
export interface EssentialCoverageItem {
  domain: EssentialCoverageDomain;
  label: string;
  status: 'READY' | 'DEGRADED' | 'UNAVAILABLE';
  detail: string;
}
export const INTELLIGENCE_TOPIC_LABELS: Record<IntelligenceTopic, string> = {
  WORLD: '세계', DISASTER: '재난', GEOPOLITICS: '지정학', ENERGY: '에너지', LOGISTICS: '물류', MACRO: '거시', MARKET: '시장', COMPANY: '기업', SEC: '공시', WATCHLIST: '관심종목',
};
const CATEGORY_TOPIC: Record<BriefingCategory, IntelligenceTopic | null> = {
  WORLD: 'WORLD', GEOPOLITICS_SECURITY: 'GEOPOLITICS', MARKET: 'MARKET', MACRO: 'MACRO', ENERGY_COMMODITIES: 'ENERGY', LOGISTICS_INFRASTRUCTURE: 'LOGISTICS', COMPANY_SEC: 'COMPANY', WATCHLIST: 'WATCHLIST', DATA_QUALITY: null,
};
// These classify reported topics only. A headline keyword never creates a directional signal.
const REPORTED_TOPICS: [IntelligenceTopic, RegExp][] = [
  ['GEOPOLITICS', /\bwar\b|military|missile|ceasefire|sanction|conflict|hezbollah|airstrike|전쟁|군사|미사일|휴전|제재|분쟁|헤즈볼라|공습/i],
  ['DISASTER', /earthquake|tsunami|flood|wildfire|evacuat|지진|쓰나미|홍수|산불|대피/i],
  ['ENERGY', /\boil\b|\bgas\b|energy|\blng\b|opec|유가|원유|가스|에너지/i],
  ['LOGISTICS', /shipping|freight|port\b|strait|supply.chain|홍해|해협|해운|항만|운임|물류|공급망/i],
  ['MACRO', /inflation|central.bank|interest.rate|tariff|employment|인플레이션|중앙은행|금리|관세|고용/i],
];
const REGIONS = [
  { key: 'AMERICAS', label: '미주', x: 22, y: 40, match: /america|united states|canada|brazil|미국|미주|캐나다|브라질/i },
  { key: 'EUROPE', label: '유럽', x: 50, y: 25, match: /europe|ukraine|russia|britain|france|germany|유럽|우크라이나|러시아|영국|프랑스|독일/i },
  { key: 'MIDDLE_EAST', label: '중동', x: 59, y: 47, match: /middle.east|iran|israel|yemen|red.sea|hormuz|중동|이란|이스라엘|예멘|홍해|호르무즈/i },
  { key: 'AFRICA', label: '아프리카', x: 49, y: 64, match: /africa|sudan|congo|아프리카|수단|콩고/i },
  { key: 'ASIA_PACIFIC', label: '아시아·태평양', x: 80, y: 43, match: /asia|china|taiwan|korea|japan|australia|아시아|중국|대만|한국|일본|호주/i },
];
export function intelligenceTitle(entry: BriefingEntry): string {
  return entry.originalTitle && /한국어 번역을 사용할 수 없습니다/.test(entry.title)
    ? `${entry.originalTitle} · 원문` : entry.title;
}
export function intelligenceSummary(entry: BriefingEntry): string {
  return intelligenceTitle(entry) !== entry.title
    ? entry.originalSummary ?? entry.originalTitle ?? '' : entry.summary;
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

/** Rechecks the observation clock, never the retrieval clock, on every synthesis. */
export function isCurrentIntelligence(entry: BriefingEntry, generatedAt: string): boolean {
  if (/한국어 번역을 사용할 수 없습니다/.test(entry.title) && !entry.originalTitle) return false;
  if (entry.availability !== 'AVAILABLE' || entry.freshness !== 'FRESH') return false;
  if (entry.source?.mode && entry.source.mode !== 'LIVE') return false;
  const age = Date.parse(generatedAt) - Date.parse(entry.observedAt ?? '');
  const dailyMacro = /DGS10|DGS2|DFF/.test(entry.context?.metric?.id ?? '');
  const maxHours = entry.category === 'MACRO' && !dailyMacro ? 45 * 24
    : entry.category === 'MARKET' || dailyMacro ? 5 * 24 : 48;
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= maxHours * 3600_000;
}
export function topicsFor(entry: BriefingEntry): IntelligenceTopic[] {
  const topic = CATEGORY_TOPIC[entry.category];
  const topics = topic ? [topic] : [];
  if (entry.category === 'WORLD') {
    const text = `${entry.originalTitle ?? entry.title} ${entry.originalSummary ?? entry.summary}`;
    for (const [candidate, pattern] of REPORTED_TOPICS) if (pattern.test(text)) topics.push(candidate);
  }
  if (entry.category === 'COMPANY_SEC') topics.push('SEC');
  if (entry.context?.symbols?.length) topics.push('WATCHLIST');
  return unique(topics);
}
function identity(entry: BriefingEntry): string {
  if (entry.context?.originId) return entry.context.originId;
  if (entry.category === 'WORLD') {
    // Deduplicate by article link; unavailable translations have identical display titles.
    if (/^https?:/.test(entry.deepLink)) return entry.deepLink.split('#')[0]!;
    return (entry.originalTitle ?? entry.title).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  return entry.id;
}
function opposite(left: BriefingEntry, right: BriefingEntry): boolean {
  const pairs: [SituationSignal, SituationSignal][] = [
    ['MARKET_DOWN', 'MARKET_UP'], ['VOLATILITY_UP', 'VOLATILITY_DOWN'], ['ENERGY_PRICE_UP', 'ENERGY_PRICE_DOWN'],
  ];
  return pairs.some(([a, b]) => left.signals.includes(a) && right.signals.includes(b)
    || left.signals.includes(b) && right.signals.includes(a));
}
const REASON_LABELS: Readonly<Record<IntelligenceReasonCode, string>> = {
  HIGH_IMPACT: '영향 규모가 큼',
  NEW_ESCALATION: '지난 확인 뒤 새 변화',
  CROSS_DOMAIN: '여러 영역에 연결',
  MULTI_SOURCE: '복수 출처 근거',
  MARKET_CONFIRMATION: '시장 전이 신호 일부 관측',
  PERSONAL_RELEVANCE: '실제 관심종목과 연결',
  LOW_CONFIDENCE: '상충 또는 근거 품질 제한',
  STALE_SOURCE: '출처 최신성 제한',
  NO_TRANSMISSION_YET: '시장 전이 아직 미확인',
  FRESH_EVIDENCE: '최신 관측',
  SEVERE_SCALE: '중대한 피해·규모 근거',
};

function uniqueEvidenceRefs(entries: readonly BriefingEntry[]): string[] {
  return unique(entries.flatMap((entry) => [entry.id, ...entry.evidenceRefs]));
}

function marketTransmissionObserved(entries: readonly BriefingEntry[]): boolean {
  const signals = new Set(entries.flatMap((entry) => entry.signals));
  return signals.has('MARKET_DOWN') || signals.has('VOLATILITY_UP')
    || signals.has('MARKET_UP') || signals.has('VOLATILITY_DOWN')
    || signals.has('ENERGY_PRICE_UP') || signals.has('ENERGY_PRICE_DOWN');
}

function decisionSupportFor(
  entry: BriefingEntry,
  topics: readonly IntelligenceTopic[],
  confidence: RankedIntelligence['confidence'],
  reason: string,
  supporting: readonly BriefingEntry[],
  counter: readonly BriefingEntry[],
  marketConfirmation: RankedIntelligence['marketConfirmation'],
): IntelligenceDecisionSupport {
  const signals = new Set(supporting.flatMap((item) => item.signals));
  const status: IntelligenceDecisionStatus = confidence === '낮음'
    ? 'WAIT_FOR_CONFIRMATION'
    : topics.includes('WATCHLIST')
      ? 'INVESTIGATE'
      : signals.has('MARKET_DOWN') && signals.has('VOLATILITY_UP')
        ? 'RISK_REDUCE_CANDIDATE'
        : signals.has('MARKET_UP') && signals.has('VOLATILITY_DOWN') && confidence === '높음'
          ? 'OPPORTUNITY_CANDIDATE'
          : entry.importance?.level === 'CRITICAL' || entry.importance?.level === 'HIGH'
            ? 'INVESTIGATE'
            : marketConfirmation === 'NOT_CONFIRMED'
              ? 'WAIT_FOR_CONFIRMATION'
              : 'WATCH';
  const counterEvidence = counter[0]
    ? `${intelligenceTitle(counter[0])}: 현재 해석과 다른 방향의 관측입니다.`
    : '현재 직접 반대 근거는 없지만, 이는 해석 확정을 뜻하지 않습니다.';
  return {
    status,
    because: reason || entry.importanceReason,
    counterEvidence,
    confirmationNeeded: entry.details.nextCheck.label,
    invalidationCondition: counter[0]
      ? `“${intelligenceTitle(counter[0])}”의 반대 방향이 후속 관측에서도 지속됨`
      : '새 독립 근거가 현재 관측과 어긋나거나 최신성이 상실됨',
  };
}

function rank(entries: readonly BriefingEntry[], generatedAt: string): RankedIntelligence[] {
  const groups = new Map<string, BriefingEntry[]>();
  for (const entry of entries) {
    if (entry.category === 'DATA_QUALITY') continue;
    const origin = entry.context?.originId ? entries.find((candidate) => candidate.id === entry.context?.originId) : undefined;
    const key = identity(origin ?? entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((group): RankedIntelligence => {
    const supporting = [...new Map(group.map((entry) => [entry.id, entry])).values()]
      .sort((a, b) => Date.parse(b.observedAt ?? '') - Date.parse(a.observedAt ?? '') || a.id.localeCompare(b.id));
    const entry = supporting.find((item) => item.category !== 'WATCHLIST') ?? supporting[0]!;
    const topics = unique(supporting.flatMap(topicsFor));
    const reasonCodes: IntelligenceReasonCode[] = [];
    let score = 10;
    const level = entry.importance?.level;
    if (level) {
      score += { CRITICAL: 50, HIGH: 24, MEDIUM: 14, LOW: 6 }[level];
      if (level === 'CRITICAL' || level === 'HIGH') reasonCodes.push('HIGH_IMPACT');
      if (entry.importance?.basis === 'CANONICAL_SEVERITY' && (level === 'CRITICAL' || level === 'HIGH')) {
        score += 15;
        reasonCodes.push('SEVERE_SCALE');
      }
    }
    const impact = entry.context?.impact;
    const severeScale = Boolean(
      impact?.infrastructureImpactConfirmed
      || (impact?.casualties ?? 0) >= 100
      || (impact?.magnitude ?? 0) >= 7,
    );
    const materialScale = severeScale
      || (impact?.casualties ?? 0) >= 10
      || (impact?.magnitude ?? 0) >= 6;
    if (materialScale) {
      score += severeScale ? 20 : 10;
      reasonCodes.push('HIGH_IMPACT');
      if (severeScale) reasonCodes.push('SEVERE_SCALE');
    }
    const crossTopics = topics.filter((topic) => topic !== 'WORLD' && topic !== 'WATCHLIST').length;
    if (crossTopics > 1) { score += Math.min(3, crossTopics - 1) * 10; reasonCodes.push('CROSS_DOMAIN'); }
    if (topics.includes('WATCHLIST')) { score += 10; reasonCodes.push('PERSONAL_RELEVANCE'); }
    if (entry.signals.length) score += 6;
    if (supporting.some((item) => item.context?.ownerNew)) { score += 10; reasonCodes.push('NEW_ESCALATION'); }
    const sourceKnown = Boolean(entry.source?.id && entry.observedAt);
    if (sourceKnown) score += 6;
    const sourceCount = new Set(supporting.map((item) => item.source?.id).filter(Boolean)).size;
    if (sourceCount > 1) { score += 8; reasonCodes.push('MULTI_SOURCE'); }
    const ageHours = (Date.parse(generatedAt) - Date.parse(entry.observedAt ?? '')) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours <= 24) { score += ageHours <= 6 ? 8 : 5; reasonCodes.push('FRESH_EVIDENCE'); }
    if (entry.context?.confirmed) score += 6;
    const transmissionRelevant = topics.some((topic) => ['GEOPOLITICS', 'LOGISTICS', 'ENERGY', 'DISASTER'].includes(topic));
    if (transmissionRelevant && (marketTransmissionObserved(supporting) || impact?.marketImpactConfirmed)) {
      score += 10;
      reasonCodes.push('MARKET_CONFIRMATION');
    }
    else if (transmissionRelevant) reasonCodes.push('NO_TRANSMISSION_YET');
    const counter = entries.filter((other) => other.id !== entry.id && (
      entry.conflictsWithEvidenceRefs.some((ref) => other.evidenceRefs.includes(ref))
      || other.conflictsWithEvidenceRefs.some((ref) => entry.evidenceRefs.includes(ref)) || opposite(entry, other)
    ));
    const confidence = !sourceKnown || counter.length ? '낮음' : entry.context?.confirmed || sourceCount > 1 ? '높음' : '중간';
    if (confidence === '낮음') reasonCodes.push('LOW_CONFIDENCE');
    const normalizedCodes = unique(reasonCodes);
    const reasons = normalizedCodes.map((code) => REASON_LABELS[code]);
    const normalizedScore = Math.min(100, score);
    const rankingReason = reasons.slice(0, 3).join(' · ') || '확인 가능한 최신 공개 관측';
    const marketConfirmation: RankedIntelligence['marketConfirmation'] = reasonCodes.includes('MARKET_CONFIRMATION')
      ? 'CONFIRMED'
      : transmissionRelevant ? 'NOT_CONFIRMED' : 'NOT_APPLICABLE';
    return {
      entry, topics, score: normalizedScore, priority: normalizedScore, reasons, reasonCodes: normalizedCodes,
      rankingReason,
      supporting, counter, confidence,
      evidenceCount: uniqueEvidenceRefs(supporting).length,
      sourceCount,
      marketConfirmation,
      decisionSupport: decisionSupportFor(
        entry,
        topics,
        confidence,
        rankingReason,
        supporting,
        counter,
        marketConfirmation,
      ),
    };
  }).sort((a, b) => b.score - a.score
    || Date.parse(b.entry.observedAt ?? '') - Date.parse(a.entry.observedAt ?? '')
    || a.entry.id.localeCompare(b.entry.id));
}

/** Select distinct domains before a second ordinary item in the same domain.
 * Critical source alerts remain first. No news-count or metric-first bonus.
 */
export function diversifyIntelligence(items: readonly RankedIntelligence[], limit: number): RankedIntelligence[] {
  const primary = (item: RankedIntelligence): IntelligenceTopic =>
    item.topics.find((topic) => ['LOGISTICS', 'ENERGY', 'GEOPOLITICS', 'DISASTER', 'SEC'].includes(topic))
    ?? item.topics.find((topic) => topic !== 'WORLD' && topic !== 'WATCHLIST') ?? 'WORLD';
  const selected: RankedIntelligence[] = [];
  const used = new Map<IntelligenceTopic, number>();
  const sorted = [...items].sort((a, b) => b.priority - a.priority
    || Date.parse(b.entry.observedAt ?? '') - Date.parse(a.entry.observedAt ?? '') || a.entry.id.localeCompare(b.entry.id));
  const remaining = [...sorted];
  const maxScore = sorted[0]?.score ?? 0;
  while (remaining.length && selected.length < limit) {
    // Diversity is a soft tie-breaker, not permission to promote weak evidence.
    // Only candidates inside the strongest remaining item's quality band are
    // eligible for the domain penalty at this slot.
    const strongestRemaining = Math.max(...remaining.map((item) => item.score));
    const eligible = remaining.filter((item) => (
      item.score >= strongestRemaining - 18
      || item.entry.importance?.level === 'CRITICAL'
      || item.reasonCodes.includes('SEVERE_SCALE')
    ));
    eligible.sort((left, right) => {
      const adjusted = (item: RankedIntelligence): number => {
        const repeats = used.get(primary(item)) ?? 0;
        const penalty = item.entry.importance?.level === 'CRITICAL' ? repeats * 6 : repeats * 18;
        return item.score - penalty;
      };
      return adjusted(right) - adjusted(left) || right.score - left.score || left.entry.id.localeCompare(right.entry.id);
    });
    const item = eligible[0]!;
    remaining.splice(remaining.indexOf(item), 1);
    const repeats = used.get(primary(item)) ?? 0;
    const adjustedScore = item.score - (item.entry.importance?.level === 'CRITICAL' ? repeats * 6 : repeats * 18);
    if (selected.length >= 2 && repeats > 0 && adjustedScore < maxScore * 0.45) continue;
    selected.push(item);
    used.set(primary(item), repeats + 1);
  }
  return selected;
}

function passesTopNQualityGate(item: RankedIntelligence): boolean {
  const impact = item.entry.context?.impact;
  const severeCanonical = item.entry.importance?.basis === 'CANONICAL_SEVERITY'
    && (item.entry.importance.level === 'CRITICAL' || item.entry.importance.level === 'HIGH');
  const materialDisaster = (impact?.magnitude ?? 0) >= 6
    || (impact?.casualties ?? 0) >= 10
    || impact?.infrastructureImpactConfirmed === true;
  if (item.topics.includes('DISASTER') && !materialDisaster && !severeCanonical) return false;
  const operationalWorldTopic = item.topics.some((topic) => (
    topic === 'DISASTER' || topic === 'GEOPOLITICS' || topic === 'ENERGY' || topic === 'LOGISTICS'
  ));
  if (item.entry.category === 'WORLD' && !operationalWorldTopic && !severeCanonical) return false;
  return item.score >= 24;
}

interface RelationshipRule {
  source: IntelligenceTopic;
  target: IntelligenceTopic;
  supportingSignals: SituationSignal[];
  counterSignals: SituationSignal[];
}
const RELATIONSHIP_CHAIN: readonly RelationshipRule[] = [
  { source: 'GEOPOLITICS', target: 'LOGISTICS', supportingSignals: ['LOGISTICS_PRESSURE_UP'], counterSignals: [] },
  { source: 'LOGISTICS', target: 'ENERGY', supportingSignals: ['ENERGY_PRICE_UP'], counterSignals: ['ENERGY_PRICE_DOWN'] },
  { source: 'ENERGY', target: 'MARKET', supportingSignals: ['MARKET_DOWN', 'VOLATILITY_UP'], counterSignals: ['MARKET_UP', 'VOLATILITY_DOWN'] },
  { source: 'MARKET', target: 'COMPANY', supportingSignals: ['NEW_SEC_EVIDENCE'], counterSignals: [] },
  { source: 'COMPANY', target: 'SEC', supportingSignals: ['NEW_SEC_EVIDENCE'], counterSignals: [] },
  { source: 'SEC', target: 'WATCHLIST', supportingSignals: ['WATCHLIST_LINK'], counterSignals: [] },
];

function entriesWithTopic(entries: readonly BriefingEntry[], topic: IntelligenceTopic): BriefingEntry[] {
  return entries.filter((entry) => topicsFor(entry).includes(topic));
}

function concreteNextCheck(target: IntelligenceTopic, observed: readonly BriefingEntry[]): string {
  const names = unique(observed.map((entry) => intelligenceTitle(entry))).slice(0, 2).join(' · ');
  if (target === 'LOGISTICS') return names
    ? `운임·항만·주요 선사 운항/우회 관측(${names})의 지속 여부를 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 운임·주요 선사 운항/우회 직접 관측이 없음';
  if (target === 'ENERGY') return names
    ? `현재 에너지 가격 관측(${names})이 같은 방향으로 지속되는지 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 이 사건과 연결된 Brent·에너지 가격 직접 관측이 없음';
  if (target === 'MARKET') return names
    ? `현재 시장 관측(${names})에서 가격 방향과 변동성의 동행 여부를 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 이 사건과 연결된 VIX·시장 가격 직접 관측이 없음';
  if (target === 'COMPANY') return names
    ? `기업 근거(${names})에서 매출·비용·자금조달 노출을 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 이 변화와 연결된 기업 직접 관측이 없음';
  if (target === 'SEC') return names
    ? `SEC 원문(${names})에서 희석·상장 유지·자금조달 위험의 실제 조항을 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 이 변화와 연결된 최신 SEC 직접 관측이 없음';
  return names
    ? `관심종목 근거(${names})의 실제 노출과 최신 공시를 확인하세요.`
    : '현재 MyMonitor 수집 범위에는 이 근거와 연결된 실제 관심종목이 없음';
}

function buildRelationships(
  entries: readonly BriefingEntry[],
  ranked: readonly RankedIntelligence[],
): IntelligenceRelationship[] {
  const relationships = new Map<string, IntelligenceRelationship>();
  for (const rule of RELATIONSHIP_CHAIN) {
    const sources = ranked.filter((item) => item.topics.includes(rule.source)).slice(0, 2);
    const targetEntries = entriesWithTopic(entries, rule.target);
    for (const source of sources) {
      const supports = targetEntries.filter((entry) => entry.signals.some((signal) => rule.supportingSignals.includes(signal)));
      const counters = targetEntries.filter((entry) => entry.signals.some((signal) => rule.counterSignals.includes(signal)));
      const explicitlyLinked = supports.some((entry) => entry.id === source.entry.id
        || entry.context?.originId === source.entry.id
        || source.supporting.some((candidate) => candidate.context?.originId === entry.id));
      const type: IntelligenceRelationshipType = explicitlyLinked ? 'OBSERVED'
        : supports.length ? 'SUPPORTED_HYPOTHESIS'
          : counters.length ? 'COUNTER_SIGNAL' : 'CANDIDATE';
      const summary = type === 'OBSERVED'
        ? `${INTELLIGENCE_TOPIC_LABELS[rule.source]} 근거와 ${INTELLIGENCE_TOPIC_LABELS[rule.target]} 관측이 명시적으로 연결돼 있습니다. 영향 방향은 별도 검증이 필요합니다.`
        : type === 'SUPPORTED_HYPOTHESIS'
          ? `${INTELLIGENCE_TOPIC_LABELS[rule.source]} 변화와 ${INTELLIGENCE_TOPIC_LABELS[rule.target]} 신호가 함께 관측돼 연결 가설을 지지하지만 인과는 확정되지 않았습니다.`
          : type === 'COUNTER_SIGNAL'
            ? `${INTELLIGENCE_TOPIC_LABELS[rule.target]}에서 예상과 다른 현재 신호가 관측돼 연결 가설을 낮춰야 합니다.`
            : `${INTELLIGENCE_TOPIC_LABELS[rule.source]}에서 ${INTELLIGENCE_TOPIC_LABELS[rule.target]}로의 영향은 확인 전 후보 가능성입니다.`;
      const relation: IntelligenceRelationship = {
        id: `relation:${source.entry.id}:${rule.target.toLowerCase()}`,
        source: { id: source.entry.id, title: intelligenceTitle(source.entry), domain: rule.source },
        target: { domain: rule.target, ...(supports[0] ? { entity: intelligenceTitle(supports[0]) } : {}) },
        type,
        summary,
        supportingEvidenceRefs: uniqueEvidenceRefs([...source.supporting, ...supports]),
        counterEvidenceRefs: uniqueEvidenceRefs(counters),
        confidence: type === 'OBSERVED' ? 'HIGH' : type === 'SUPPORTED_HYPOTHESIS' ? 'MEDIUM' : 'LOW',
        whatToCheckNext: concreteNextCheck(rule.target, [...supports, ...counters]),
      };
      // Candidate relations with no target observation are one domain-level
      // hypothesis, even when two near-identical source cards generated it.
      // When target evidence exists, its canonical refs distinguish relations.
      const targetEvidence = uniqueEvidenceRefs([...supports, ...counters]).sort();
      const canonicalKey = [rule.source, rule.target, type, ...targetEvidence].join('|');
      if (!relationships.has(canonicalKey)) relationships.set(canonicalKey, relation);
    }
  }
  return [...relationships.values()].slice(0, 10);
}

const ESSENTIAL_COVERAGE: ReadonlyArray<{
  domain: EssentialCoverageDomain;
  label: string;
  topics: IntelligenceTopic[];
}> = [
  { domain: 'WORLD_NEWS', label: '세계 뉴스', topics: ['WORLD'] },
  { domain: 'GEOPOLITICS', label: '지정학', topics: ['GEOPOLITICS', 'DISASTER'] },
  { domain: 'MARKET', label: '시장', topics: ['MARKET'] },
  { domain: 'MACRO', label: '거시', topics: ['MACRO'] },
  { domain: 'ENERGY', label: '에너지', topics: ['ENERGY'] },
  { domain: 'LOGISTICS', label: '물류', topics: ['LOGISTICS'] },
  { domain: 'COMPANY_WATCHLIST', label: '기업/관심종목', topics: ['COMPANY', 'SEC', 'WATCHLIST'] },
];

function buildEssentialCoverage(
  current: readonly BriefingEntry[],
  excluded: readonly BriefingEntry[],
): EssentialCoverageItem[] {
  return ESSENTIAL_COVERAGE.map(({ domain, label, topics }) => {
    const usable = current.filter((entry) => topicsFor(entry).some((topic) => topics.includes(topic)));
    const limited = excluded.filter((entry) => topicsFor(entry).some((topic) => topics.includes(topic)));
    const status: EssentialCoverageItem['status'] = usable.length > 0
      ? 'READY'
      : limited.length > 0 ? 'DEGRADED' : 'UNAVAILABLE';
    const detail = status === 'READY'
      ? `${usable.length}개 최신 근거를 현재 판단에 사용합니다.`
      : status === 'DEGRADED'
        ? `${limited.length}개 근거가 지연·스냅샷·최신성 제한으로 현재 판단에서 제외됐습니다.`
        : domain === 'COMPANY_WATCHLIST'
          ? '관심종목을 추가하면 세계 변화와 기업·공시의 직접 연결을 확인할 수 있습니다.'
          : '현재 판단에 사용할 최신 직접 근거가 없어 해당 영역의 해석이 제한됩니다.';
    return { domain, label, status, detail };
  });
}

/** Transparent attention ranking, not a probability, risk score, or news-volume ranking. */
export function buildExecutiveIntelligence(entries: readonly BriefingEntry[], generatedAt: string): ExecutiveIntelligence {
  const current = entries.filter((entry) => isCurrentIntelligence(entry, generatedAt));
  const excluded = entries.filter((entry) => !isCurrentIntelligence(entry, generatedAt));
  const allRanked = rank(current, generatedAt);
  const explicitlyLinkedEvidence = new Set(current.flatMap((entry) => [
    ...(entry.context?.originId ? [entry.context.originId] : []),
    ...(entry.conflictsWithEvidenceRefs.length ? [entry.id] : []),
    ...entry.conflictsWithEvidenceRefs,
  ]));
  const rankingPool = allRanked.filter((item) => (
    passesTopNQualityGate(item) || explicitlyLinkedEvidence.has(item.entry.id)
  ));
  const hotspots = diversifyIntelligence(allRanked.filter((item) => passesTopNQualityGate(item)
    &&
    item.entry.category !== 'MARKET' && item.entry.category !== 'MACRO'
    && !item.topics.includes('COMPANY') && !item.topics.includes('SEC') && !item.topics.includes('WATCHLIST')
    && (!item.topics.includes('MACRO') || item.topics.some((topic) => ['GEOPOLITICS', 'ENERGY', 'LOGISTICS', 'DISASTER'].includes(topic)))), 5);
  const ranking = diversifyIntelligence(rankingPool, 5);
  const relationships = buildRelationships(current, allRanked);
  const coverage = (Object.keys(INTELLIGENCE_TOPIC_LABELS) as IntelligenceTopic[]).map((topic) => {
    const items = allRanked.filter((item) => item.topics.includes(topic));
    return { topic, count: items.length, kind: !items.length ? '없음' as const
      : items.every((item) => item.entry.category === 'WORLD' && item.entry.context?.observationKind !== 'EVENT') ? '보도' as const : '관측' as const };
  });
  const market = current.filter((entry) => entry.category === 'MARKET' || entry.category === 'MACRO');
  const has = (signal: SituationSignal): boolean => market.some((entry) => entry.signals.includes(signal));
  const down = has('MARKET_DOWN');
  const up = has('MARKET_UP');
  const volUp = has('VOLATILITY_UP');
  const volDown = has('VOLATILITY_DOWN');
  const marketEvidence = market.filter((entry) => entry.signals.length > 0);
  const breadthEvidence = market.find((entry) => entry.context?.marketBreadth);
  const breadth = breadthEvidence?.context?.marketBreadth;
  const assessedRegime = assessMarketRegime({
    breadth,
    sp500Direction: down ? 'DOWN' : up ? 'UP' : 'UNKNOWN',
    vixDirection: volUp ? 'UP' : volDown ? 'DOWN' : 'UNKNOWN',
  });
  const regime = {
    ...assessedRegime,
    ...(breadth ? { breadth } : {}),
    evidence: unique([...(breadthEvidence ? [breadthEvidence] : []), ...marketEvidence]),
  };
  const world = allRanked.filter((item) => item.topics.includes('WORLD') || item.topics.includes('GEOPOLITICS'));
  const worldLead = hotspots[0];
  const themes = unique(hotspots.flatMap((item) => item.topics).filter((topic) => topic !== 'WORLD'));
  const worldPhrase = worldLead
    ? themes.length ? `${themes.map((topic) => INTELLIGENCE_TOPIC_LABELS[topic]).slice(0, 3).join(' · ')} 관련 사건을 우선 확인하세요.`
      : '주요 세계 보도의 사건과 후속 발표를 확인하세요.'
    : `확정적인 세계 사건 판단은 보류합니다. ${regime.interpretation}`;
  const geo = world.find((item) => item.topics.includes('GEOPOLITICS') || item.topics.includes('LOGISTICS'));
  const supporting = unique([...(geo?.supporting ?? []), ...marketEvidence, ...(ranking[0]?.supporting ?? [])]);
  const counter = unique(allRanked.flatMap((item) => item.counter));
  // Cross-asset divergence is explicitly a competing observation, never a causal claim.
  if (up && volUp || down && volDown) counter.push(...marketEvidence.filter((entry) => entry.signals.some((s) => s.startsWith('VOLATILITY_'))));
  const currentCounterEvidence = unique(counter);
  const changeConditions = geo
    ? [
      '독립적인 후속 보도에서 위험 축소가 확인됨',
      '연결된 에너지·물류 직접 관측이 안정 방향으로 지속됨',
      ...(down ? ['주가 회복과 변동성 완화가 함께 관측됨'] : []),
    ]
    : down ? ['주가가 회복되고 변동성이 함께 완화됨']
      : up ? ['상승이 반전되거나 변동성이 동반 상승함']
        : ['새 독립 근거가 현재 관측과 어긋남'];
  const investment = {
    direction: down && volUp ? '주가 약세와 변동성 상승이 겹쳐 방어적 판단을 우선할 조건입니다.'
      : up && volDown ? '주가 상승과 변동성 완화가 함께 관측됐습니다. 상승 참여 폭의 확인이 필요합니다.'
      : geo ? '지정학·물류 보도는 확인됐지만 자산 가격으로의 전이는 아직 별도 검증이 필요합니다.'
      : market.length ? '현재 시장 관측 범위에서만 방향을 판단하고 추가 근거에 따라 조정합니다.'
      : '확인된 사건의 후속 근거를 우선 수집할 단계입니다.',
    action: geo ? '에너지 가격·운임도 같은 방향으로 움직이면 에너지 비용과 공급망 노출이 큰 관심기업부터 점검하세요.'
      : down ? '약세가 이어지고 변동성도 높아지면 고변동 종목의 위험 노출을 먼저 재검토하세요.'
      : up ? '상승이 이어져도 참여 종목의 폭과 기업 근거가 동반될 때만 강세 해석을 확대하세요.'
      : '서로 독립적인 최신 근거가 일치하는 영역부터 판단 범위를 넓히세요.',
    counter: currentCounterEvidence,
    currentCounterEvidence,
    counterNote: currentCounterEvidence.length
      ? '아래 관측은 현재 해석과 상충하거나 완화 방향을 보입니다.'
      : '현재 수집 범위에서 상충 신호 미확인 · 이는 가설 확정을 뜻하지 않습니다.',
    changesWhen: changeConditions.join(' · '),
    changeConditions,
    next: geo ? '원문·후속 보도 → 에너지·운임의 실제 관측 → 관심기업의 노출 순서로 확인'
      : '다음 시장 관측 → 시장 breadth의 최신성 → 관심기업 공시 순서로 확인',
    supporting,
  };
  const regions = REGIONS.map(({ key, label: regionLabel, x, y, match }) => ({ key, label: regionLabel, x, y,
    items: world.filter(({ entry }) => match.test(entry.context?.region ?? '')),
  })).filter((region) => region.items.length > 0);
  const located = new Set(regions.flatMap((region) => region.items.map((item) => item.entry.id)));
  const unlocated = world.filter((item) => !located.has(item.entry.id));
  if (unlocated.length) regions.push({ key: 'OTHER', label: '위치 미확정', x: 0, y: 0, items: unlocated });
  const coveredTopics = coverage.filter((item) => item.count > 0).length;
  const essentialCoverage = buildEssentialCoverage(current, excluded);
  const breadthFact = breadthEvidence?.summary;
  const confirmedFacts = unique([
    ...(worldLead ? [intelligenceTitle(worldLead.entry)] : []),
    ...(breadthFact ? [`시장 breadth · ${breadthFact}`] : []),
    ...marketEvidence.filter((entry) => entry !== breadthEvidence).slice(0, 2)
      .map((entry) => `${entry.title} ${entry.context?.metric?.value ?? ''}`.trim()),
  ]).slice(0, 4);
  const topCounter = regime.counterEvidence[0]
    ?? currentCounterEvidence[0]?.details.uncertainty
    ?? '현재 직접 반대 근거는 없지만 독립 근거가 부족해 결론을 확정하지 않습니다.';
  const todayBriefing = {
    confirmedFacts: confirmedFacts.length ? confirmedFacts : ['현재 판단에 사용할 직접 관측 범위가 제한적입니다.'],
    conditionalInterpretation: worldPhrase,
    counterEvidence: topCounter,
    unknowns: worldLead
      ? '보도된 사건과 시장 움직임 사이의 인과 및 관심기업의 실제 노출은 아직 확정되지 않았습니다.'
      : '최신 세계 사건의 독립 확인과 시장 움직임의 원인은 아직 알 수 없습니다.',
    nextSignal: relationships.find((relation) => relation.type !== 'CANDIDATE')?.whatToCheckNext ?? regime.nextSignal,
  };
  const headline = todayBriefing.conditionalInterpretation;
  return { headline, hotspots, ranking, allRanked, coverage, essentialCoverage, excluded, relationships,
    changes: { state: 'FIRST_CHECK', items: [], topChanges: [] },
    confidence: ranking.length
      ? (coveredTopics < 3 || ranking.some((item) => item.confidence === '낮음') ? '낮음' : '중간')
      : '판단 불가',
    regime, todayBriefing, investment, regions, watchlist: allRanked.filter((item) => item.topics.includes('WATCHLIST')) };
}
