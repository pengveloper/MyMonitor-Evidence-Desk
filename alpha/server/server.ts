import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { DEFAULT_USGS_FEED, USGS_ATTRIBUTION, USGS_FEED_URLS, type UsgsFeed } from '../shared/usgs.ts';
import { EVENTS_SCHEMA_VERSION, eventsState, type EventsRead } from '../shared/events-contract.ts';
import { collectOnce } from './collect.ts';
import { readStore } from './store.ts';

// Self-hosted server of the community run shape: collect the public USGS feed, keep it in a local
// store, serve it to the same screen. It needs no account and no key. Automatic collection is off
// until the operator turns it on; nothing here calls a paid service.
export interface ServerConfig {
  host: string; port: number; dataDir: string; staticDir: string; feed: UsgsFeed; feedUrl?: string;
  /** 0 keeps automatic collection off. Otherwise minutes between collections (5 or more). */
  autoCollectMinutes: number;
  /** When set, POST /api/collect needs `Authorization: Bearer <token>`. When empty, only loopback clients may ask. */
  collectToken: string;
  staleAfterMinutes: number;
  fetcher?: typeof fetch;
}
export const MIN_SECONDS_BETWEEN_COLLECTS = 60;

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const feed = (env.ALPHA_USGS_FEED ?? DEFAULT_USGS_FEED) as UsgsFeed;
  if (!(feed in USGS_FEED_URLS)) throw new Error(`ALPHA_USGS_FEED must be one of: ${Object.keys(USGS_FEED_URLS).join(', ')}`);
  const auto = Number(env.ALPHA_AUTO_COLLECT_MINUTES ?? '0');
  if (!Number.isInteger(auto) || auto < 0 || (auto > 0 && auto < 5)) throw new Error('ALPHA_AUTO_COLLECT_MINUTES must be 0 (off) or an integer of 5 or more');
  const port = Number(env.ALPHA_PORT ?? '4310');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('ALPHA_PORT must be a port number');
  return { host: env.ALPHA_HOST ?? '127.0.0.1', port, dataDir: resolve(env.ALPHA_DATA_DIR ?? 'alpha-data'), staticDir: resolve(env.ALPHA_STATIC_DIR ?? 'dist-alpha'), feed,
    autoCollectMinutes: auto, collectToken: env.ALPHA_COLLECT_TOKEN ?? '', staleAfterMinutes: auto > 0 ? Math.max(auto * 3, 30) : 24 * 60 };
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.png': 'image/png', '.map': 'application/json' };
const SECURITY: Record<string, string> = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin',
};
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...SECURITY, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body));
}
const isLoopback = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
function tokenMatches(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')), expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createAlphaServer(config: ServerConfig): { server: Server; collect: () => ReturnType<typeof collectOnce>; stop: () => void } {
  let lastCollectStartedAt = 0, running: ReturnType<typeof collectOnce> | null = null;
  const collect = () => {
    if (running) return running;
    lastCollectStartedAt = Date.now();
    running = collectOnce({ dataDir: config.dataDir, feed: config.feed, ...(config.feedUrl ? { feedUrl: config.feedUrl } : {}), ...(config.fetcher ? { fetcher: config.fetcher } : {}) }).finally(() => { running = null; });
    return running;
  };
  function eventsRead(): EventsRead {
    const state = readStore(config.dataDir), events = Object.values(state.events).sort((a, b) => b.occurredAt - a.occurredAt), lastAttempt = state.attempts[0] ?? null;
    return { schemaVersion: EVENTS_SCHEMA_VERSION, generatedAt: new Date().toISOString(),
      source: { id: 'USGS', label: 'USGS 지진', feedUrl: config.feedUrl ?? USGS_FEED_URLS[config.feed], attribution: USGS_ATTRIBUTION },
      state: eventsState(events.length, state.lastSuccessAt, lastAttempt ? lastAttempt.ok : null, Date.now(), config.staleAfterMinutes),
      lastSuccessAt: state.lastSuccessAt, lastAttempt, staleAfterMinutes: config.staleAfterMinutes, autoCollectMinutes: config.autoCollectMinutes, events };
  }
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost'), path = url.pathname;
      try {
        if (path === '/alpha-profile.json' && req.method === 'GET') return json(res, 200, { profile: 'community', usgsLive: true });
        if (path === '/api/events' && req.method === 'GET') return json(res, 200, eventsRead());
        if (path === '/api/status' && req.method === 'GET') {
          const state = readStore(config.dataDir);
          return json(res, 200, { profile: 'community', storedEvents: Object.keys(state.events).length, lastSuccessAt: state.lastSuccessAt, attempts: state.attempts.slice(0, 10),
            autoCollectMinutes: config.autoCollectMinutes, collectFromBrowser: config.collectToken ? 'token' : 'loopback-only', feed: config.feed, paidProviders: [] });
        }
        if (path === '/api/collect') {
          if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
          if (config.collectToken ? !tokenMatches(req, config.collectToken) : !isLoopback(req)) return json(res, 403, { error: 'COLLECT_NOT_ALLOWED_FROM_HERE' });
          if (!running && Date.now() - lastCollectStartedAt < MIN_SECONDS_BETWEEN_COLLECTS * 1000) return json(res, 429, { error: 'COLLECTED_RECENTLY', retryAfterSeconds: MIN_SECONDS_BETWEEN_COLLECTS });
          const attempt = await collect();
          return json(res, attempt.ok ? 200 : 502, { attempt });
        }
        if (path.startsWith('/api/')) return json(res, 404, { error: 'NOT_FOUND' });
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        const root = config.staticDir, wanted = normalize(join(root, decodeURIComponent(path)));
        if (wanted !== root && !wanted.startsWith(root + sep)) return json(res, 400, { error: 'BAD_PATH' });
        const file = existsSync(wanted) && statSync(wanted).isFile() ? wanted : join(root, 'index.html');
        if (!existsSync(file)) return json(res, 503, { error: 'APP_NOT_BUILT', hint: 'run: npm run alpha:build' });
        res.writeHead(200, { ...SECURITY, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
        if (req.method === 'HEAD') return void res.end();
        createReadStream(file).pipe(res);
      } catch (error) {
        json(res, error instanceof Error && error.message === 'STORE_UNSUPPORTED' ? 500 : 500, { error: error instanceof Error && error.message === 'STORE_UNSUPPORTED' ? 'STORE_UNSUPPORTED' : 'INTERNAL' });
      }
    })();
  });
  const timer = config.autoCollectMinutes > 0 ? setInterval(() => { void collect(); }, config.autoCollectMinutes * 60_000) : null;
  timer?.unref();
  return { server, collect, stop: () => { if (timer) clearInterval(timer); server.close(); } };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = configFromEnv(), app = createAlphaServer(config);
  app.server.listen(config.port, config.host, () => {
    console.log(`MyMonitor Alpha (community) http://${config.host}:${config.port}`);
    console.log(`store: ${config.dataDir} · feed: USGS ${config.feed} · automatic collection: ${config.autoCollectMinutes > 0 ? `every ${config.autoCollectMinutes} min` : 'off'} · paid providers: none`);
    if (config.autoCollectMinutes > 0) void app.collect();
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { app.stop(); process.exit(0); });
}
