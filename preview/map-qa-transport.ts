/** Preview-only read permission for the application's existing public basemap. */
export function isPublicBasemapRead(url: URL, method: string, enabled: boolean): boolean {
  return enabled && method.toUpperCase() === 'GET' && url.origin === 'https://tiles.openfreemap.org'
    && !url.username && !url.password && !url.search;
}

export function installMapQaTransport(enabled: boolean): void {
  const original = window.fetch;
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin === location.origin) return original(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (isPublicBasemapRead(url, method, enabled)) {
      // Never forward request headers, credentials or a payload to the tile host.
      return original(url.href, { credentials: 'omit', signal: init?.signal });
    }
    return Promise.reject(new Error('ISOLATED_PREVIEW_EXTERNAL_READ_BLOCKED'));
  };
}
