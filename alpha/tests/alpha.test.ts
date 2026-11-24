import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseUsgsFeed, quakeRecord } from '../shared/usgs.ts';
import { eventsState, isEventsRead } from '../shared/events-contract.ts';
import { collectOnce } from '../server/collect.ts';
import { readStore, RETENTION_DAYS } from '../server/store.ts';
import { createAlphaServer, configFromEnv, type ServerConfig } from '../server/server.ts';
import { readRecords, recordMarkdown, saveRecord, deleteRecord, type SavedRecord } from '../app/records.ts';

// Every event in the fixture is invented. No test contacts USGS or any other network host.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/usgs-feed.json', import.meta.url), 'utf8')) as { features: unknown[] };
const NOW = 1795500000000;
const feedFetch = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const dataDir = () => mkdtempSync(join(tmpdir(), 'mymonitor-alpha-'));

test('feed parsing keeps what USGS published and rejects what is malformed; nothing is repaired', () => {
  const parsed = parseUsgsFeed(fixture);
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.rejected, 1);
  assert.deepEqual(parsed.records.map(r => r.id), ['fx0000a', 'fx0000b', 'fx0000c']);
  const [a, , c] = parsed.records;
  assert.deepEqual({ magnitude: a!.magnitude, depthKm: a!.depthKm, tsunami: a!.tsunami, alert: a!.alert, reviewStatus: a!.reviewStatus, latitude: a!.latitude, longitude: a!.longitude },
    { magnitude: 6.3, depthKm: 29.5, tsunami: true, alert: 'orange', reviewStatus: 'reviewed', latitude: 38.3, longitude: 142.4 });
  // A missing place is said as missing; a link that is not a USGS event page is replaced by the event page of the same id.
  assert.equal(c!.place, 'Location not stated');
  assert.equal(c!.url, 'https://earthquake.usgs.gov/earthquakes/eventpage/fx0000c');
  assert.equal(c!.depthKm, null);
  assert.equal(quakeRecord({ id: 'x', properties: {}, geometry: {} }), null);
  assert.throws(() => parseUsgsFeed({ type: 'Other' }), /USGS_FEED_MALFORMED/);
});

test('collect stores a successful read and keeps the stored events when a later read fails', async () => {
  const dir = dataDir();
  const first = await collectOnce({ dataDir: dir, fetcher: feedFetch(fixture), now: () => NOW });
  assert.deepEqual({ ok: first.ok, received: first.received, added: first.added, updated: first.updated, rejected: first.rejected }, { ok: true, received: 3, added: 3, updated: 0, rejected: 1 });
  const again = await collectOnce({ dataDir: dir, fetcher: feedFetch(fixture), now: () => NOW + 60_000 });
  assert.deepEqual({ added: again.added, updated: again.updated }, { added: 0, updated: 0 });
  const failed = await collectOnce({ dataDir: dir, fetcher: feedFetch({}, 503), now: () => NOW + 120_000 });
  assert.deepEqual({ ok: failed.ok, error: failed.error }, { ok: false, error: 'HTTP 503' });
  const malformed = await collectOnce({ dataDir: dir, fetcher: feedFetch({ type: 'nope' }), now: () => NOW + 180_000 });
  assert.equal(malformed.error, 'USGS_FEED_MALFORMED');
  const down = await collectOnce({ dataDir: dir, fetcher: async () => { throw new TypeError('fetch failed'); }, now: () => NOW + 240_000 });
  assert.equal(down.error, 'NETWORK');
  const state = readStore(dir);
  assert.equal(Object.keys(state.events).length, 3);
  assert.equal(state.lastSuccessAt, new Date(NOW + 60_000).toISOString());
  assert.deepEqual(state.attempts.map(a => a.ok), [false, false, false, true, true]);
  // Events older than the retention window leave the store on the next successful collection.
  await collectOnce({ dataDir: dir, fetcher: feedFetch({ type: 'FeatureCollection', features: [] }), now: () => NOW + (RETENTION_DAYS + 1) * 86_400_000 });
  assert.equal(Object.keys(readStore(dir).events).length, 0);
  // A store this build cannot read is an error, never an empty store.
  writeFileSync(join(dir, 'events.json'), JSON.stringify({ schemaVersion: 'other' }));
  assert.throws(() => readStore(dir), /STORE_UNSUPPORTED/);
});

test('freshness: empty, fresh, and stale after a failed attempt or an old success', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(eventsState(0, null, null, NOW, 60), 'EMPTY');
  assert.equal(eventsState(3, at, true, NOW + 59 * 60_000, 60), 'FRESH');
  assert.equal(eventsState(3, at, true, NOW + 61 * 60_000, 60), 'STALE');
  assert.equal(eventsState(3, at, false, NOW + 60_000, 60), 'STALE');
});

