import type {
  CorporateAction,
  DatasetLicenseClass,
  DatasetRedistribution,
  FilingEvent,
  FundamentalFact,
} from './contracts.ts';

/** Storage-neutral DATA-US durable-history contracts. */
export const DATA_US_STORAGE_SCHEMA_VERSION = 'data-us-durable-history/v1' as const;
export const DATA_US_PARTITION_MANIFEST_SCHEMA_VERSION = 'data-us-partition-manifest/v1' as const;

export const HISTORICAL_DATASETS = [
  'BARS',
  'DAILY_BARS',
  'FILING_EVENTS',
  'FUNDAMENTAL_FACTS',
  'CORPORATE_ACTIONS',
  'INSTRUMENT_LINEAGE',
  'CONFLICT_EVIDENCE',
  'INGESTION_RUNS',
] as const;

export type HistoricalDataset = (typeof HISTORICAL_DATASETS)[number];

export type DatasetSchemaVersion = string;

export const PARTITION_STATUSES = [
  'STAGING',
  'SEALED',
  'SUPERSEDED',
  'QUARANTINED',
] as const;

export type PartitionStatus = (typeof PARTITION_STATUSES)[number];

export type PartitionCompleteness = 'COMPLETE' | 'PARTIAL' | 'GAPPED' | 'UNKNOWN';

export type PrivateRetentionStatus = 'APPROVED' | 'REVIEW_REQUIRED' | 'PROHIBITED' | 'UNKNOWN';

export interface PartitionDescriptor {
  dataset: HistoricalDataset;
  schemaVersion: DatasetSchemaVersion;
  /** Stable, canonical path dimensions; values must not contain path separators. */
  dimensions: Readonly<Record<string, string>>;
  /** Stable serialization of `dimensions`, used as the catalog partition identity. */
  partitionKey: string;
  shard?: number;
  shardCount?: number;
}

export interface PartitionGeneration {
  partitionKey: string;
  generation: number;
  supersedesManifestId?: string;
}

export interface StoredObjectReference {
  objectKey: string;
  exactByteSha256: string;
  byteLength: number;
}

export interface DurableObjectHead {
  objectKey: string;
  byteLength: number;
  /** Opaque transport metadata only. It is never an application checksum. */
  etag?: string;
}

export interface DurableObjectWriteResult {
  exactByteSha256: string;
  byteLength: number;
  created: boolean;
  attempts: number;
}

/**
 * Provider-neutral immutable object boundary used by MarketHistoricalStore.
 * Implementations may use a local fixture directory or a remote durable
 * object service without leaking that provider into the historical contract.
 */
