import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNoticeCollection } from '../demo/evidence-desk/notices.mjs';

// Build of the field-design alpha. One artifact serves both public run shapes:
// a static host ships it as the public demo; alpha/server/server.ts serves it as the community install.
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
const notices = createNoticeCollection(root);
// ALPHA_DEMO_LIVE=0 builds a demo that offers the synthetic scenario only.
const usgsLive = process.env.ALPHA_DEMO_LIVE !== '0';
const out = resolve(root, 'dist-alpha');
const PRIVATE_SOURCE_LINK = "'https://github.com/pengveloper/MyMonitor']", PUBLIC_SOURCE_LINK = "'https://github.com/pengveloper/MyMonitor-Evidence-Desk']";

export default defineConfig({
  root: resolve(root, 'alpha'), base: './', publicDir: false, envDir: false, envPrefix: 'NO_RUNTIME_ENV_IN_ALPHA_',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_HASH__: JSON.stringify('alpha') },
  resolve: { alias: [
    { find: '@/config/commands', replacement: resolve(root, 'alpha/shims/commands.ts') },
    { find: /^@\//, replacement: `${resolve(root, 'src')}/` },
  ] },
  server: { host: '127.0.0.1', port: 4311, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310', '/alpha-profile.json': 'http://127.0.0.1:4310' } },
  build: { target: 'es2022', outDir: out, emptyOutDir: true, reportCompressedSize: false },
  plugins: [notices.collector('main'), {
    // The shared field view links to the repository it is developed in. This public build offers
    // its own corresponding source instead. The shared file itself stays byte-identical.
    name: 'alpha-corresponding-source', enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== resolve(root, 'src/features/global-briefing/field/view.ts')) return;
      if (!code.includes(PRIVATE_SOURCE_LINK)) throw new Error('alpha: the source link in the field view changed; update alpha/vite.config.ts');
      return code.replace(PRIVATE_SOURCE_LINK, PUBLIC_SOURCE_LINK);
    },
  }, {
    name: 'alpha-package',
    closeBundle() {
      writeFileSync(resolve(out, 'alpha-profile.json'), `${JSON.stringify({ profile: 'demo', usgsLive })}\n`);
      cpSync(resolve(root, 'LICENSE'), resolve(out, 'LICENSE'));
      cpSync(resolve(root, 'alpha/NOTICE.md'), resolve(out, 'NOTICE.md'));
      mkdirSync(resolve(out, 'licenses'), { recursive: true });
      for (const name of ['Pretendard-OFL.txt', 'Newsreader-OFL.txt']) cpSync(resolve(root, 'src/features/global-briefing/field/fonts', name), resolve(out, 'licenses', name));
      const packages = notices.records(out) as Array<{ name: string; version: string; notices: Array<{ file: string; text: string }> }>;
      writeFileSync(resolve(out, 'THIRD_PARTY_NOTICES.txt'), packages.map(p => `${p.name}@${p.version}\n${p.notices.map(n => `${n.file}\n${n.text}`).join('\n')}`).join('\n\n---\n\n'));
      writeFileSync(resolve(out, 'BUILD_SCOPE.json'), `${JSON.stringify({ packages: packages.map(p => `${p.name}@${p.version}`), sourceModules: notices.sourceModules() }, null, 2)}\n`);
    },
  }],
});
