# Local conservative cache policy

Status: **UPSTREAM_DISPUTED_ADVISORY / MYMONITOR_DEFENSIVE_HARDENING**.

- Upstream: `http-cache-semantics@4.2.0`, BSD-2-Clause license preserved.
- Release source commit: `83810982b8f8996b101ed761548ea7e87a9132ea`.
- Local version: `4.2.1-mymonitor.1`, private; not an official npm release.
- Advisory: https://github.com/advisories/GHSA-ch52-4w7c-c8xp
- Maintainer dispute: https://github.com/kornelski/http-cache-semantics/issues/56#issuecomment-5975759591
- Advisory review: https://github.com/github/advisory-database/issues/10139
- RFC distinction: https://www.rfc-editor.org/rfc/rfc9111.html#section-7.3

The maintainer disputes the report: Set-Cookie does not itself prohibit caching
under RFC 9111, and private controls sharing, not freshness lifetime. We do not
claim an upstream-confirmed vulnerability or an exploitable MyMonitor HTTP path.
Astro's static image consumer uses storable/timeToLive rather than max-stale.

MyMonitor chooses a stricter policy: entries whose reuse is prohibited by the
existing non-storable/no-cache/Vary-star/shared-cookie-without-public-or-immutable/
shared-proxy-revalidate conditions cannot regain reuse through max-stale,
stale-while-revalidate or stale-if-error. A derived predicate is checked in request
evaluation and stale helpers/TTL, including deserialized and revalidated policies.
New cache-control/Set-Cookie/Vary fields from a matching 304 are retained even
when absent from the old response; excluded body metadata is left unchanged.
This deliberately restricts cookie and proxy-revalidate cases beyond the RFC.
Ordinary expired public responses, including max-age=0, retain stale reuse;
fresh caching, explicit public/immutable cookie opt-ins and private caches remain.

`defensive-hardening.patch` is the exact local source diff, and `provenance.json`
records its SHA-256, upstream tarball, local files and npm tarball hashes. Tests
bind installed Astro resolution to these source bytes, then exercise restricted
cases, JSON roundtrip, revalidation/error paths and legitimate cache controls.
The same fixtures previously permitted restricted max-stale reuse on 4.2.0 and
4.3.0. That observation is a failure of the chosen local invariant, not proof that
the maintainer's RFC interpretation is wrong.

Astro has a parent-scoped `$http-cache-semantics` override referencing a direct
local tarball dependency. No registry impersonation, version-only mitigation or
audit exception. Repack via `npm pack --ignore-scripts`, update provenance hashes
and lock, and rerun regressions/Linux installation before changing the payload.

Removal condition: an official release satisfies the local invariant and tests,
or an explicit reviewed policy decision replaces this stricter behavior after the
upstream dispute resolves. Advisory withdrawal alone must not silently change
our established local policy.
