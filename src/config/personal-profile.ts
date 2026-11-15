import type { MapLayers, PanelConfig } from '@/types';
import { ALL_PANELS, getEffectivePanelConfig } from './panels';

export const PERSONAL_PROFILE_LAYOUT_VERSION = 'personal:v1';
export const PERSONAL_INITIAL_PANEL_MOUNT_BUDGET = Object.freeze({ desktop: 5, mobile: 3 });

// P0 is intentionally small and ordered. Every key is a real canonical panel;
// `tests/personal-profile-policy.test.mts` fails if registry drift breaks that.
export const PERSONAL_P0_PANEL_IDS = [
  'map',
  'politics',
  'intel',
  'strategic-risk',
  'threat-timeline',
  'military-correlation',
  'disaster-correlation',
  'chokepoint-strip',
  'markets',
  'heatmap',
  'commodities',
  'energy-complex',
] as const;

export const PERSONAL_P1_PANEL_IDS = [
  'supply-chain',
  'ucdp-events',
  'security-advisories',
  'satellite-fires',
  'airline-intel',
  'etf-flows',
  'macro-signals',
  'market-breadth',
  'earnings-calendar',
  'cot-positioning',
  'news-market-correlation',
] as const;

export const PERSONAL_P2_PANEL_IDS = [
  'live-news',
  'live-webcams',
  'windy-webcams',
  'stock-analysis',
  'stock-backtest',
  'daily-market-brief',
  'chat-analyst',
  'forecast',
  'regional-intelligence',
  'deduction',
  'market-implications',
  'national-debt',
  'yield-curve',
] as const;

const PERSONAL_P0_PANEL_SET = new Set<string>(PERSONAL_P0_PANEL_IDS);

export function createPersonalPanelSettings(
  existing: Record<string, PanelConfig>,
  variant: string,
): Record<string, PanelConfig> {
  const next: Record<string, PanelConfig> = {};
  for (const key of Object.keys(ALL_PANELS)) {
    const saved = existing[key];
    next[key] = {
      ...getEffectivePanelConfig(key, variant),
      ...(saved?.fontScale === undefined ? {} : { fontScale: saved.fontScale }),
      enabled: PERSONAL_P0_PANEL_SET.has(key),
    };
  }

  // Desktop configuration, custom widgets, and MCP panels are user-owned and
  // not part of the World Monitor catalog preset. Preserve them verbatim.
  for (const [key, config] of Object.entries(existing)) {
    if (!(key in ALL_PANELS)) next[key] = { ...config };
  }
  return next;
}

export function createPersonalMapLayers(current: MapLayers): MapLayers {
  return {
    ...current,
    conflicts: true,
    hotspots: true,
    sanctions: true,
    weather: true,
    natural: true,
    waterways: true,
    outages: true,
    bases: false,
    ais: false,
    flights: false,
    military: false,
    satellites: false,
    fires: false,
    cyberThreats: false,
    webcams: false,
  };
}
