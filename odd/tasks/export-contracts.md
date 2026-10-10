# Export contracts and smoke checks

Locator: `odd/tasks/export-contracts.md`
Branch: `fix/export-contracts` (child slice 2, based on `fix/export-runtime-reliability` at `2129179`)
Tracker: local `feature/plan-export-audit` at verified default branch `main` (`bee8379`); no push or PR authorized.
Status: completed

## Objective
Follow up the reliability fixes with accurate package/runtime requirements, honest format behavior documentation, and a small end-to-end smoke check for user entry points. Preserve network filtering and output semantics; do not silently enable remote resources.

## Scope and constraints
- EC-1: Node engine and corresponding package lock + README prerequisites; current Shiki 4 requires Node >=20. Initial lockfile root name/version said `plan-export-mcp@0.1.0` while package declared `@agmonetti/plan-export-mcp@0.1.1`; align root metadata without unnecessary dependency upgrades. Prefer metadata/docs alignment over a dependency downgrade.
- EC-2: Align README theme default to the implemented light default and explain remote-image behavior: HTML can request external HTTPS images; browser-generated PNG/PDF block them; embedded data images are portable. Do not change SSRF filtering without an explicit product decision.
- EC-3: Add focused CLI/MCP/PDF smoke evidence without network access, heavy installs or unstable timing; run applicable suite/build.
- Symlink TOCTOU, remote-image policy redesign, and deduplication are separate potential follow-ups, not implicit scope expansion. No push, PR or merge.
- Delivery strategy: user selected `chain_strategy=feature-branch-chain`. This is child slice 2 stacked locally on child 1; tracker stays a local branch until the user explicitly authorizes publishing. Forecast ~180–260 authored changed lines for this slice, monitor ≤~400 per review slice. Keep behavior/tests/docs together and use English Conventional Commits.

## Tasks
- [x] **EC-1 — Align minimum Node version and lock metadata.** Route: delegated writer for package metadata, lock and README. No meaningful RED for passive metadata/docs. Structural name/version/engine assertion and `git diff --check` passed; full suite 68/68, build passed. Node 18 is no longer declared supported. Commit: `c210864` (`fix(package): align Node support and lock metadata`). Native assessment medium (46 changed lines), review not due (`under_budget`).
- [x] **EC-2 — Clarify default theme and image behavior.** Route: inline README correction. Documented actual light default, external HTTPS image behavior and Mermaid CDN requirement in standalone HTML, PNG/PDF image blocking and `data:` portability. No runtime behavior changed; README diff readback and `git diff --check` passed. Commit: `75742e7` (`docs(export): clarify theme and external assets`).
- [x] **EC-3 — Add entry-point smoke coverage.** Route: delegated writer for CLI/MCP HTML subprocess tests and mock-page PDF contract; independent verifier found and confirmed fixes for bounded cleanup/PID checks and a pre-existing fixed temp-dir deletion risk. No meaningful RED: existing behavior met the new coverage contract. Focused 14/14, full suite 71/71, build and `git diff --check` passed. A separately bounded real PDF smoke confirmed `%PDF-`, browser PID exit and temp cleanup. Commit: `e0067bb` (`test(export): cover CLI MCP and PDF output paths`).

## Verification and decisions
- Parent slice `fix/export-runtime-reliability` has four work-unit/documentation commits, 68 passing tests and build; full 328-line parent slice was approved/acknowledged under `review-f478fc396ed0ffcf` with one informational warning `R4-001` for later triage.
- Git default `main` verified via `git remote show origin`; this branch and tracker were created locally with a clean tree.
- EC-1 writer ran the structural metadata assertion, `timeout 180s npm test` (68/68) and `timeout 90s npm run build` (passed). Parent spot-check repeated structural assertion and `git diff --check`. Lockfile changed only root metadata, not dependencies. Native assessment initially failed due to an incorrect manually supplied full commit hash; resolved it with `git rev-parse 2129179` and reran successfully against `212917927fc6f74c0e3dada02fb67af4f16d726e`. Inspect of the clean worktree requests an explicit committed base ref to start; no new review lineage or approval for EC-1.
- EC-2 was passive documentation, so no meaningful RED or new runtime suite was needed; reviewed renderer CSP/CDN and browser URL filtering before documenting behavior. No native review started for the passive documentation-only commit.
- EC-3 independent verification: initial focused 14/14; separate one-off real Chromium PDF smoke checked `%PDF-`, browser PID `206760` gone after close and temp cleanup. Final bounded `timeout 90s npx tsx --test test/entrypoints.test.ts test/service.test.ts` 14/14, `timeout 180s npm test` 71/71, `timeout 90s npm run build` passed, `git diff --cached --check` clean. New automated PDF test mocks the page and does not assert rendered text or PDF semantics; real smoke checked only magic bytes. Existing older Chrome processes were not terminated. The installed subagent list has no architect; a read-only verifier performed the completion risk check, found fixed temp-directory deletion, and the final verifier confirmed its repair.
- Second child slice `2129179..55f7f60`: 240 additions and 13 deletions (253 diff lines), below the ~400-line slice budget. Native medium-tier review of that exact committed slice was approved and acknowledged under `review-c30540f36e803711`; authority consumed, with no correction required. Subsequent documentation-only updates are not part of that frozen candidate. No push, PR or merge.
- Follow-up product decision: trusted local input paths remain supported, including symlinks to permitted targets; concurrent hostile filesystem mutation is out of scope. `b196950` (`docs(security): state trusted local path assumption`) documents the limitation in README without changing input behavior. This does not fix symlink TOCTOU for untrusted writable directories.

## Next step
The contract/smoke slice is complete and its committed candidate was approved and acknowledged; review does not authorize publishing. The input-path threat model is decided and documented. Decide whether offline remote-asset parity is a product requirement before changing that behavior; security hardening for hostile concurrent local mutation would be a separate feature.
