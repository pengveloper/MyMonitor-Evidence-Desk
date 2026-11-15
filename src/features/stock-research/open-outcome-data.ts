import type { OpenOutcomeArtifact } from './open-history-contract.ts';

let artifactPromise: Promise<OpenOutcomeArtifact> | undefined;

function validateArtifact(value: unknown): OpenOutcomeArtifact {
  if (!value || typeof value !== 'object') throw new Error('OPEN-OUTCOME artifact is not an object');
  const artifact = value as Partial<OpenOutcomeArtifact>;
  if (artifact.schemaVersion !== 'open-outcome/v1'
    || typeof artifact.generatedAt !== 'string'
    || !Array.isArray(artifact.sourceIds)
    || !artifact.sourceIds.every((item) => typeof item === 'string')
    || !Array.isArray(artifact.episodes)) {
    throw new Error('OPEN-OUTCOME artifact has an unsupported shape');
  }
  return artifact as OpenOutcomeArtifact;
}

/** Load the checked-in public-history artifact as a separate browser chunk. */
export function loadOpenOutcomeArtifact(): Promise<OpenOutcomeArtifact> {
  artifactPromise ??= import('../../../data/open-history/open-outcome-0.json')
    .then((module) => validateArtifact(module.default));
  return artifactPromise;
}
