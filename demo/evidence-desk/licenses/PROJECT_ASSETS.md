# Existing project assets

The explicit asset list retains the existing WorldMonitor/MyMonitor country geometry,
boundary overrides, OpenFreeMap styles and project icons. The upstream project
copyright/license notices and AGPL-3.0-only source license are retained in LICENSE.
These are source-controlled project inputs, not fetched owner/provider data.
OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains on the map.

countries-110m.json and countries-50m.json are byte-identical to world-atlas 2.0.2.
The exact registry metadata, tarball integrity and file SHA256 values are preserved
in demo/evidence-desk/upstream-provenance.json. The world-atlas ISC notice is
included separately; its Natural Earth source geography is public domain.

The demo RTL output is the exact official @mapbox/mapbox-gl-rtl-text 0.3.0
package/dist/mapbox-gl-rtl-text.js, served at the existing local plugin path.
The private repository's differently built RTL copy is not used in this artifact.
Its Mapbox and ICU copyright/permission text is included in full.

Generated land/ocean SVG textures come solely from the pinned world-atlas geometry
and the included generate-assets.mjs. They are schematic maps, not satellite
photographs, terrain/bathymetry or night observations. Original uncertain Earth/day/
water/sky images are excluded from both source export and artifact. The globe engine,
camera, layers and marker handling are unchanged; its existing plain background is
retained without a sky texture.
