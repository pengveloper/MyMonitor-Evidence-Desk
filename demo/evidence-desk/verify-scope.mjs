import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
export function assertBuildCoverage(typed, built) {
  for (const scope of ['main', 'worker']) {
    assert.ok(built[scope]?.length, 'Missing build scope: ' + scope);
    const checked = new Set(typed[scope]);
    const missing = built[scope].filter(file => /\.(?:ts|tsx|mts)$/.test(file) && !checked.has(file));
    assert.deepEqual(missing, [], 'Bundled TypeScript missing from ' + scope + ' typecheck');
  }
}
export function verifyBuild(root) {
  const typed = JSON.parse(readFileSync(resolve(root, 'node_modules/.cache/demo-types.json'), 'utf8'));
  const built = JSON.parse(readFileSync(resolve(root, 'node_modules/.cache/demo-build-scope.json'), 'utf8'));
  assertBuildCoverage(typed, built);
  assert.ok(built.main.includes('demo/evidence-desk/entry.ts'), 'Demo entry missing from build');
  for (const file of ['src/workers/analysis.worker.ts', 'src/workers/ml.worker.ts']) {
    assert.ok(built.worker.includes(file), 'Worker implementation missing from build: ' + file);
  }
  const out = resolve(root, 'dist-evidence-desk');
  const manifest = JSON.parse(readFileSync(resolve(out, 'MANIFEST.sha256.json'), 'utf8'));
  assert.ok(Object.keys(manifest).length, 'Empty artifact manifest');
  for (const [file, expected] of Object.entries(manifest)) {
    const path = resolve(out, file);
    assert.ok(path.startsWith(out + sep), 'Manifest path outside artifact');
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, file);
  }
  console.log('Build/typecheck coverage PASS: ' + built.main.length + ' main, ' + built.worker.length + ' worker modules');
  console.log('Artifact manifest PASS: ' + Object.keys(manifest).length + ' file hashes');
}
