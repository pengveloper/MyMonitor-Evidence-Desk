import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const out = resolve(process.argv[2] ?? 'dist-evidence-desk');
const read = name => readFileSync(resolve(out,name));
const provenance = JSON.parse(read('ASSET_PROVENANCE.json'));
const manifest = JSON.parse(read('MANIFEST.sha256.json'));
for (const [name,hash] of Object.entries(manifest)) {
  if (createHash('sha256').update(read(name)).digest('hex') !== hash) throw new Error('Manifest mismatch: ' + name);
}
for(const name of ['ANSWER_KEY.md','STATIC_ACCEPTANCE.md','textures']) if(existsSync(resolve(out,name))) throw new Error('Forbidden public payload: ' + name);
for(const p of provenance.packages) {
  if(!p.bundles.length) throw new Error("No emitted bundle for package: " + p.name);
  if(!p.notices.length) throw new Error('No license: '+p.name);
  for(const file of p.bundles) if(!existsSync(resolve(out,file))) throw new Error('Missing bundle: '+file);
  for(const n of p.notices) if(n.file.startsWith('/')) throw new Error('Internal absolute path in license record');
}
const workerPackages = provenance.packages.filter(p=>p.scopes.includes('worker'));
for(const name of ['@xenova/transformers','onnxruntime-web','onnxruntime-common']) {
  if(!workerPackages.some(p=>p.name===name)) throw new Error('Missing worker notice: '+name);
}
const notices = read('THIRD_PARTY_NOTICES.txt').toString();
for(const text of ['Mapbox','ICU 58','Michael Bostock','Microsoft Corporation']) if(!notices.includes(text)) throw new Error('Missing copied/worker notice: '+text);
for(const file of readdirSync(resolve(out,'assets')).filter(n=>n.endsWith('.css'))) {
  if(read('assets/'+file).toString().includes('/textures/earth-blue-marble.jpg')) throw new Error('Original texture URL leaked into demo CSS');
}
console.log(JSON.stringify({status:'PASS',manifestEntries:Object.keys(manifest).length,packages:provenance.packages.length,workerPackages:workerPackages.map(p=>p.name+'@'+p.version),copied:provenance.copied.length,generated:provenance.generated.length}));
