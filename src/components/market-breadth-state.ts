export const MARKET_BREADTH_MAX_AGE_MS = 48 * 60 * 60 * 1000;

interface BreadthMethodology {
  provider?: string;
  methodologyVersion?: string;
  universeVersion?: string;
  adjustment?: string;
}

export function breadthMethodologyIdentity(observation: BreadthMethodology): string {
  return [
    observation.provider ?? '',
    observation.methodologyVersion ?? '',
    observation.universeVersion ?? '',
    observation.adjustment ?? '',
  ].join('|');
}

export function isBreadthObservationDelayed(observationDate: string, now = Date.now()): boolean {
  const observedAt = Date.parse(`${observationDate}T21:00:00Z`);
  return Number.isFinite(observedAt) && now - observedAt > MARKET_BREADTH_MAX_AGE_MS;
}
