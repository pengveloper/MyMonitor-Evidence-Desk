import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyBuild } from './verify-scope.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
function run(command, args) {
  console.log('\n> ' + [command, ...args].join(' '));
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function npm(script) { run(process.execPath, [process.env.npm_execpath, 'run', script]); }
npm('typecheck:demo');
npm('typecheck:feedback');
npm('test:feedback');
run(process.execPath, ['--test', 'tests/demo-verification.test.mjs']);
run(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['tests/publication-provenance.test.py']);
npm('build:evidence-desk');
verifyBuild(root);
console.log('verify:demo PASS (no deployment, provider requests or browser UI retest)');
