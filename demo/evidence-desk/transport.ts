/** Static synthetic build only. Never imported by the normal personal entry. */
export function createDemoFetch(original: typeof fetch, origin: string, mapEnabled = true): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      // No network request, credentials, owner bundle or cache-aside execution.
      if (method === 'GET' && url.pathname === '/api/autonomous-learning'
        && !url.searchParams.has('intelligence') && !url.searchParams.has('discovery')) {
        return Response.json({ snapshot: null, providerHealth: null,
          ownerUniverse: { schemaVersion: 'owner-universe/v1', entries: [] } });
      }
      return Response.json({ error: 'SYNTHETIC_DEMO_NOT_CONNECTED' }, { status: 503 });
    }
    if (method !== 'GET' || url.username || url.password) throw new Error('DEMO_NETWORK_BLOCKED');
    if (url.origin === origin && (url.pathname === '/mapbox-gl-rtl-text.min.js' || ['/assets/', '/data/', '/demo-assets/', '/map-styles/'].some(prefix => url.pathname.startsWith(prefix)))) {
      // Same-origin static assets may be behind a Private Codespaces port.
      // Never forward caller headers or cookies to the public map host.
      return original(url.href, { credentials: 'same-origin', redirect: 'error', signal: init?.signal });
    }
    if (mapEnabled && url.origin === 'https://tiles.openfreemap.org' && !url.search) {
      return original(url.href, { credentials: 'omit', redirect: 'error', signal: init?.signal });
    }
    throw new Error('DEMO_NETWORK_BLOCKED');
  };
}
