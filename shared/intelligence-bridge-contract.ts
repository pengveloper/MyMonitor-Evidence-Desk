/**
 * MyMonitor -> JASYNQ producer contract.
 *
 * This module contains data only. It deliberately has no action/tool executor,
 * callback transport, or JASYNQ client. Suggested checks and evidence text are
 * untrusted strings and remain inert throughout this contract.
 */

export const INTELLIGENCE_BRIDGE_CONTRACT_VERSION = 'INTELLIGENCE-BRIDGE-0.1' as const;
export const INTELLIGENCE_BRIDGE_SOURCE = 'mymonitor' as const;
export const INTELLIGENCE_BRIDGE_CANONICAL_ORIGIN = 'https://monitor.mymonitor.stream' as const;
export const INTELLIGENCE_BRIDGE_CURSOR_RETENTION_DAYS = 30 as const;

export const INTELLIGENCE_ITEM_TYPES = ['intelligence', 'data_health'] as const;
export type IntelligenceItemType = (typeof INTELLIGENCE_ITEM_TYPES)[number];

export const INTELLIGENCE_CATEGORIES = [
  'world',
  'market',
  'macro',
  'energy',
  'logistics',
  'infrastructure',
  'company',
  'sec',
  'risk',
  'watchlist',
] as const;
export type IntelligenceCategory = (typeof INTELLIGENCE_CATEGORIES)[number];

export const JASYNQ_EXPORT_CATEGORIES = [
  'WORLD',
  'MARKET',
  'MACRO',
  'COMPANY',
  'SEC',
  'RISK',
  'DATA_HEALTH',
] as const;
export type JasynqExportCategory = (typeof JASYNQ_EXPORT_CATEGORIES)[number];

export type ClaimVerification = 'verified' | 'disputed' | 'unavailable';
export type ClaimConfidence = 'low' | 'medium' | 'high';
export type EvidenceRelation = 'supports' | 'refutes' | 'context';
export type RevisionType = 'original' | 'correction' | 'retraction';
export type TimePrecision = 'unknown' | 'date_only' | 'exact_time';

export interface EvidenceReference {
  evidence_id: string;
  relation: EvidenceRelation;
}

export type IntelligenceClaim =
  | {
      claim_id: string;
      kind: 'fact';
      text: string;
      verification: ClaimVerification;
      confidence?: never;
      evidence_refs: EvidenceReference[];
    }
  | {
      claim_id: string;
      kind: 'interpretation' | 'hypothesis';
      text: string;
      verification?: never;
      confidence?: ClaimConfidence;
      evidence_refs: EvidenceReference[];
    };

export interface EvidenceUsage {
  storage: 'allow' | 'deny';
  display: 'allow' | 'deny';
  external_llm: 'allow' | 'summary_only' | 'deny';
  attribution_required: boolean;
}

/** Neutral artifact. Claim-specific supports/refutes/context lives on the claim. */
export interface IntelligenceEvidence {
  evidence_id: string;
  source_identity: string;
  locator: string;
  source_version?: string;
  checksum?: string;
  retrieved_at: string;
  excerpt?: string;
  usage: EvidenceUsage;
}

export interface IntelligenceEntity {
  namespace:
    | 'sec_cik'
    | 'mymonitor_instrument'
    | 'fred_series'
    | 'country_iso2'
    | 'mymonitor_source';
  type: 'issuer' | 'security' | 'series' | 'country' | 'source';
  id: string;
  aliases?: string[];
}

export interface IntelligenceTimes {
  occurred_at: string | null;
  published_at: string | null;
  effective_at: string | null;
  retrieved_at: string | null;
  analyzed_at: string | null;
  precision: {
    occurred_at: TimePrecision;
    published_at: TimePrecision;
    effective_at: TimePrecision;
    retrieved_at: TimePrecision;
    analyzed_at: TimePrecision;
  };
}

