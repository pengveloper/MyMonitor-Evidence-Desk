import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertBuildCoverage } from '../demo/evidence-desk/verify-scope.mjs';
const json = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
test('both HTML entry points use the checked demo entry', () => {
  for (const name of ['index', 'comparison']) {
    assert.match(readFileSync(new URL('../demo/evidence-desk/' + name + '.html', import.meta.url), 'utf8'), /src="\.\/entry\.ts"/);
  }
  assert.ok(json('tsconfig.demo.json').include.includes('demo/evidence-desk/entry.ts'));
});
test('demo keeps strict policy and both worker implementations', () => {
  assert.equal(json('tsconfig.json').compilerOptions.strict, true);
  assert.equal(json('tsconfig.json').compilerOptions.noUncheckedIndexedAccess, true);
  for (const config of ['tsconfig.demo.json', 'tsconfig.demo-workers.json']) {
    assert.equal(json(config).compilerOptions.strict, undefined);
  }
  const workers = json('tsconfig.demo-workers.json').include;
  assert.ok(workers.includes('src/workers/analysis.worker.ts'));
  assert.ok(workers.includes('src/workers/ml.worker.ts'));
});
test('runtime alias uses the same TS path mapping and checks the real replacement', () => {
  const config = readFileSync(new URL('../demo/evidence-desk/vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /tsconfig\.demo\.json/);
  assert.deepEqual(json('tsconfig.demo.json').compilerOptions.paths['@/features/stock-research/open-outcome-data'], ['demo/evidence-desk/open-outcome-not-connected.ts']);
});
test('build coverage rejects an unchecked main or worker and a missing worker build', () => {
  const typed = { main: ['app.ts'], worker: ['worker.ts'] };
  assert.doesNotThrow(() => assertBuildCoverage(typed, typed));
  assert.throws(() => assertBuildCoverage(typed, { main: ['missing.ts'], worker: ['worker.ts'] }));
  assert.throws(() => assertBuildCoverage(typed, { main: ['app.ts'], worker: ['missing.ts'] }));
  assert.throws(() => assertBuildCoverage(typed, { main: ['app.ts'], worker: [] }));
});
