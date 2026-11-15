/** Keep the actual personal app's tools reachable without a second header/nav.
 * Nodes are moved, not recreated: existing handlers, settings and state survive.
 */
export { briefingMapLocations } from './map-bridge';

export function integrateBriefingShell(container: HTMLElement): () => void {
  const tools = container.querySelector('.gb-tools-host');
  const engineHost = container.querySelector('.gb-engine-host');
  const briefing = container.querySelector('.global-briefing');
  if (!tools || !engineHost || !briefing) return () => {};
  const toolsButton = briefing.querySelector<HTMLButtonElement>('.gb-tools-button');
  if (toolsButton) toolsButton.hidden = false;
  const moved: Array<{ node: Element; parent: Node; next: ChildNode | null }> = [];
  const move = (node: Element, host: Element): void => {
    if (!node.parentNode) return;
    moved.push({ node, parent: node.parentNode, next: node.nextSibling }); host.append(node);
  };
  const map = container.querySelector('#mapSection');
  const hint = document.createElement('p'); hint.className = 'gb-engine-hint';
  hint.textContent = '드래그로 지도 이동 · + / − 확대·축소 · 일반 휠은 페이지 이동 · Ctrl+휠 또는 전체화면에서 지도 확대';
  if (map) { move(map, engineHost); map.classList.add('gb-atlas-map'); engineHost.append(hint); briefing.classList.add('gb-has-engine'); }
  for (const selector of ['.header', '.owner-primary-nav', '#panelTabsMount', '#globalRadarMount', '.control-room-hero', '.control-room-dashboard']) {
    const node = container.querySelector(selector);
    if (!node?.parentNode) continue;
    move(node, tools);
  }
  const worldLink = map && tools.querySelector<HTMLAnchorElement>('a[data-owner-nav-target="world"]');
  const enterAtlas = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    window.dispatchEvent(new Event('mymonitor:map-enter'));
  };
  worldLink?.addEventListener('click', enterAtlas);
  container.classList.add('gb-personal-app');
  return () => {
    worldLink?.removeEventListener('click', enterAtlas);
    for (const { node, parent, next } of moved.reverse()) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    briefing.classList.remove('gb-has-engine'); container.classList.remove('gb-personal-app');
    hint.remove();
    map?.classList.remove('gb-atlas-map');
    if (toolsButton) toolsButton.hidden = true;
  };
}
