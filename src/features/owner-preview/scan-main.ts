import { mountScanPreview } from './scan-view';
import './scan.css';
const host = document.getElementById('scan');
if (host && import.meta.env.DEV) mountScanPreview(host);
