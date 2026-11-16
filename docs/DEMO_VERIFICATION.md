# Public demo verification

## Reproduce locally

Requirements: Node.js 24, npm, Python 3, and registry access for the locked install.
No owner/provider/AI keys, browser session, Codespace, or deployment account is needed.

~~~sh
npm ci
npm run verify:demo
~~~

On systems where Python 3 has a different executable name, set PYTHON to that executable. The verification command stops on any failed step. It does not publish, prepare a deployment manifest, enable workflows, start a browser, or call provider/AI APIs. Build output is dist-evidence-desk; it can be served using the existing README instructions.

Order: strict demo main + worker typecheck; scoped feedback typecheck; feedback regressions; verification-contract regressions; existing publication-provenance regression; static build (existing asset hash/license/provenance checks); actual build/typecheck coverage check. The last check also verifies the generated artifact manifest hashes.

## Exact scope

Both index.html and comparison.html load demo/evidence-desk/entry.ts. tsconfig.demo.json starts there and follows imports through preview/personal-app.ts, App, MapContainer/DeckGLMap, Evidence Desk, saved briefs, search/Research/Portfolio, transport and their dependency closure. It also includes existing ambient types and a small client-contract type assertion file. It does not select only the feedback files.

Vite reads its module aliases from tsconfig.demo.json. The single history import now uses the explicit alias, so both Vite and TypeScript resolve the existing open-outcome-not-connected.ts implementation. No history is invented or restored. child_process/loader shims and the @ alias use the same mapping.

Workers use a separate tsconfig.demo-workers.json, with explicit analysis.worker.ts and ml.worker.ts roots; neither is excluded. The shared analysis dependency graph includes browser/worker dual-use i18n and Sentry modules, so this config includes DOM and WebWorker standard libraries plus Vite globals. Each worker explicitly declares its local self as DedicatedWorkerGlobalScope (erased at build), rather than pretending its entry is a Window. This is strict type checking, not a claim that all worker functions were executed or that WebGL fault handling was tested.

strict, noUncheckedIndexedAccess, noUnusedLocals/Parameters, noFallthroughCasesInSwitch and noEmit remain inherited. Existing skipLibCheck is unchanged; dependency declarations are not re-audited. Local TypeScript is checked; existing JavaScript dependencies are consumed through their contracts and validated by the build/tests, not described as newly converted to strict TypeScript.

The existing notice collector records the real main/worker build module graphs to node_modules/.cache/demo-build-scope.json. Verification requires every local TypeScript build module to appear in its corresponding checked graph (demo-types.json). Vite's main-thread ?worker wrappers are not worker implementations: the implementations must appear in the worker graph. These reports are local generated evidence, not published site assets.

## The 12 baseline diagnostics

Collected once after normal npm ci at bffd7916d7d2cff7f33abeeb4a6765a0eec4f5d1. The original sanitized diagnostics are in verification/root-types-bffd7916.txt.

| # | Baseline diagnostic | Classification and treatment |
|---|---|---|
| 1 | App.ts:231 TS2307 dataModel | Public App graph contains a type-only operational ID dependency. Preserve the SDK branded ID via a narrow public client contract; no backend schema restored. |
| 2 | App.ts:2171 TS18046 result | Same checked App graph; missing API declaration loses claim result type. Explicit consumed response contract restores inference. |
| 3 | open-outcome-data.ts:20 TS2307 JSON | Build/TS mismatch. Vite already substituted history-not-connected, while root TS followed the original missing history JSON. Shared aliases now check the actual demo replacement. |
| 4 | api-keys.ts:80:16 TS18046 id | Public dependency graph contains dormant operational client code. Typed create result and removal of its existing any cast restore checking. |
| 5 | api-keys.ts:80:33 TS18046 name | Same create result contract. |
| 6 | api-keys.ts:80:57 TS18046 keyPrefix | Same create result contract. |
| 7 | api-keys.ts:122 TS2339 keyHash | Explicit nullable revoke result; existing optional-field handling preserved. |
| 8 | api-keys.ts:136 TS2339 keyHash | Same revoke result contract; no runtime flow change. |
| 9 | billing.ts:26 TS2307 dataModel | Public dependency graph, operational-only branch. Preserve nominal businessProGrants ID type. |
| 10 | convex-client.ts:16 TS7016 api | Existing public api.js lacked a declaration. Add the explicit frontend contract, not AnyApi/wildcard declarations. |
| 11 | convex-client.ts:503 TS7016 api | Same declaration for the existing dynamic import. |
| 12 | followed-countries.ts:54 TS2307 | Existing client includes anonymous local usage and account-only branches. Publish only the consumed response types, not the missing server implementation. |

No error file was excluded merely because it was inherited. Eleven diagnostics concern files actually reachable from the checked public App graph, even though the affected authenticated branches are not enabled in this keyless demo. One is the explicit history replacement mismatch. There are zero diagnostic files dismissed as wholly outside the demo dependency graph.

The public client contract documents the consumed shapes; it is not generated from, or validation of, a private server. Its concrete types are in src/types/public-client-contracts.ts so they are checked as source. Tiny .d.ts bridges preserve existing imports. Convex/Clerk configuration remains absent from the demo, the transport fence is unchanged, and no authentication/backend functionality is connected.

## Root vs demo vs feedback

- Root tsconfig.json retains the broad original src include and original ml.worker.ts exclusion. It is an inherited source diagnostic, not the demo verification entry. Running it still diagnoses the intentionally unshipped history JSON; do not call it a whole-repository PASS.
- typecheck:demo checks the actual public demo dependency closure and both worker implementations, with runtime-equivalent aliases.
- typecheck:feedback remains the narrower PR #1 feedback regression check.
- There are no GitHub Actions workflows in this public snapshot. Local results are not CI results.

## Runtime and publication boundary

Changes to application files are type-only (including worker self declarations and removal of API-reference casts), plus one import specifier resolved to the same existing demo history replacement. No product behavior, fixture, date, storage schema, personal setting, dependency/lockfile, security policy, or publication version is changed. Existing published source bffd7916 remains deployed. No site redeploy is needed for this verification-only PR.

Existing WebGL fault-path, physical Fold/touch, and external-user-validation limitations remain; this command does not mark them PASS.