export interface SuggestedCheck {
  check_id: string;
  /** Inert display text; never an executable action or tool invocation. */
  text: string;
}

export interface IntelligenceUsagePolicy {
  storage: 'allow' | 'deny';
  display: 'allow' | 'deny';
  external_llm: 'allow' | 'summary_only' | 'deny';
  attribution_required: boolean;
  policy_version: string;
  expires_at?: string;
  deletion_required_at?: string;
}

export interface RevisionIdentity {
  source: typeof INTELLIGENCE_BRIDGE_SOURCE;
  item_id: string;
  revision: number;
}

export interface RevisionMeta {
  revision_type: RevisionType;
  supersedes?: RevisionIdentity;
  reason?: string;
}

export interface DataHealthDetail {
  /** Dataset or producer scope affected; not a news topic or action candidate. */
  affected_scope: string[];
  as_of: string | null;
  freshness_state: 'fresh' | 'stale' | 'partial' | 'unavailable';
  reason: string;
  recovery_state: string;
}

export interface IntelligenceItem {
  contract_version: typeof INTELLIGENCE_BRIDGE_CONTRACT_VERSION;
  source: typeof INTELLIGENCE_BRIDGE_SOURCE;
  item_id: string;
  revision: number;
  item_type: IntelligenceItemType;
  status: 'active' | 'retracted';
  category: IntelligenceCategory;
  title: string;
  /** MyMonitor-authored, bounded, LLM-safe derived summary. */
  export_summary: string;
  claims: IntelligenceClaim[];
  evidence: IntelligenceEvidence[];
  entities: IntelligenceEntity[];
  times: IntelligenceTimes;
  suggested_checks: SuggestedCheck[];
  usage_policy: IntelligenceUsagePolicy;
  deep_link: string;
  revision_meta: RevisionMeta;
  data_health?: DataHealthDetail;
}

export interface IntelligenceFeedResponse {
  contract_version: typeof INTELLIGENCE_BRIDGE_CONTRACT_VERSION;
  feed_epoch: string;
  sync_mode: 'initial_snapshot' | 'live_catchup';
  items: IntelligenceItem[];
  next_cursor: string;
  has_more: boolean;
}

export interface ExternalLlmSummaryProjection {
  contract_version: typeof INTELLIGENCE_BRIDGE_CONTRACT_VERSION;
  source: typeof INTELLIGENCE_BRIDGE_SOURCE;
  item_id: string;
  revision: number;
  item_type: IntelligenceItemType;
  category: IntelligenceCategory;
  export_summary: string;
  attribution_required: boolean;
  policy_version: string;
}

const FAIL_CLOSED_USAGE_POLICY: IntelligenceUsagePolicy = Object.freeze({
  storage: 'deny',
  display: 'deny',
  external_llm: 'deny',
  attribution_required: true,
  policy_version: 'missing/fail-closed',
});

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max = 2_048): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) {
    throw new Error(`${field} must be non-empty, trimmed text`);
  }
  return value;
}

function itemId(value: unknown, field = 'item_id'): string {
  const result = text(value, field, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) || result === '.' || result === '..') {
    throw new Error(`${field} must be a URL-segment-safe stable identifier`);
  }
  return result;
}

function exactTime(value: unknown, field: string): string {
  const result = text(value, field, 64);
  const ms = Date.parse(result);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== result) {
    throw new Error(`${field} must be an exact UTC timestamp`);
  }
  return result;
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function timeValue(value: unknown, precision: TimePrecision, field: string): string | null {
  if (value === null) {
    if (precision !== 'unknown') throw new Error(`${field} null time must have unknown precision`);
    return null;
  }
  if (precision === 'unknown') throw new Error(`${field} known time cannot have unknown precision`);
  if (precision === 'date_only') {
    const result = text(value, field, 10);
    if (!dateOnly(result)) throw new Error(`${field} must be an ISO calendar date`);
    return result;
  }
  return exactTime(value, field);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${field} is invalid`);
  return value as T;
}

function stringList(value: unknown, field: string, maxItems = 32): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} must be an array`);
  return value.map((entry, index) => text(entry, `${field}[${index}]`, 256));
}

