import { createCircuitBreaker, getCSSColor } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';
import { toApiUrl } from '@/services/runtime';
import { apiFetch, apiHttpError } from '@/services/api-fetch';

export interface WeatherAlert {
  id: string;
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  headline: string;
  description: string;
  areaDesc: string;
  onset: Date;
  expires: Date;
  coordinates: [number, number][];
  centroid?: [number, number];
  countryCode?: string;
  source?: string;
}

interface BootstrapAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  areaDesc: string;
  onset: string;
  expires: string;
  coordinates: [number, number][];
  centroid?: [number, number];
  countryCode?: string;
  source?: string;
}

const WEATHER_CACHE_TTL = 30 * 60 * 1000;
const breaker = createCircuitBreaker<WeatherAlert[]>({
  name: 'NWS + ECCC Weather',
  maxFailures: 1,
  cooldownMs: 5 * 60 * 1000,
  cacheTtlMs: WEATHER_CACHE_TTL,
  maxAttempts: 2,
  retryBaseDelayMs: 250,
  persistCache: true,
});

function mapAlert(a: BootstrapAlert): WeatherAlert {
  return {
    id: a.id,
    event: a.event,
    severity: a.severity as WeatherAlert['severity'],
    headline: a.headline,
    description: a.description,
    areaDesc: a.areaDesc,
    onset: new Date(a.onset),
    expires: new Date(a.expires),
    coordinates: a.coordinates,
    centroid: a.centroid,
    countryCode: a.countryCode,
    source: a.source,
  };
}

export async function fetchWeatherAlerts(): Promise<WeatherAlert[]> {
  return breaker.execute(async () => {
    const hydrated = getHydratedData('weatherAlerts') as { alerts?: BootstrapAlert[] } | undefined;
    if (hydrated?.alerts?.length) {
      return hydrated.alerts.map(mapAlert);
    }

    // `&public=1` is the CDN-shielded read (#5386). It does not bypass an
    // upstream Cloudflare Access policy, so same-origin owner credentials must
    // still accompany the request on personal deployments. The
    // bare `?keys=weatherAlerts` URL still answers anonymously but is no-store,
    // because it is also the URL credentialed callers use and a cached entry
    // there would answer an invalid key with this anonymous 200. The map embed
    // has no tier hydration, so this fetch — not getHydratedData — is its
    // primary path and the one that needs the cache entry.
    // The literal matches getHydratedData('weatherAlerts') above and is pinned by
    // tests/weather-public-bootstrap-url.test.mts. Deliberately NOT imported from
    // shared/bootstrap-tier-keys.js: this module is in the embed bundle, and that
    // import would pull the whole 127-entry registry in for one 13-char string.
    const resp = await apiFetch(
      toApiUrl('/api/bootstrap?keys=weatherAlerts&public=1'),
      { credentials: 'same-origin', signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) throw apiHttpError(resp, 'Weather bootstrap');
    const json = await resp.json() as { data?: { weatherAlerts?: { alerts?: BootstrapAlert[] } } };
    const alerts = json.data?.weatherAlerts?.alerts;
    if (alerts?.length) return alerts.map(mapAlert);

    throw new Error('No weather data in bootstrap');
  }, []);
}

export function getWeatherStatus(): string {
  return breaker.getStatus();
}

export function getWeatherDataState(): 'live' | 'stale' | 'provider_unavailable' | 'auth_blocked' {
  const state = breaker.getDataState();
  if (breaker.getLastError()?.includes('AUTH_SESSION_REQUIRED')) return 'auth_blocked';
  if (state.mode === 'unavailable') return 'provider_unavailable';
  if (state.mode === 'cached' && state.timestamp !== null && Date.now() - state.timestamp >= WEATHER_CACHE_TTL) {
    return 'stale';
  }
  return 'live';
}

export function getSeverityColor(severity: WeatherAlert['severity']): string {
  switch (severity) {
    case 'Extreme': return getCSSColor('--semantic-critical');
    case 'Severe': return getCSSColor('--semantic-high');
    case 'Moderate': return getCSSColor('--semantic-elevated');
    case 'Minor': return getCSSColor('--semantic-elevated');
    default: return getCSSColor('--text-dim');
  }
}
