import { isPersonalDeployment } from '@/services/deployment-profile';
import { mountOwnerInvestmentContext } from './owner-investment-context';
import { mountOwnerDiscovery } from '../owner-discovery/surface';
import { mountGlobalBriefing, type BriefingOptions } from '../global-briefing/surface';
import type { BriefingUpdate } from '../global-briefing/model';

import { isEvidenceDeskDemo } from '../global-briefing/evidence-desk';

const BRIEFING_UPDATE = 'mymonitor:briefing-presentation';
export function updateOwnerBriefing(host: HTMLElement, update: BriefingUpdate): void {
  host.dispatchEvent(new CustomEvent<BriefingUpdate>(BRIEFING_UPDATE, { detail: update }));
}

/** Additive composition: preserve holdings, story, research and risk UI. */
export function mountOwnerHome(host: HTMLElement, options: BriefingOptions = {}): () => void {
  if (!isPersonalDeployment()) return () => {};
  const briefing = mountGlobalBriefing(host, { ...options, evidenceDesk: isEvidenceDeskDemo(import.meta.env.DEV, location.pathname, typeof __EVIDENCE_DESK_STATIC__ !== 'undefined' && __EVIDENCE_DESK_STATIC__) });
  const update = (event: Event) => briefing.update((event as CustomEvent<BriefingUpdate>).detail);
  host.addEventListener(BRIEFING_UPDATE, update);
  const investmentCleanup = mountOwnerInvestmentContext(briefing.investmentHost);
  const discoveryCleanup = mountOwnerDiscovery(briefing.discoveryHost, briefing.updateDiscovery);
  return () => { host.removeEventListener(BRIEFING_UPDATE, update); discoveryCleanup(); investmentCleanup(); briefing.destroy(); };
}