async function withServer(overrides: Partial<ServerConfig>, run: (base: string, config: ServerConfig) => Promise<void>): Promise<void> {
  const config: ServerConfig = { ...configFromEnv({}), port: 0, dataDir: dataDir(), staticDir: join(tmpdir(), 'mymonitor-alpha-no-build'), fetcher: feedFetch(fixture), ...overrides };
  const app = createAlphaServer(config);
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('no address');
  try { await run(`http://127.0.0.1:${address.port}`, config); } finally { app.stop(); }
}

test('server: defaults are safe, the reader says EMPTY before the first collection, then serves what was stored', async () => {
  const defaults = configFromEnv({});
  assert.deepEqual({ host: defaults.host, auto: defaults.autoCollectMinutes, token: defaults.collectToken }, { host: '127.0.0.1', auto: 0, token: '' });
  assert.throws(() => configFromEnv({ ALPHA_AUTO_COLLECT_MINUTES: '1' }), /5 or more/);
  await withServer({}, async base => {
    assert.deepEqual(await (await fetch(`${base}/alpha-profile.json`)).json(), { profile: 'community', usgsLive: true });
    const empty = await (await fetch(`${base}/api/events`)).json();
    assert.equal(isEventsRead(empty), true);
    assert.deepEqual({ state: empty.state, events: empty.events.length, lastSuccessAt: empty.lastSuccessAt, lastAttempt: empty.lastAttempt, auto: empty.autoCollectMinutes }, { state: 'EMPTY', events: 0, lastSuccessAt: null, lastAttempt: null, auto: 0 });
    assert.equal((await fetch(`${base}/api/collect`)).status, 405);
    const collected = await fetch(`${base}/api/collect`, { method: 'POST' });
    assert.equal(collected.status, 200);
    assert.equal((await collected.json()).attempt.added, 3);
    assert.equal((await fetch(`${base}/api/collect`, { method: 'POST' })).status, 429);
    const read = await fetch(`${base}/api/events`);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.match(read.headers.get('content-security-policy') ?? '', /connect-src 'self'/);
    const body = await read.json();
    assert.deepEqual({ state: body.state, ids: body.events.map((e: { id: string }) => e.id), source: body.source.id }, { state: 'FRESH', ids: ['fx0000a', 'fx0000b', 'fx0000c'], source: 'USGS' });
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.deepEqual({ stored: status.storedEvents, paid: status.paidProviders, from: status.collectFromBrowser }, { stored: 3, paid: [], from: 'loopback-only' });
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 503);
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 503);
  });
});

test('server: a failed collection is reported with its reason, and a token closes collection to others', async () => {
  await withServer({ fetcher: feedFetch({}, 500) }, async base => {
    const failed = await fetch(`${base}/api/collect`, { method: 'POST' });
    assert.equal(failed.status, 502);
    const read = await (await fetch(`${base}/api/events`)).json();
    assert.deepEqual({ state: read.state, ok: read.lastAttempt.ok, error: read.lastAttempt.error }, { state: 'EMPTY', ok: false, error: 'HTTP 500' });
  });
  await withServer({ collectToken: 'local-test-token' }, async base => {
    assert.equal((await fetch(`${base}/api/collect`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${base}/api/collect`, { method: 'POST', headers: { authorization: 'Bearer wrong-test-token' } })).status, 403);
    assert.equal((await fetch(`${base}/api/collect`, { method: 'POST', headers: { authorization: 'Bearer local-test-token' } })).status, 200);
  });
});

test('saved records are frozen copies: save, reopen, export, delete; a refused storage is reported, not hidden', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  const record: SavedRecord = { id: 'r1', savedAt: '2026-11-24T06:00:00.000Z', mode: 'usgs', eventId: 'world:earthquake:fx0000a', title: '규모 6.3 지진 · Fixture event A', summary: '요약', observedAt: '2026-11-24T05:00:00.000Z',
    sourceLabel: 'USGS', sourceHref: 'https://earthquake.usgs.gov/earthquakes/eventpage/fx0000a', facts: ['진원 깊이 29.5km로 발표됐습니다.'], whyImportant: '이유', uncertainty: '미확인', nextCheck: '다음', latitude: 38.3, longitude: 142.4, receivedAt: '2026-11-24T05:30:00.000Z' };
  assert.deepEqual(readRecords(storage), []);
  assert.equal(saveRecord(record, storage)!.length, 1);
  assert.equal(readRecords(storage)![0]!.title, record.title);
  const markdown = recordMarkdown(record);
  for (const text of ['# 규모 6.3 지진 · Fixture event A', '저장 시각: 2026. 11. 24. 15:00 KST', 'USGS 실제 자료', '저장한 시점의 사본', 'U.S. Geological Survey', '위도 38.300']) assert.ok(markdown.includes(text), text);
  assert.ok(recordMarkdown({ ...record, mode: 'synthetic' }).includes('실제 사건이 아닙니다'));
  assert.deepEqual(deleteRecord('r1', storage), []);
  const refused = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readRecords(refused), null);
  assert.equal(saveRecord(record, refused), null);
});
