import { createDemoFetch } from './transport';
const nativeFetch = window.fetch;
window.fetch = createDemoFetch((...args) => nativeFetch(...args), location.origin,
  new URLSearchParams(location.search).get('map') !== 'offline');
const { dismissMissionPresetPrompt } = await import('../../src/services/mission-presets');
// The synthetic scenario already defines a mission; keep manual tools available.
dismissMissionPresetPrompt();
await import('../../preview/personal-app');
await import('./reading.css');