export function normalizeUsagePolicy(value: unknown): IntelligenceUsagePolicy {
  if (value === undefined || value === null) return { ...FAIL_CLOSED_USAGE_POLICY };
  const policy = record(value, 'usage_policy');
  return {
    storage: oneOf(policy.storage, ['allow', 'deny'], 'usage_policy.storage'),
    display: oneOf(policy.display, ['allow', 'deny'], 'usage_policy.display'),
    external_llm: oneOf(policy.external_llm, ['allow', 'summary_only', 'deny'], 'usage_policy.external_llm'),
    attribution_required: (() => {
      if (typeof policy.attribution_required !== 'boolean') {
        throw new Error('usage_policy.attribution_required must be boolean');
      }
      return policy.attribution_required;
    })(),
    policy_version: text(policy.policy_version, 'usage_policy.policy_version', 128),
    ...(policy.expires_at === undefined ? {} : { expires_at: exactTime(policy.expires_at, 'usage_policy.expires_at') }),
    ...(policy.deletion_required_at === undefined
      ? {}
      : { deletion_required_at: exactTime(policy.deletion_required_at, 'usage_policy.deletion_required_at') }),
  };
}

export function normalizeDeepLink(value: unknown): string {
  const link = text(value, 'deep_link', 2_048);
  const parsed = new URL(link, INTELLIGENCE_BRIDGE_CANONICAL_ORIGIN);
  if (parsed.origin !== INTELLIGENCE_BRIDGE_CANONICAL_ORIGIN) {
    throw new Error('deep_link must use the MyMonitor canonical origin or be relative');
  }
  return link.startsWith('/') && !link.startsWith('//')
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : parsed.toString();
}

function normalizeEvidenceUsage(value: unknown, field: string): EvidenceUsage {
  const usage = record(value, field);
  if (typeof usage.attribution_required !== 'boolean') {
    throw new Error(`${field}.attribution_required must be boolean`);
  }
  return {
    storage: oneOf(usage.storage, ['allow', 'deny'], `${field}.storage`),
    display: oneOf(usage.display, ['allow', 'deny'], `${field}.display`),
    external_llm: oneOf(usage.external_llm, ['allow', 'summary_only', 'deny'], `${field}.external_llm`),
    attribution_required: usage.attribution_required,
  };
}

function normalizeTimes(value: unknown): IntelligenceTimes {
  const times = record(value, 'times');
  const rawPrecision = record(times.precision, 'times.precision');
  const precision = {
    occurred_at: oneOf(rawPrecision.occurred_at, ['unknown', 'date_only', 'exact_time'], 'times.precision.occurred_at'),
    published_at: oneOf(rawPrecision.published_at, ['unknown', 'date_only', 'exact_time'], 'times.precision.published_at'),
    effective_at: oneOf(rawPrecision.effective_at, ['unknown', 'date_only', 'exact_time'], 'times.precision.effective_at'),
    retrieved_at: oneOf(rawPrecision.retrieved_at, ['unknown', 'date_only', 'exact_time'], 'times.precision.retrieved_at'),
    analyzed_at: oneOf(rawPrecision.analyzed_at, ['unknown', 'date_only', 'exact_time'], 'times.precision.analyzed_at'),
  } satisfies IntelligenceTimes['precision'];
  return {
    occurred_at: timeValue(times.occurred_at, precision.occurred_at, 'times.occurred_at'),
    published_at: timeValue(times.published_at, precision.published_at, 'times.published_at'),
    effective_at: timeValue(times.effective_at, precision.effective_at, 'times.effective_at'),
    retrieved_at: timeValue(times.retrieved_at, precision.retrieved_at, 'times.retrieved_at'),
    analyzed_at: timeValue(times.analyzed_at, precision.analyzed_at, 'times.analyzed_at'),
    precision,
  };
}

