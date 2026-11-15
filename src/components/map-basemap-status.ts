export type BasemapFailure = 'style' | 'source' | 'sprite' | 'glyph' | 'tile' | 'timeout' | 'webgl';
const labels: Record<BasemapFailure, string> = {
  style: '지도 스타일', source: '지도 자료 목록', sprite: '지도 기호', glyph: '지도 글꼴',
  tile: '지도 타일', timeout: '지도 초기 자료', webgl: '그래픽 화면',
};

/** Safe UI state only. No fetch, retry, camera reset or raw error retention. */
export class MapBasemapStatus {
  private readonly notice = document.createElement('div');
  private readonly message = document.createElement('p');
  private readonly source = document.createElement('small');
  private readonly fallback = document.createElement('button');
  private origins = new Set<string>();

  constructor(private readonly container: HTMLElement) {
    this.notice.className = 'map-basemap-status'; this.notice.hidden = true;
    this.notice.setAttribute('role', 'status');
    this.fallback.type = 'button'; this.fallback.textContent = '지구본으로 보기';
    this.fallback.addEventListener('click', () => this.globeButton()?.click());
    this.notice.append(this.message, this.source, this.fallback); container.append(this.notice);
  }

  private globeButton(): HTMLButtonElement | null {
    return this.container.closest('.map-section')?.querySelector<HTMLButtonElement>('.map-dim-btn[data-mode="globe"]') ?? null;
  }

  addStyle(url: string): void {
    try { this.origins.add(new URL(url, location.href).origin); } catch { /* Inline style, no remote identity. */ }
  }

  error(error: { message?: string; url?: string }): void {
    const candidate = error.url ?? error.message?.match(/https?:\/\/[^\s"<>]+/)?.[0];
    if (!candidate) return;
    try {
      const url = new URL(candidate);
      // Errors in news/weather overlays must not be called a basemap failure.
      if (!this.origins.has(url.origin)) return;
      const path = url.pathname;
      const kind: BasemapFailure = path.includes('/styles/') || path.endsWith('style.json') ? 'style'
        : path.includes('/sprites/') ? 'sprite' : path.includes('/fonts/') ? 'glyph'
          : path.endsWith('.pbf') ? 'tile' : 'source';
      this.fail(kind, url.origin + path);
    } catch { /* Do not expose unstructured or potentially sensitive prose. */ }
  }

  fail(kind: BasemapFailure, safeSource = ''): void {
    if (kind === 'timeout' && !this.notice.hidden) return;
    this.notice.dataset.failure = kind; this.notice.hidden = false;
    this.message.textContent = `${labels[kind]} 읽기에 실패했습니다. 빈 지도는 사건이 없다는 뜻이 아닙니다.`;
    this.source.textContent = safeSource;
    this.fallback.hidden = !this.globeButton();
  }

  ready(): void { this.notice.hidden = true; this.source.textContent = ''; delete this.notice.dataset.failure; }
  destroy(): void { this.notice.remove(); }
}
