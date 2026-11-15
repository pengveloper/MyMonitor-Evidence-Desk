import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const forbidden = /(^|\/)(node_modules|\.git|\.context|outputs|generated-assets)(\/|$)|(^|\/)\.env(?:\.|$)/;
export function exportSource(destination) {
  const out = resolve(destination);
  if (existsSync(out) || out === root || out.startsWith(root + '/')) throw new Error('Source export requires a new external directory');
  const paths = new Set();
  const add = name => {
    if (forbidden.test(name) || name.startsWith('demo/evidence-desk/generated/')) return;
    const p = resolve(root, name);
    if (lstatSync(p).isSymbolicLink()) throw new Error('Source export refuses symlinks: ' + name);
    if (lstatSync(p).isDirectory()) { for (const n of readdirSync(p).sort()) add(name + '/' + n); }
    else paths.add(name);
  };
  for (const name of ['src','shared','demo/evidence-desk','vendor/security']) add(name);
  for (const name of ['.nvmrc','convex/_generated/api.js','docs/docs.json','scripts/data/prediction-tags.json','scripts/lib/company-monitoring-classification.mjs','scripts/shared/comtrade-reporter-overrides.json','scripts/shared/country-port-clusters.json','server/_shared/aircraft-details-batch.ts','server/_shared/brief-render.js','server/_shared/source-tiers.ts','server/worldmonitor/supply-chain/v1/scenario-templates.ts','LICENSE','package.json','package-lock.json','tsconfig.json',
    'preview/personal-app.ts','preview/global-briefing-fixture.ts','preview/evidence-desk-fixture.ts','preview/map-qa-transport.ts',
    'docs/design/evidence-desk/PUBLIC_DEMO.md','docs/design/evidence-desk/SOURCE_NOTICES.md','docs/design/evidence-desk/PARTICIPANT_TASKS.md']) add(name);
  const assets = JSON.parse(readFileSync(resolve(root, 'demo/evidence-desk/assets.json'), 'utf8'));
  for (const item of assets) add(item.source);
  const excludedTextures = ['earth-blue-marble.jpg','earth-day.jpg','earth-topo-bathy.jpg','earth-water.png','night-sky.png'];
  for (const name of paths) if (excludedTextures.some(t => name.endsWith('/' + t))) throw new Error('Uncleared texture in source export: ' + name);
  mkdirSync(out, { recursive: true });
  const inputs = {};
  for (const name of [...paths].sort()) {
    if (isAbsolute(name) || relative(root, realpathSync(resolve(root, name))).startsWith('..')) throw new Error('Outside source root');
    const bytes = readFileSync(resolve(root, name)); inputs[name] = hash(bytes);
    mkdirSync(dirname(resolve(out, name)), { recursive: true }); cpSync(resolve(root, name), resolve(out, name));
  }
  // Preserve every pinned root dependency/override and lock resolution. The demo
  // does not consume the app/API inventory generator or blog installation: it has
  // an explicit, reviewable lifecycle instead of ignore-scripts or hidden copies.
  const pkg = JSON.parse(readFileSync(resolve(out, 'package.json'), 'utf8'));
  pkg.scripts = { postinstall: 'node demo/evidence-desk/bootstrap.mjs',
    'build:evidence-desk': 'vite build --config demo/evidence-desk/vite.config.ts' };
  writeFileSync(resolve(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  cpSync(resolve(out, 'docs/design/evidence-desk/PUBLIC_DEMO.md'), resolve(out, 'README.md'));
  const files = {};
  for (const name of [...paths, 'README.md'].sort()) files[name] = hash(readFileSync(resolve(out, name)));
  const sourceRevision = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
  const dirty = Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim());
  const manifest = { schemaVersion:1, sourceRevision, dirty, lockSha256:inputs['package-lock.json'],
    lifecycle:'explicit demo bootstrap; production install unchanged; normal npm lifecycle policy preserved', inputs, files };
  writeFileSync(resolve(out, 'SOURCE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(resolve(out, 'SOURCE_REVISION.txt'), sourceRevision + (dirty ? ' + uncommitted candidate changes' : '') + '\n');
  return { out, files:Object.keys(files).length, sourceRevision, dirty };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node demo/evidence-desk/source-package.mjs /new/source-directory');
  console.log(JSON.stringify(exportSource(process.argv[2])));
}
