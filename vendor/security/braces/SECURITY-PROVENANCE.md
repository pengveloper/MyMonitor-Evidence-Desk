# Local braces security fork

- Upstream: `braces@3.0.3`, MIT license preserved.
- Release source commit: `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`.
- Patch: https://github.com/micromatch/braces/pull/72 at exact commit
  `28d440b5dd449dbf1fe6f3506cf94ecca4d02660` (closed, not merged when imported).
- Full upstream diff is `upstream-pr72.patch`; SHA-256:
  `4d899ebea10687a59cdedf74e96d86fbac647a75874e48ed77829aec672b8562`.
- Local version: `3.0.4-mymonitor.1`, private; **not an official npm release**.

The npm release payload is the base. The five changed runtime files and README
are copied byte-for-byte from the pinned PR head. This includes MAX_DEPTH=100,
parse/compile/expand/stringify depth guards, fractional limits, original
escapeInvalid behavior and cyclic-parent protection. No separate local parser
algorithm was introduced. The patch's upstream test changes remain in the diff;
equivalent regression cases run through each actual root/pro dependency graph.

`provenance.json` records upstream tarball, patch, local source and packed artifact
hashes. Tests compare every packed/installed source file with reviewed bytes.
Root and pro-test use the **same tarball**, with a direct local dependency and
parent-scoped `$braces` override so npm resolves relative paths from each project
correctly. A nested relative file override alone incorrectly resolved under
node_modules/micromatch on npm 11; the direct reference fixes this without an
absolute machine-specific path or a registry alias.

To repack reviewed edits: `npm pack --ignore-scripts` in this directory; update
the source/patch/tarball hashes and locks, then run the vendor regression suite
and clean Linux installs. A version change alone is never sufficient evidence.

Removal condition: an official patched release is available and passes the same
regressions and compatibility checks; replace both references together and
remove the local payload, override and receipt. No advisory waiver is used.
