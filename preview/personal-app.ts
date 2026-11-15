import '../src/styles/base-layer.css';
import '../src/styles/global-radar.css';
import '../src/styles/control-room-mobile-v2.css';
import { globalBriefingFixture, briefingPolishFixture } from './global-briefing-fixture';
import { updateOwnerBriefing } from '../src/features/stock-research/owner-home';
import { evidenceDeskFixture } from './evidence-desk-fixture';
import { installMapQaTransport } from './map-qa-transport';

// Development-only transport fence, installed before importing the real App.
// No credentials, remote responses or production accounts enter this origin.
const staticDemo = typeof __EVIDENCE_DESK_STATIC__ !== 'undefined' && __EVIDENCE_DESK_STATIC__;
const evidenceDesk = location.pathname.endsWith('/evidence-desk.html') || (staticDemo && location.pathname !== '/comparison.html');
const polish = evidenceDesk || location.pathname.endsWith('/personal-app-polish.html') || new URLSearchParams(location.search).has('polish');
const deskScenario = staticDemo || evidenceDesk || new URLSearchParams(location.search).has('deskFixture');
// Map URL persistence rewrites query parameters; keep the requested QA scenario.
const deskFixtureState = new URLSearchParams(location.search).get('state') ?? 'normal';
let demoRange = 'all';
const fixture = () => {
  const data = deskScenario ? evidenceDeskFixture(deskFixtureState) : polish ? briefingPolishFixture() : globalBriefingFixture();
  if (deskScenario && demoRange !== 'all') {
    const hours: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168 };
    const from = Date.now() - (hours[demoRange] ?? Infinity) * 3_600_000;
    // Match the existing engine's current-clock relative period. The synthetic
    // observation/cutoff stays unchanged; both list and map see this projection.
    data.model.entries = data.model.entries.filter(e => !e.observedAt || Date.parse(e.observedAt) >= from);
  }
  return data;
};
installMapQaTransport(deskScenario || new URLSearchParams(location.search).get('mapQa') === 'public');
localStorage.setItem('wm-ai-flow-browser-model', 'false');
localStorage.setItem('wm-ai-flow-cloud-llm', 'false');
localStorage.setItem('wm-ai-flow-headline-memory', 'false');
// Feed the same fixed scenario through the existing presentation event before
// its consumer sees it. Do not briefly replace it with unavailable live inputs:
// that would reset selection and misrepresent the fixture as a real update.
const fixturePresentation = (event: Event) => {
  if ((event as CustomEvent).detail?.scenario || !(event.target instanceof HTMLElement)) return;
  event.stopImmediatePropagation(); updateOwnerBriefing(event.target, fixture());
};
document.addEventListener('mymonitor:briefing-presentation', fixturePresentation, true);
const { App } = await import('../src/App');
const app = new App('app');
await app.init();
const demoMap = (app as unknown as { state: { map?: import('../src/components/MapContainer').MapContainer } }).state.map;
if (deskScenario && demoMap) {
  // Explicit shared baseline/demo defaults, not a production clock or date rewrite.
  demoMap.setTimeRange('all');
  demoMap.setCenter(20, 70, 1.5);
  const layers = demoMap.getState().layers;
  demoMap.setLayers({ ...Object.fromEntries(Object.keys(layers).map(k => [k, false])), natural: true, hotspots: true } as typeof layers);
}

// Read-only, development-only observation of the real engine for input QA.
// This does not move/zoom the map, change layers, or create provider requests.
const mapObservation = document.createElement('output');
mapObservation.id = 'preview-map-observation'; mapObservation.hidden = true;
document.body.append(mapObservation);
const observeMap = window.setInterval(() => {
  const map = (app as unknown as { state: { map?: import('../src/components/MapContainer').MapContainer } }).state.map;
  const state = map?.getState();
  if (deskScenario && state?.timeRange && state.timeRange !== demoRange) {
    demoRange = state.timeRange;
    const mount = document.getElementById('ownerHomeMount');
    if (mount) updateOwnerBriefing(mount, fixture());
  }
  const deck = (map as unknown as { deckGLMap?: { newsLocations: Array<{ briefingId?: string; visibilityLayer?: string }>;
    state: { layers: Record<string, boolean> }; deckOverlay?: { _deck?: { props: { viewState?: unknown; layers: Array<{ id: string; props: { data: Array<{ briefingId?: string }> } }> } } } } })?.deckGLMap;
  mapObservation.textContent = JSON.stringify({ center: map?.getCenter(), zoom: state?.zoom, timeRange: state?.timeRange,
    layers: Object.entries(state?.layers ?? {}).filter(([, on]) => on).map(([name]) => name),
    deckViewState: deck?.deckOverlay?._deck?.props.viewState,
    eventInputs: deck?.newsLocations.filter(r => r.briefingId).map(r => ({ id: r.briefingId, layer: r.visibilityLayer })),
    pickableEventIds: deck?.deckOverlay?._deck?.props.layers.find(l => l.id === 'news-locations-layer')?.props.data.map(r => r.briefingId),
    renderer: document.getElementById('mapContainer')?.className });
}, 500);
document.title = 'MyMonitor · 전체 personal 앱 · 합성 자료';
const host = document.getElementById('ownerHomeMount');
if (host) updateOwnerBriefing(host, fixture());
// Explicit synthetic automatic repaint for keyboard regression; no fetch or time fabrication.
let repaint = 0;
const interval = !staticDemo && polish && host ? window.setInterval(() => {
  updateOwnerBriefing(host, fixture());
  host.dataset.syntheticRepaints = String(++repaint);
}, 15000) : undefined;
window.addEventListener('pagehide', () => { clearInterval(interval); clearInterval(observeMap); document.removeEventListener('mymonitor:briefing-presentation', fixturePresentation, true); app.destroy(); }, { once: true });
