import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';

export function generateDemoAssets(root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const source = 'public/data/countries-110m.json';
  const bytes = readFileSync(resolve(root, source));
  const topology = JSON.parse(bytes);
  const countries = feature(topology, topology.objects.countries);
  const projection = geoEquirectangular().scale(1024 / (2 * Math.PI)).translate([512, 256]);
  const path = geoPath(projection)(countries);
  const out = resolve(root, 'demo/evidence-desk/generated');
  mkdirSync(out, { recursive: true });
  const products = [];
  for (const [name, ocean, land] of [['land-ocean.svg', '#112f34', '#7f9d86'], ['land-ocean-light.svg', '#dce8e3', '#607e70']]) {
    const text = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512"><title>도식 지도 · world-atlas 지리 자료, 위성사진 아님</title><rect width="1024" height="512" fill="' + ocean + '"/><path d="' + path + '" fill="' + land + '"/></svg>\n';
    writeFileSync(resolve(out, name), text);
    products.push({ output: 'demo-assets/' + name, sha256: createHash('sha256').update(text).digest('hex'), source, sourceSha256: createHash('sha256').update(bytes).digest('hex'), generator: 'demo/evidence-desk/generate-assets.mjs', license: ['AGPL-3.0-only', 'world-atlas 2.0.2 ISC / Natural Earth public-domain geometry'], meaning: 'schematic land/ocean; no satellite, terrain, bathymetry or night observation' });
  }
  writeFileSync(resolve(out, 'provenance.json'), JSON.stringify(products, null, 2) + '\n');
  return products;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) generateDemoAssets();
