import type { CoverageInput } from '../../../shared/discovery-coverage';
import { marketEvidenceDetails } from '../../../shared/discovery-market-evidence';

/** A and B use the same canonical values; no model prose is parsed into evidence. */
export function renderMarketEvidence(host: HTMLElement, input: CoverageInput) {
  const section = document.createElement('section'); section.className = 'canonical-market-evidence';
  section.dataset.fingerprint = input.fingerprint;
  const title = document.createElement('h3'); title.textContent = '시장 근거 · 수치와 시점은 원자료에서 표시'; section.append(title);
  const cutoff = document.createElement('p'); cutoff.textContent = 'Snapshot 기준시각 (UTC) · ' + input.cutoffAt; section.append(cutoff);
  try {
    for (const item of marketEvidenceDetails(input)) {
      const detail = document.createElement('details'); detail.dataset.evidenceId = item.canonicalId; detail.dataset.fingerprint = item.fingerprint;
      const summary = document.createElement('summary');
      summary.textContent = `${item.label ?? item.canonicalId} · ${item.value ?? 'UNKNOWN'} ${item.unit} · ${item.role === 'PROXY' ? 'PROXY_ONLY' : item.role ?? 'REFERENCE'} · ${item.freshness}`;
      detail.append(summary);
      for (const [field, value] of Object.entries({ value: item.value, unit: item.unit, change: item.change,
        observedAt: item.observedAt, fetchedAt: item.fetchedAt, session: item.session, freshness: item.freshness,
        reason: item.reason, canonicalId: item.canonicalId, fingerprint: item.fingerprint })) {
        const row = document.createElement('p'); row.dataset.field = field; row.textContent = field + ' · ' + (value ?? 'UNKNOWN'); detail.append(row);
      }
      const link = document.createElement('a'); link.href = item.source; link.textContent = '원문 · ' + item.source;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link); section.append(detail);
    }
  } catch {
    section.dataset.status = 'UNAVAILABLE'; const error = document.createElement('p');
    error.textContent = 'UNAVAILABLE · 근거의 동일성 또는 시간 계약을 확인할 수 없습니다.'; section.append(error);
  }
  host.append(section);
}