export interface DurableObjectStore {
  /** Validate a logical key and return the implementation's isolated key/path. */
  resolveObjectKey(objectKey: string): string;
  putImmutable(objectKey: string, bytes: Uint8Array): Promise<DurableObjectWriteResult>;
  putStagingObject(
    ingestionRunId: string,
    bytes: Uint8Array,
    extension?: string,
  ): Promise<string>;
  getObject(objectKey: string): Promise<Uint8Array>;
  getObjectStream(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  headObject(objectKey: string): Promise<DurableObjectHead | null>;
  exists(objectKey: string): Promise<boolean>;
  finalizeStagingObject(
    stagingKey: string,
    finalKey: string,
    expectedExactByteSha256?: string,
  ): Promise<void>;
  /** The normal interface permits cleanup only inside the staging namespace. */
  deleteStagingObject(stagingKey: string): Promise<void>;
  /** Implementations must bound results and fail rather than silently truncate. */
  listPrefix(prefix: string, maxKeys?: number): Promise<string[]>;
  writeQuarantineEvidence(input: {
    objectKey: string;
    manifestId: string;
    reason: string;
    detectedAt: string;
  }): Promise<string>;
}

/** Explicit privileged capability; never expose it to normal ingest/serving code. */
export interface DurableObjectMaintenance {
  deleteObject(objectKey: string): Promise<void>;
}

export interface PartitionSourceChecksum {
  sourceId: string;
  checksum: string;
}

export interface PartitionManifest {
  schemaVersion: typeof DATA_US_PARTITION_MANIFEST_SCHEMA_VERSION;
  manifestId: string;
  dataset: HistoricalDataset;
  datasetVersion: string;
  recordSchemaVersion: DatasetSchemaVersion;
  partition: PartitionDescriptor;
  generation: number;
  objectKey: string;
  /** Stable logical-record identity; excludes operational observation metadata such as `fetchedAt`. */
  semanticContentSha256: string;
  exactByteSha256: string;
  byteLength: number;
  rowCount: number;
  minEventTime?: string;
  maxEventTime?: string;
  minAsKnownAt?: string;
  maxAsKnownAt?: string;
  sourceIds: string[];
  sourceChecksums: PartitionSourceChecksum[];
  ingestionRunId: string;
  licenseClass: DatasetLicenseClass;
  redistribution: DatasetRedistribution;
  privateRetentionStatus: PrivateRetentionStatus;
  completeness: PartitionCompleteness;
  coverageGapIds: string[];
  conflictCount: number;
  createdAt: string;
  status: PartitionStatus;
  supersedesManifestId?: string;
  /** Integrity checksum over every other manifest field, including run/observation identity. */
  manifestPayloadSha256: string;
}

export interface RecordLocator {
  recordId: string;
  dataset: HistoricalDataset;
  partitionKey: string;
  generation: number;
  objectKey: string;
  /** Optimization hint only. It is not a durable record identity. */
  rowGroup?: number;
  issuerCik?: string;
  instrumentId?: string;
  accessionNumber?: string;
  canonicalMetric?: string;
  reportPeriodIdentity?: string;
  eventTime?: string;
  asKnownAt?: string;
  effectiveDate?: string;
}

export const INGESTION_CHECKPOINT_STATUSES = [
  'IDLE',
  'FETCHING',
  'FETCHED',
  'STAGED',
  'VALIDATING',
  'VALIDATED',
  'SEALED',
  'CATALOGED',
  'MIRRORED',
  'FAILED',
  'GAPPED',
] as const;

export type IngestionCheckpointStatus = (typeof INGESTION_CHECKPOINT_STATUSES)[number];

export interface SafeIngestionCursor {
  kind: 'PUBLIC_CURSOR' | 'SECRET_REFERENCE';
  /** A non-secret cursor value, or an external secret reference when `kind` is `SECRET_REFERENCE`. */
  value: string;
}

export interface IngestionCheckpoint {
  checkpointId: string;
  dataset: HistoricalDataset;
  sourceId: string;
  scopeKey: string;
  instrumentId?: string;
  partitionKey?: string;
  lastSuccessfulEventTime?: string;
  lastSuccessfulFetchTime?: string;
  cursor?: SafeIngestionCursor;
  status: IngestionCheckpointStatus;
  attemptCount: number;
  nextRetryAt?: string;
  freshnessSlaSeconds: number;
  gapIds: string[];
  ingestionRunId?: string;
  sealedManifestId?: string;
  sealedCompleteness?: PartitionCompleteness;
  checksum?: string;
  errorClass?: string;
  updatedAt: string;
}

export const COVERAGE_GAP_STATUSES = ['OPEN', 'RETRYING', 'RESOLVED', 'WAIVED'] as const;

export type CoverageGapStatus = (typeof COVERAGE_GAP_STATUSES)[number];

export interface CoverageGap {
  gapId: string;
  dataset: HistoricalDataset;
  sourceId: string;
  scopeKey: string;
  start: string;
  end: string;
  reason: string;
  detectedAt: string;
  updatedAt: string;
  status: CoverageGapStatus;
  retryable: boolean;
  resolutionReference?: string;
}

export interface AdjustedBarCacheWatermark {
  rawPartitionChecksum: string;
  corporateActionManifestId: string;
  adjustmentMode: 'SPLIT_ADJUSTED' | 'TOTAL_RETURN_ADJUSTED';
  adjustmentSchemaVersion: string;
}

export interface PartitionWriteContext {
  datasetVersion: string;
  ingestionRunId: string;
  sourceIds: string[];
  sourceChecksums: PartitionSourceChecksum[];
  licenseClass: DatasetLicenseClass;
  redistribution: DatasetRedistribution;
  privateRetentionStatus: PrivateRetentionStatus;
  completeness: PartitionCompleteness;
  coverageGapIds: string[];
  conflictCount: number;
  createdAt: string;
}

export interface StagedPartitionCandidate {
  dataset: HistoricalDataset;
  descriptor: PartitionDescriptor;
  context: PartitionWriteContext;
  generation: number;
  finalObjectKey: string;
  supersedesManifestId?: string;
  stagingObject: StoredObjectReference;
  semanticContentSha256: string;
  rowCount: number;
  minEventTime?: string;
  maxEventTime?: string;
  minAsKnownAt?: string;
  maxAsKnownAt?: string;
  recordLocators: RecordLocator[];
}

export interface PartitionValidationResult {
  valid: boolean;
  rowCount: number;
  exactByteSha256: string;
  errors: string[];
}

export interface MarketHistoricalStore {
  stagePartition(
    records: readonly unknown[],
    descriptor: PartitionDescriptor,
    context: PartitionWriteContext,
  ): Promise<StagedPartitionCandidate>;
  validateCandidate(candidate: StagedPartitionCandidate): Promise<PartitionValidationResult>;
  sealPartition(candidate: StagedPartitionCandidate): Promise<PartitionManifest>;
  readSealedPartition(manifestId: string): Promise<readonly unknown[]>;
  readHistoricalGeneration(manifestId: string): Promise<readonly unknown[]>;
  listManifests(dataset?: HistoricalDataset): Promise<PartitionManifest[]>;
  supersedeGeneration(candidate: StagedPartitionCandidate, manifestId: string): Promise<PartitionManifest>;
  quarantine(manifestId: string, reason: string): Promise<void>;
  rebuildMetadata(): Promise<void>;
  listFilingsAsKnownAt(issuerCik: string, asKnownAt: string): Promise<FilingEvent[]>;
  listFundamentalsAsKnownAt(issuerCik: string, asKnownAt: string): Promise<FundamentalFact[]>;
  listActionsAsKnownAt(instrumentId: string, asKnownAt: string): Promise<CorporateAction[]>;
}
