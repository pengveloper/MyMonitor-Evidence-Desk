import { geoNaturalEarth1, geoPath, geoGraticule10, geoArea } from 'd3';
import countriesRaw from '../../../public/data/countries.geojson?raw';

// Reuse the repository's geographic boundaries. No tiles, provider calls or invented routes.
const projection = geoNaturalEarth1().scale(111).translate([320, 164]);
const path = geoPath(projection);
const countries = JSON.parse(countriesRaw) as GeoJSON.FeatureCollection;
// RFC 7946 polygons use the opposite winding to d3's spherical small polygons.
// Normalize each polygon independently; otherwise the ocean becomes "land".
for (const feature of countries.features) {
  const geometry = feature.geometry;
  if (!geometry) continue;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  for (const coordinates of polygons) {
    if (geoArea({ type: 'Polygon', coordinates }) > Math.PI * 2) coordinates.forEach(ring => ring.reverse());
  }
}
export const mapPoint = (coordinates: [number, number]): [number, number] | null => projection(coordinates);
export function worldMap(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 330'); svg.setAttribute('aria-hidden', 'true');
  for (const [data, className] of [[path(geoGraticule10()), 'gb-graticule'], [path(countries), 'gb-land']] as const) {
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', data ?? ''); shape.setAttribute('class', className); svg.append(shape);
  }
  return svg;
}
