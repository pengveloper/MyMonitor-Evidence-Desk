import { mountOwnerPreview } from './view';
import './preview.css';
import './candidate.css';
import snapshot from './public-evidence-snapshot.json';
import candidateLedger from './candidate-ledger.json';
import type { CandidateLedger } from '../../../shared/owner-candidate-contract';
import type { PublicDiscoverySnapshot } from '../../../shared/owner-discovery-contract';
// Sanitized public SEC, FX, quote and DGS10 snapshots; never a production route.
const host = document.getElementById('preview');
if (host && import.meta.env.DEV)
    mountOwnerPreview(host, snapshot as PublicDiscoverySnapshot, candidateLedger as CandidateLedger);
else if (host)
    host.textContent = '개발 환경 전용 미리보기입니다.';
