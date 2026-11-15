# image-size legacy API security backport

This is real parser code remediation, not an audit version waiver. It retains the
published 1.2.1 callable CommonJS, Buffer, synchronous filename and callback APIs.
Metro uses both Buffer and filename; texture-compressor previously used 0.7.5's
synchronous filename API. Both consumers are tested against these same patched
bytes. No formats, map layers or image workflows are disabled.

Official image-size 2.0.3 and 2.0.4 exist. Their registry tarball integrity was
verified. The 2.0.4 compiled JXL, HEIF and ICNS parsers contain minimum-box-size
guards, but its main CJS export is an object and filesystem access moved to the
asynchronous `fromFile` export. A blanket v2 override breaks both current callers.
Their peer-owned parent chains do not permit an isolated parser-API migration.

`parser-progress.patch` applies the guards at the legacy shared boundaries:
ICNS entry header validation (including the first entry), JXL partial boxes,
HEIF size boxes, and minimum size before returning a matching BMFF box. Invalid
boxes are rejected explicitly; they are not silently skipped. The 1.2.1 HEIF
parser returns one size and has no v2-style image loop; before the patch it
accepted a zero-sized ispe box. The 0.7.5 parser did not support JXL/HEIF, but its
ICNS loop was independently reproduced under an OS-killed child process.

The original MIT LICENSE and published sources are retained. `provenance.json`
records upstream 1.2.1 and reference 2.0.4 tarball hashes/integrity, publication
time, patch digest and every packed file digest. The local prerelease suffix
identifies a changed artifact; it does not claim an upstream release. npm audit
does not validate local patched source. Required packed-byte and child-process
regressions supplement the advisory gate, as for the existing vendor forks.

Replace this fork when a published legacy-compatible release includes these
guards, or when both parents migrate to the official v2 Buffer/fromFile APIs.
Verify ordinary images, actual parent resolution and bounded malformed-input
rejection before removing it. Do not remove the existing braces/cache forks.
