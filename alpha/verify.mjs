// One command that checks the alpha from source to a served screen without touching the network:
// types -> tests -> build -> bundle audit -> the self-hosted server collecting an invented feed,
// storing it and serving it. `--serve` keeps that server running for a look in a browser.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (label, args) => { process.stdout.write(`${label} ... `); execFileSync(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); console.log('ok'); };
const bin = name => resolve(root, 'node_modules', name);
if (!process.argv.includes('--skip-checks')) {
  run('typecheck', [bin('typescript/bin/tsc'), '--noEmit', '-p', 'alpha/tsconfig.json']);
  run('tests', ['--test', ...readdirSync(resolve(root, 'alpha/tests')).filter(n => n.endsWith('.test.ts')).map(n => `alpha/tests/${n}`)]);
  run('build', [bin('vite/bin/vite.js'), 'build', '--config', 'alpha/vite.config.ts']);
}

const out = resolve(root, 'dist-alpha');
const scope = JSON.parse(readFileSync(join(out, 'BUILD_SCOPE.json'), 'utf8'));
const unexpected = scope.packages.filter(name => !/^d3-[a-z-]+@/.test(name));
if (unexpected.length) throw new Error(`Unexpected bundled packages: ${unexpected.join(', ')}`);
const bundle = readdirSync(join(out, 'assets')).filter(n => n.endsWith('.js')).map(n => readFileSync(join(out, 'assets', n), 'utf8')).join('\n');
// Nothing from the personal deployment may reach this build: its host, its providers, its key names, its telemetry.
for (const forbidden of ['mymonitor.stream', 'sentry', 'eodhd', 'tossinvest', 'upstash', 'X-MyMonitor-Owner-Key', "github.com/pengveloper/MyMonitor'"]) {
  if (bundle.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden text in bundle: ${forbidden}`);
}
if (!bundle.includes('github.com/pengveloper/MyMonitor-Evidence-Desk')) throw new Error('Corresponding-source link missing');
for (const name of ['LICENSE', 'NOTICE.md', 'THIRD_PARTY_NOTICES.txt', 'licenses/Pretendard-OFL.txt', 'licenses/Newsreader-OFL.txt']) readFileSync(join(out, name));
const profile = JSON.parse(readFileSync(join(out, 'alpha-profile.json'), 'utf8'));
if (profile.profile !== 'demo') throw new Error('Static build must declare the demo profile');

const { createAlphaServer, configFromEnv } = await import('./server/server.ts');
const fixture = readFileSync(resolve(root, 'alpha/tests/fixtures/usgs-feed.json'), 'utf8');
const serve = process.argv.includes('--serve');
const config = { ...configFromEnv({}), port: serve ? 4310 : 0, dataDir: mkdtempSync(join(tmpdir(), 'mymonitor-alpha-verify-')), staticDir: out,
  fetcher: async () => new Response(fixture, { status: 200, headers: { 'content-type': 'application/json' } }) };
const app = createAlphaServer(config);
await new Promise(done => app.server.listen(config.port, '127.0.0.1', done));
const base = `http://127.0.0.1:${app.server.address().port}`;
const get = async path => { const response = await fetch(base + path); return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }; };
const page = await get('/');
if (page.status !== 200 || !page.body.includes('alpha-field')) throw new Error('The built page is not served');
const script = /src="\.\/(assets\/[^"]+\.js)"/.exec(page.body)?.[1];
if (!script || (await get(`/${script}`)).status !== 200) throw new Error('The page script is not served');
if (JSON.parse((await get('/alpha-profile.json')).body).profile !== 'community') throw new Error('The server must declare the community profile');
const before = JSON.parse((await get('/api/events')).body);
const collected = await fetch(`${base}/api/collect`, { method: 'POST' });
const after = JSON.parse((await get('/api/events')).body);
if (before.state !== 'EMPTY' || collected.status !== 200 || after.state !== 'FRESH' || after.events.length !== 3) throw new Error('collect -> store -> read did not produce the stored events');
console.log(JSON.stringify({ status: 'PASS', node: process.version, bundledPackages: scope.packages.length, sourceModules: (scope.sourceModules.main ?? scope.sourceModules).length,
  server: { before: before.state, after: after.state, storedEvents: after.events.length }, network: 'none (invented feed)' }));
if (serve) console.log(`serving ${base} with the invented feed (Ctrl+C to stop)`); else app.stop();