/**
 * Runtime boundary for producer input. It copies only contract fields, so
 * attacker-supplied `tool`, `callback`, or `action_plan` properties cannot be
 * promoted into the exported item.
 */
export function normalizeIntelligenceItem(value: unknown): IntelligenceItem {
  const item = record(value, 'item');
  if (item.contract_version !== INTELLIGENCE_BRIDGE_CONTRACT_VERSION) {
    throw new Error('contract_version is unsupported');
  }
  if (item.source !== INTELLIGENCE_BRIDGE_SOURCE) throw new Error('source must be mymonitor');
  if (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1) {
    throw new Error('revision must be a positive integer');
  }
  const itemType = oneOf(item.item_type, INTELLIGENCE_ITEM_TYPES, 'item_type');
  const status = oneOf(item.status, ['active', 'retracted'], 'status');
  const rawEvidence = Array.isArray(item.evidence) ? item.evidence : (() => { throw new Error('evidence must be an array'); })();
  const evidence = rawEvidence.map((entry, index): IntelligenceEvidence => {
    const candidate = record(entry, `evidence[${index}]`);
    return {
      evidence_id: text(candidate.evidence_id, `evidence[${index}].evidence_id`, 128),
      source_identity: text(candidate.source_identity, `evidence[${index}].source_identity`, 256),
      locator: text(candidate.locator, `evidence[${index}].locator`, 4_096),
      ...(candidate.source_version === undefined ? {} : { source_version: text(candidate.source_version, `evidence[${index}].source_version`, 256) }),
      ...(candidate.checksum === undefined ? {} : { checksum: text(candidate.checksum, `evidence[${index}].checksum`, 256) }),
      retrieved_at: exactTime(candidate.retrieved_at, `evidence[${index}].retrieved_at`),
      ...(candidate.excerpt === undefined ? {} : { excerpt: text(candidate.excerpt, `evidence[${index}].excerpt`, 1_024) }),
      usage: normalizeEvidenceUsage(candidate.usage, `evidence[${index}].usage`),
    };
  });
  const evidenceIds = new Set(evidence.map((entry) => entry.evidence_id));
  if (evidenceIds.size !== evidence.length) throw new Error('evidence_id must be unique within an item');

  if (!Array.isArray(item.claims)) throw new Error('claims must be an array');
  const claims = item.claims.map((entry, index): IntelligenceClaim => {
    const candidate = record(entry, `claims[${index}]`);
    const kind = oneOf(candidate.kind, ['fact', 'interpretation', 'hypothesis'], `claims[${index}].kind`);
    if (!Array.isArray(candidate.evidence_refs)) throw new Error(`claims[${index}].evidence_refs must be an array`);
    const evidenceRefs = candidate.evidence_refs.map((ref, refIndex): EvidenceReference => {
      const relation = record(ref, `claims[${index}].evidence_refs[${refIndex}]`);
      const evidenceId = text(relation.evidence_id, `claims[${index}].evidence_refs[${refIndex}].evidence_id`, 128);
      if (!evidenceIds.has(evidenceId)) throw new Error(`claim references unknown evidence ${evidenceId}`);
      return {
        evidence_id: evidenceId,
        relation: oneOf(relation.relation, ['supports', 'refutes', 'context'], `claims[${index}].evidence_refs[${refIndex}].relation`),
      };
    });
    const common = {
      claim_id: text(candidate.claim_id, `claims[${index}].claim_id`, 128),
      text: text(candidate.text, `claims[${index}].text`, 2_048),
      evidence_refs: evidenceRefs,
    };
    if (kind === 'fact') {
      if (candidate.confidence !== undefined) throw new Error('fact claims cannot carry generic confidence');
      const verification = oneOf(candidate.verification, ['verified', 'disputed', 'unavailable'], `claims[${index}].verification`);
      if (verification === 'verified' && !evidenceRefs.some((ref) => ref.relation === 'supports')) {
        throw new Error('verified fact claims require supporting evidence');
      }
      return {
        ...common,
        kind,
        verification,
      };
    }
    if (candidate.verification !== undefined) throw new Error(`${kind} claims cannot carry fact verification`);
    const confidence: ClaimConfidence | undefined = candidate.confidence === undefined
      ? undefined
      : oneOf(candidate.confidence, ['low', 'medium', 'high'] as const, `claims[${index}].confidence`);
    return {
      ...common,
      kind,
      ...(confidence === undefined ? {} : { confidence }),
    };
  });
  if (new Set(claims.map((claim) => claim.claim_id)).size !== claims.length) {
    throw new Error('claim_id must be unique within an item');
  }

  if (!Array.isArray(item.entities)) throw new Error('entities must be an array');
  const entities = item.entities.map((entry, index): IntelligenceEntity => {
    const entity = record(entry, `entities[${index}]`);
    return {
      namespace: oneOf(entity.namespace, ['sec_cik', 'mymonitor_instrument', 'fred_series', 'country_iso2', 'mymonitor_source'], `entities[${index}].namespace`),
      type: oneOf(entity.type, ['issuer', 'security', 'series', 'country', 'source'], `entities[${index}].type`),
      id: text(entity.id, `entities[${index}].id`, 256),
      ...(entity.aliases === undefined ? {} : { aliases: stringList(entity.aliases, `entities[${index}].aliases`) }),
    };
  });

  if (!Array.isArray(item.suggested_checks)) throw new Error('suggested_checks must be an array');
  const suggestedChecks = item.suggested_checks.map((entry, index): SuggestedCheck => {
    const check = record(entry, `suggested_checks[${index}]`);
    return {
      check_id: text(check.check_id, `suggested_checks[${index}].check_id`, 128),
      text: text(check.text, `suggested_checks[${index}].text`, 1_024),
    };
  });

  const revisionMetaInput = record(item.revision_meta, 'revision_meta');
  const revisionType = oneOf(revisionMetaInput.revision_type, ['original', 'correction', 'retraction'], 'revision_meta.revision_type');
  let supersedes: RevisionIdentity | undefined;
  if (revisionMetaInput.supersedes !== undefined) {
    const identity = record(revisionMetaInput.supersedes, 'revision_meta.supersedes');
    if (identity.source !== INTELLIGENCE_BRIDGE_SOURCE
      || !Number.isSafeInteger(identity.revision)
      || (identity.revision as number) < 1) {
      throw new Error('revision_meta.supersedes identity is invalid');
    }
    supersedes = {
      source: INTELLIGENCE_BRIDGE_SOURCE,
      item_id: itemId(identity.item_id, 'revision_meta.supersedes.item_id'),
      revision: identity.revision as number,
    };
  }
  const revisionMeta: RevisionMeta = {
    revision_type: revisionType,
    ...(supersedes ? { supersedes } : {}),
    ...(revisionMetaInput.reason === undefined ? {} : { reason: text(revisionMetaInput.reason, 'revision_meta.reason', 1_024) }),
  };

  let dataHealth: DataHealthDetail | undefined;
  if (itemType === 'data_health') {
    const detail = record(item.data_health, 'data_health');
    const asOf = detail.as_of === null
      ? null
      : timeValue(detail.as_of, /^\d{4}-\d{2}-\d{2}$/.test(String(detail.as_of)) ? 'date_only' : 'exact_time', 'data_health.as_of');
    dataHealth = {
      affected_scope: stringList(detail.affected_scope, 'data_health.affected_scope'),
      as_of: asOf,
      freshness_state: oneOf(detail.freshness_state, ['fresh', 'stale', 'partial', 'unavailable'], 'data_health.freshness_state'),
      reason: text(detail.reason, 'data_health.reason', 1_024),
      recovery_state: text(detail.recovery_state, 'data_health.recovery_state', 512),
    };
  } else if (item.data_health !== undefined) {
    throw new Error('data_health is reserved for data_health items');
  }

  if (revisionType === 'retraction' && status !== 'retracted') {
    throw new Error('retraction revisions must have retracted status');
  }
  if (revisionType !== 'retraction' && status !== 'active') {
    throw new Error('non-retraction revisions must have active status');
  }

  return {
    contract_version: INTELLIGENCE_BRIDGE_CONTRACT_VERSION,
    source: INTELLIGENCE_BRIDGE_SOURCE,
    item_id: itemId(item.item_id),
    revision: item.revision as number,
    item_type: itemType,
    status,
    category: oneOf(item.category, INTELLIGENCE_CATEGORIES, 'category'),
    title: text(item.title, 'title', 320),
    export_summary: text(item.export_summary, 'export_summary', 768),
    claims,
    evidence,
    entities,
    times: normalizeTimes(item.times),
    suggested_checks: suggestedChecks,
    usage_policy: normalizeUsagePolicy(item.usage_policy),
    deep_link: normalizeDeepLink(item.deep_link),
    revision_meta: revisionMeta,
    ...(dataHealth ? { data_health: dataHealth } : {}),
  };
}

