export const API_AUTH_REQUIRED_EVENT = 'wm-api-auth-required';

export type ApiRequestErrorCode = 'AUTH_SESSION_REQUIRED' | 'HTTP_ERROR';

export class ApiRequestError extends Error {
  readonly code: ApiRequestErrorCode;
  readonly status: number;

  constructor(code: ApiRequestErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

let authRequiredDispatched = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isApiUrl(input: RequestInfo | URL): boolean {
  try {
    const base = typeof location === 'undefined' ? 'https://worldmonitor.invalid' : location.href;
    return new URL(requestUrl(input), base).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function isAccessLoginUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.endsWith('.cloudflareaccess.com')
      && url.pathname.startsWith('/cdn-cgi/access/login/');
  } catch {
    return false;
  }
}

function notifyAuthRequired(): void {
  if (authRequiredDispatched) return;
  authRequiredDispatched = true;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(API_AUTH_REQUIRED_EVENT));
  }
}

async function isAccessLoginHtml(response: Response): Promise<boolean> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html')) return false;
  try {
    const body = (await response.clone().text()).slice(0, 16_384);
    return /cloudflare\s+access|cloudflareaccess\.com|\/cdn-cgi\/access\/login\//i.test(body);
  } catch {
    return false;
  }
}

/**
 * Fetch a first-party API without allowing a service worker or the browser to
 * follow an authentication redirect into Cloudflare Access as a second,
 * cross-origin request. Relative API calls carry the owner browser's same-origin
 * Access cookie; public=1 remains only an application/CDN cache marker.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const apiRequest = isApiUrl(input);
  const response = await globalThis.fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    redirect: init.redirect ?? (apiRequest ? 'manual' : 'follow'),
  });

  const authRedirect = apiRequest && (
    response.type === 'opaqueredirect'
    || isAccessLoginUrl(response.url)
    || await isAccessLoginHtml(response)
  );
  if (authRedirect) {
    notifyAuthRequired();
    throw new ApiRequestError(
      'AUTH_SESSION_REQUIRED',
      'AUTH_SESSION_REQUIRED: refresh the Cloudflare Access session and reload',
      response.status,
    );
  }
  return response;
}

export function apiHttpError(response: Response, label: string): ApiRequestError {
  return new ApiRequestError('HTTP_ERROR', `${label} HTTP ${response.status}`, response.status);
}

export function isApiAuthRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'AUTH_SESSION_REQUIRED';
}

export const __testing__ = {
  resetAuthRequiredNotification(): void {
    authRequiredDispatched = false;
  },
};
