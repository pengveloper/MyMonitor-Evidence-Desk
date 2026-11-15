import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import type { MyMonitorDeploymentProfile } from '@/services/deployment-profile';

export const OWNER_PRIMARY_NAV_ITEMS = [
  { id: 'today', labelKey: 'nav.today' },
  { id: 'world', labelKey: 'nav.world' },
  { id: 'markets', labelKey: 'nav.markets' },
  { id: 'watchlist', labelKey: 'nav.watchlist' },
  { id: 'research', labelKey: 'nav.research' },
  { id: 'learning', labelKey: 'nav.learning' },
] as const satisfies ReadonlyArray<{
  id: 'today' | 'world' | 'markets' | 'watchlist' | 'research' | 'learning';
  labelKey: MyMonitorTranslationKey;
}>;

export interface OwnerShellPolicy {
  showHostedAccount: boolean;
  showCommercialUpsell: boolean;
  showPricing: boolean;
  showVariantNavigation: boolean;
  showExternalMarketingNavigation: boolean;
  showUpstreamAttribution: true;
}

export const PERSONAL_HIDDEN_SHELL_SURFACES = [
  'hosted-account',
  'commercial-upsell',
  'pricing',
  'variant-navigation',
  'external-marketing-navigation',
] as const;

const PERSONAL_OWNER_SHELL_POLICY: OwnerShellPolicy = Object.freeze({
  showHostedAccount: false,
  showCommercialUpsell: false,
  showPricing: false,
  showVariantNavigation: false,
  showExternalMarketingNavigation: false,
  // Attribution and source links are a separate concern from commercial UI.
  showUpstreamAttribution: true,
});

const STANDARD_SHELL_POLICY: OwnerShellPolicy = Object.freeze({
  showHostedAccount: true,
  showCommercialUpsell: true,
  showPricing: true,
  showVariantNavigation: true,
  showExternalMarketingNavigation: true,
  showUpstreamAttribution: true,
});

export function getOwnerShellPolicy(profile: MyMonitorDeploymentProfile): OwnerShellPolicy {
  return profile === 'personal' ? PERSONAL_OWNER_SHELL_POLICY : STANDARD_SHELL_POLICY;
}

export function getOwnerPrimaryNavigation(language: string | null | undefined) {
  return OWNER_PRIMARY_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: translateMyMonitor(item.labelKey, language),
  }));
}
