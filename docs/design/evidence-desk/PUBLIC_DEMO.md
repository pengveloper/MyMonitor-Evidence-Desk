# MyMonitor Evidence Desk — synthetic static demo

This key-free demonstration reuses WorldMonitor's app shell, MapLibre/deck.gl,
globe and mobile map engines. MyMonitor adds the briefing/evidence reading flow,
explicit synthetic sources and frozen browser-saved briefs. LICENSE and
THIRD_PARTY_NOTICES.txt apply. No Pro entitlement is supplied.

## Run a built copy

Use any ordinary static server at the host root, for example:

    python3 -m http.server 4187 --bind 127.0.0.1 --directory dist-evidence-desk

Open http://127.0.0.1:4187/ and /comparison.html. The comparison is the same code
with Evidence Desk disabled, not a historical WorldMonitor checkout. Both use the
same synthetic evidence. Never add provider keys or point this demo at owner APIs.
MapLibre reads public OpenFreeMap tiles; the map is not fully offline. With map
network unavailable, the list, evidence and saved-brief flows remain available.
The schematic globe textures are generated from world-atlas geography, not NASA
imagery or measured terrain/night data. Browser storage is specific to each origin;
records do not automatically move between Preview, localhost and a published URL.

## Build the corresponding source candidate

Node 24 is required. In the independent source package run:

    npm ci
    npm run build:evidence-desk

This package has an explicit demo-only lifecycle/manifest. Normal npm lifecycle policy is preserved; no ignore-scripts installation is required. The
private app's inventory/blog lifecycle and production configuration are unchanged.
ASSET_PROVENANCE.json maps output files and worker/main packages to source/version,
licenses and hashes. SOURCE_MANIFEST.json records the source inputs. Byte-identical
ZIP compression metadata is a separate claim from successful source rebuild.

## Cloudflare local check (no publish)

In demo/evidence-desk/cloudflare-tools run npm ci using its pinned lockfile, then
from the source root run:

    demo/evidence-desk/cloudflare-tools/node_modules/.bin/wrangler dev --local --config demo/evidence-desk/wrangler.jsonc

The config uses root hosting, exact HTML paths and a root-only rewrite. Unknown
paths and API paths are 404; there is no production API or SPA fallback. Do not run
a deploy command before publication approval. No Cloudflare login is needed for
this local check.

## Tasks and limitations

Use PARTICIPANT_TASKS.md. The answer key is facilitator-only and is not in the web
root. The checked-in IEX/SEC historical observation artifact is excluded; the demo uses an explicit not-connected history loader. Real historical replay, owner accounts, live quotes/news and provider/AI
refresh are disconnected. A saved brief is a frozen synthetic copy, not market
history. No external participant speed/accuracy result has been measured.

## Publication status

PUBLISH_APPROVAL_PENDING. This is a candidate, not a published source offer.
Before publication: publish and verify the corresponding source, add that exact
public source link to this document and SOURCE_NOTICES.md, then publish the site.
Do not substitute the private MyMonitor URL for accessible corresponding source.
