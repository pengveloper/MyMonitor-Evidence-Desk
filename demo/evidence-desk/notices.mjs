import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
export function createNoticeCollection(root) {
  root = resolve(root);
  const packages = new Map();
  const collector = scope => ({ name: 'demo-licenses-' + scope,
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules)) {
          const at = id.lastIndexOf('/node_modules/'); if (at < 0) continue;
          const pieces = id.slice(at + 14).split('/');
          const name = pieces[0].startsWith('@') ? pieces.slice(0, 2).join('/') : pieces[0];
          const dir = id.slice(0, at + 14) + name;
          if (!existsSync(resolve(dir, 'package.json'))) continue;
          const meta = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
          const key = meta.name + '@' + meta.version;
          if (!packages.has(key)) {
            const files = readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && /^(licen[cs]e|notice|copying)([.\-_]|$)/i.test(e.name)).map(e => e.name).sort();
            // These npm 1.14.0 packages omit license files. Use their exact
            // upstream release, never a generic latest license or silent omission.
            if (['onnxruntime-common@1.14.0','onnxruntime-web@1.14.0'].includes(key)) {
              files.push(resolve(root,'demo/evidence-desk/licenses/onnxruntime-common-1.14.0.LICENSE.txt'));
              files.push(resolve(root,'demo/evidence-desk/licenses/onnxruntime-1.14.0.ThirdPartyNotices.txt'));
            }
            if (key === 'pmtiles@4.4.0') files.push(resolve(root,'demo/evidence-desk/licenses/pmtiles-4.4.0.LICENSE.txt'));
            if (!files.length) throw new Error('Missing shipped-package license: ' + key);
            const records = files.map(file => { const text = readFileSync(resolve(dir,file),'utf8'); return { file:file.startsWith(root + '/') ? file.slice(root.length + 1) : file, sha256:sha(text), text }; });
            packages.set(key, { name:meta.name, version:meta.version, license:meta.license, notices:records, bundles:new Set(), scopes:new Set() });
          }
          const item = packages.get(key); item.bundles.add(chunk.fileName);
          for (const css of chunk.viteMetadata?.importedCss ?? []) item.bundles.add(css);
          item.scopes.add(scope);
        }
      }
    }
  });
  return { collector, records: (out) => [...packages.values()].sort((a,b) => (a.name + a.version).localeCompare(b.name + b.version)).map(p => ({ ...p, bundles:[...p.bundles].filter(file => !out || existsSync(resolve(out,file))).sort(), scopes:[...p.scopes].sort() })) };
}
