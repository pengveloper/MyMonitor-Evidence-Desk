import ts from 'typescript';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const report = {};
let failed = false;
for (const [scope, config] of [['main', 'tsconfig.demo.json'], ['worker', 'tsconfig.demo-workers.json']]) {
  const read = ts.readConfigFile(resolve(root, config), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  const options = parsed.options;
  if (!options.strict || !options.noUncheckedIndexedAccess || !options.noEmit) {
    throw new Error('Demo typecheck requires strict/noUncheckedIndexedAccess/noEmit');
  }
  const program = ts.createProgram(parsed.fileNames, options);
  const diagnostics = [...(read.error ? [read.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => String.fromCharCode(10),
    }));
    failed = true;
  }
  const files = program.getSourceFiles().map(f => relative(root, f.fileName).split(sep).join('/'))
    .filter(f => !f.startsWith('node_modules/') && !f.startsWith('../')).sort();
  report[scope] = files;
  console.log(scope + ': ' + files.length + ' local files, ' + diagnostics.length + ' diagnostics');
}
if (failed) process.exit(1);
mkdirSync(resolve(root, 'node_modules/.cache'), { recursive: true });
writeFileSync(resolve(root, 'node_modules/.cache/demo-types.json'), JSON.stringify(report, null, 2));