/** Stable JSON for immutable tuple comparison; array order remains meaningful. */
export function canonicalIntelligenceItemJson(item: IntelligenceItem): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return JSON.stringify(sort(item));
}

function projectClaimsForEvidence(
  claims: IntelligenceClaim[],
  evidenceIds: ReadonlySet<string>,
): IntelligenceClaim[] {
  return claims.flatMap((claim): IntelligenceClaim[] => {
    const evidenceRefs = claim.evidence_refs.filter((ref) => evidenceIds.has(ref.evidence_id));
    if (claim.kind === 'fact' && claim.verification === 'verified'
      && !evidenceRefs.some((ref) => ref.relation === 'supports')) return [];
    return [{ ...claim, evidence_refs: evidenceRefs }];
  });
}

/**
 * `summary_only` returns only MyMonitor's pre-derived export summary and safe
 * metadata. Raw claims, evidence/excerpts, and suggested checks are excluded.
 */
export function projectForExternalLlm(
  item: IntelligenceItem,
  now = Date.now(),
): IntelligenceItem | ExternalLlmSummaryProjection | null {
  const expired = [item.usage_policy.expires_at, item.usage_policy.deletion_required_at]
    .some((value) => value !== undefined && Date.parse(value) <= now);
  if (expired) return null;
  if (item.usage_policy.external_llm === 'deny') return null;
  if (item.usage_policy.external_llm === 'allow') {
    const evidence = item.evidence.filter((entry) => entry.usage.external_llm === 'allow');
    const allowedEvidenceIds = new Set(evidence.map((entry) => entry.evidence_id));
    return {
      ...item,
      claims: projectClaimsForEvidence(item.claims, allowedEvidenceIds),
      evidence,
    };
  }
  return {
    contract_version: item.contract_version,
    source: item.source,
    item_id: item.item_id,
    revision: item.revision,
    item_type: item.item_type,
    category: item.category,
    export_summary: item.export_summary,
    attribution_required: item.usage_policy.attribution_required,
    policy_version: item.usage_policy.policy_version,
  };
}

/** Apply item- and evidence-level storage policy before a ledger write. */
export function projectForStorage(item: IntelligenceItem, now = Date.now()): IntelligenceItem | null {
  if (item.usage_policy.storage === 'deny') return null;
  if (item.usage_policy.deletion_required_at
    && Date.parse(item.usage_policy.deletion_required_at) <= now) return null;
  const evidence = item.evidence.filter((entry) => entry.usage.storage === 'allow');
  const storedEvidenceIds = new Set(evidence.map((entry) => entry.evidence_id));
  return {
    ...item,
    claims: projectClaimsForEvidence(item.claims, storedEvidenceIds),
    evidence,
  };
}
