# Export contracts and smoke checks

Locator: `odd/tasks/export-contracts.md`
Branch: `fix/export-contracts` (child slice 2, based on `fix/export-runtime-reliability` at `2129179`)
Tracker: local `feature/plan-export-audit` at verified default branch `main` (`bee8379`); no push or PR authorized.
Status: in progress

## Objective
Follow up the reliability fixes with accurate package/runtime requirements, honest format behavior documentation, and a small end-to-end smoke check for user entry points. Preserve network filtering and output semantics; do not silently enable remote resources.

## Scope and constraints
- EC-1: Node engine and corresponding package lock + README prerequisites; current Shiki 4 requires Node >=20. Lockfile root name/version still say `plan-export-mcp@0.1.0` while package declares `@agmonetti/plan-export-mcp@0.1.1`; align root metadata without unnecessary dependency upgrades. Prefer metadata/docs alignment over a dependency downgrade.
- EC-2: Align README theme default to the implemented light default and explain remote-image behavior: HTML can request external HTTPS images; browser-generated PNG/PDF block them; embedded data images are portable. Do not change SSRF filtering without an explicit product decision.
- EC-3: Add focused CLI/MCP/PDF smoke evidence without network access, heavy installs or unstable timing; run applicable suite/build.
- Symlink TOCTOU, remote-image policy redesign, and deduplication are separate potential follow-ups, not implicit scope expansion. No push, PR or merge.
- Delivery strategy: user selected `chain_strategy=feature-branch-chain`. This is child slice 2 stacked locally on child 1; tracker stays a local branch until the user explicitly authorizes publishing. Forecast ~180–260 authored changed lines for this slice, monitor ≤~400 per review slice. Keep behavior/tests/docs together and use English Conventional Commits.

## Tasks
- [x] **EC-1 — Align minimum Node version and lock metadata.** Route: delegated writer for package metadata, lock and README. No meaningful RED for passive metadata/docs. Structural name/version/engine assertion and `git diff --check` passed; full suite 68/68, build passed. Node 18 is no longer declared supported. Commit: `c210864` (`fix(package): align Node support and lock metadata`). Native assessment medium (46 changed lines), review not due (`under_budget`).
- [ ] **EC-2 — Clarify default theme and image behavior (in progress).** Route: inline if one small README edit; no product behavior change. Check: structural readback and existing security tests when appropriate. Commit: pending.
- [ ] **EC-3 — Add entry-point smoke coverage.** Route: delegated writer for tests and any narrowly necessary testability seam. Check: bounded CLI/MCP/PDF smoke plus full suite/build; no new Chrome leak. Commit: pending.

## Verification and decisions
- Parent slice `fix/export-runtime-reliability` has four work-unit/documentation commits, 68 passing tests and build; full 328-line parent slice was approved/acknowledged under `review-f478fc396ed0ffcf` with one informational warning `R4-001` for later triage.
- Git default `main` verified via `git remote show origin`; this branch and tracker were created locally with a clean tree.
- EC-1 writer ran the structural metadata assertion, `timeout 180s npm test` (68/68) and `timeout 90s npm run build` (passed). Parent spot-check repeated structural assertion and `git diff --check`. Lockfile changed only root metadata, not dependencies. Native assessment initially failed due to an incorrect manually supplied full commit hash; resolved it with `git rev-parse 2129179` and reran successfully against `212917927fc6f74c0e3dada02fb67af4f16d726e`. Inspect of the clean worktree requests an explicit committed base ref to start; no new review lineage or approval for EC-1.

## Next step
EC-2 is in progress; read this document before edits and record each observed check, commit, native assessment/review boundary and follow-up.
