import { isPersonalDeployment } from '@/services/deployment-profile';
import { fetchOwnerDiscovery } from '@/services/owner-discovery';
import type { OwnerDiscoveryRead } from '../../../shared/owner-discovery-read-contract';
import { renderScan } from './scan-view';
import './surface.css';

export function mountOwnerDiscovery(host: HTMLElement, onSnapshot?: (data: OwnerDiscoveryRead | null) => void): () => void {
  if (!isPersonalDeployment()) return () => {};
  const root = document.createElement('section'); root.className = 'owner-discovery'; root.setAttribute('aria-label', '오늘의 판단 자료');
  const title = document.createElement('h2'); title.textContent = '오늘의 판단 자료';
  const description = document.createElement('p'); description.textContent = '저장된 공개 canonical 근거 · 자동 수집·AI 호출 없음 · 개인 포지션은 기존 보유 화면에서 확인';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '비교 보기'; toggle.setAttribute('aria-pressed', 'false');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '저장 자료 다시 읽기'; retry.hidden = true;
  const content = document.createElement('div');
  root.append(title, description, toggle, status, retry, content); host.append(root);
  let active = true, layout: 'A' | 'B' = 'A', selected = 'SOXL', data: OwnerDiscoveryRead | null = null;
  let pending: AbortController | null = null;
  const render = () => {
    if (!data) return;
    renderScan(content, data.scan, layout, selected, symbol => { selected = symbol; render();
      content.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus(); }, data.discovery, true);
  };
  toggle.onclick = () => { layout = layout === 'A' ? 'B' : 'A'; toggle.textContent = layout === 'A' ? '비교 보기' : '오늘 보기';
    toggle.setAttribute('aria-pressed', String(layout === 'B')); render(); };
  const load = async () => {
    if (pending) return;
    pending = new AbortController(); retry.hidden = true; status.textContent = 'LOADING · 저장 근거를 읽는 중';
    const timeout = setTimeout(() => pending?.abort(), 15_000);
    try {
      const result = await fetchOwnerDiscovery(pending.signal);
      if (!active) return;
      data = result;
      onSnapshot?.(result);
      status.textContent = result.state === 'UNAVAILABLE' ? 'UNAVAILABLE · 저장된 검증 근거 부족 · 판단 보류'
        : 'PARTIAL · 저장 자료의 시점·결측을 확인하세요. 신규 수집이나 분석 생성이 아닙니다.';
      if (result.reads.some(r => r.state === 'FAILED')) { status.textContent += ' 일부 저장소 읽기 실패'; retry.hidden = false; }
      render();
    } catch {
      if (!active) return;
      // A failed later read must not leave an old result presented as current.
      data = null; content.replaceChildren(); retry.hidden = false;
      onSnapshot?.(null);
      status.textContent = 'FAILED · 인증 또는 저장 자료 연결을 확인하세요. 근거 없음과는 다른 상태입니다.';
    } finally { clearTimeout(timeout); pending = null; }
  };
  retry.onclick = () => void load();
  void load();
  return () => { active = false; pending?.abort(); root.remove(); };
}
