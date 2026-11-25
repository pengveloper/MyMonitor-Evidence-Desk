import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateDemoAssets } from './generate-assets.mjs';
import { createNoticeCollection } from './notices.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const notices = createNoticeCollection(root);
export default defineConfig({
  root: resolve(root, 'demo/evidence-desk'), base: '/', publicDir: false, envDir: false,
  envPrefix: 'NO_RUNTIME_ENV_IN_SYNTHETIC_DEMO_',
  define: {
    'import.meta.env.VITE_MYMONITOR_PROFILE': JSON.stringify('personal'),
    __EVIDENCE_DESK_STATIC__: true,
    __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_HASH__: JSON.stringify('synthetic-demo'),
    __CLERK_JS_VERSION__: JSON.stringify('5'), __VERCEL_ANALYTICS_ENABLED__: false,
  },
  resolve: { alias: Object.fromEntries(Object.entries(JSON.parse(readFileSync(resolve(root, 'tsconfig.demo.json'), 'utf8')).compilerOptions.paths as Record<string, string[]>).map(([key, paths]) => [key.replace(/\/\*$/, ''), resolve(root, paths[0]!.replace(/\/\*$/, ''))])) },
  worker: { format: 'es', plugins: () => [notices.collector('worker')] },
  build: { target: 'es2022', outDir: resolve(root, 'dist-evidence-desk'), emptyOutDir: true, reportCompressedSize: false,
    rollupOptions: { input: { desk: resolve(root, 'demo/evidence-desk/index.html'), comparison: resolve(root, 'demo/evidence-desk/comparison.html') } } },
  plugins: [notices.collector('main'), {
    name: 'synthetic-demo-explicit-assets', enforce: 'pre',
    buildStart() { generateDemoAssets(root); },
    // The private stylesheet keeps its original asset. Only this demo build
    // substitutes the schematic texture, before any browser asset request.
    transform(code, id) {
      if (id.split('?')[0] !== resolve(root, 'src/features/global-briefing/surface.css')) return;
      return code.replace("url('/textures/earth-blue-marble.jpg')", "url('/demo-assets/land-ocean.svg')");
    },
    closeBundle() {
      mkdirSync(resolve(root, 'node_modules/.cache'), { recursive: true });
      writeFileSync(resolve(root, 'node_modules/.cache/demo-build-scope.json'), JSON.stringify(notices.sourceModules(), null, 2));
      const out = resolve(root, 'dist-evidence-desk');
      const assets = JSON.parse(readFileSync(resolve(root, 'demo/evidence-desk/assets.json'), 'utf8'));
      const copy = (source: string, output: string) => { mkdirSync(dirname(resolve(out, output)), { recursive: true }); cpSync(resolve(root, source), resolve(out, output)); };
      for (const item of assets) {
        if (sha(readFileSync(resolve(root, item.source))) !== item.sha256) throw new Error('Asset provenance changed: ' + item.source);
        copy(item.source, item.output);
      }
      const generated = JSON.parse(readFileSync(resolve(root, 'demo/evidence-desk/generated/provenance.json'), 'utf8'));
      for (const item of generated) copy('demo/evidence-desk/generated/' + item.output.split('/').pop(), item.output);
      for (const file of readdirSync(resolve(root, 'demo/evidence-desk/licenses'))) copy('demo/evidence-desk/licenses/' + file, 'licenses/' + file);
      copy('LICENSE', 'LICENSE');
      copy('demo/evidence-desk/_redirects', '_redirects');
      copy('docs/design/evidence-desk/PUBLIC_DEMO.md', 'README.md');
      copy('docs/design/evidence-desk/SOURCE_NOTICES.md', 'SOURCE_NOTICES.md');
      copy('docs/design/evidence-desk/PARTICIPANT_TASKS.md', 'PARTICIPANT_TASKS.md');
      const packages = notices.records(out);
      const texts = packages.map(p => p.name + '@' + p.version + '\n' + p.notices.map(n => n.file + '\n' + n.text).join('\n'));
      for (const name of readdirSync(resolve(out, 'licenses')).sort()) texts.push(name + '\n' + readFileSync(resolve(out, 'licenses', name), 'utf8'));
      writeFileSync(resolve(out, 'THIRD_PARTY_NOTICES.txt'), texts.join('\n\n---\n\n'));
      const packageRecords = packages.map(p => ({ ...p, notices: p.notices.map(({text: _text, ...record}) => record) }));
      writeFileSync(resolve(out, 'ASSET_PROVENANCE.json'), JSON.stringify({ copied: assets, generated, packages: packageRecords }, null, 2) + '\n');
      const manifest: Record<string, string> = {};
      const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name); if (e.isDirectory()) walk(p); else manifest[p.slice(out.length + 1)] = sha(readFileSync(p));
      } };
      walk(out); delete manifest['MANIFEST.sha256.json'];
      writeFileSync(resolve(out, 'MANIFEST.sha256.json'), JSON.stringify(manifest, null, 2) + '\n');
    }
  }],
});
