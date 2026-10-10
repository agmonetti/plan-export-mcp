# Export runtime reliability

Locator: `odd/tasks/export-runtime-reliability.md`
Branch: `fix/export-runtime-reliability`
Status: in progress

## Objective
Fix the three highest-impact runtime defects from the repository audit without changing the documented export interface: imported modules must not take over host signals; concurrent/slow browser launches must not orphan Chromium; non-regular file input must not block the MCP server. Preserve input-path security and existing supported regular files.

## Scope and constraints
- Scope: `src/exporter.ts`, `src/index.ts`/`src/shutdown.ts` if needed, focused tests under `test/`.
- Keep one writer at a time, test-first where a deterministic RED is meaningful, and include tests in each work-unit commit.
- No remote-image policy, default-theme, Node engine, refactoring-only, or integration-smoke changes in this feature; those remain authorized follow-up work.
- Input symlink race needs a separate, carefully bounded threat-model decision; do not claim the FIFO fix closes it.
- Review workload forecast: approximately 250–350 authored changed lines across the three work units, excluding task tracking; `ask-on-risk` if the running branch exceeds ~400 lines. No push or PR authorized.

## Tasks
- [x] **ER-1 — Isolate process signal handling.** Route: delegated writer (source and tests; multi-file trigger). Removed import-time listeners, preserved explicit CLI/MCP shutdown, and added isolated import regression. RED: SIGINT/SIGTERM listener deltas 1/1; GREEN: focused 6/6; full suite 62/62; build passed; independent focused check and `git diff --check` passed. Commit: `2783c05` (`fix(runtime): keep signal handlers out of library imports`). Native assessment: medium, `reviewDue=false` (`under_budget`), deferred to PR slice; no native approval claimed.
- [ ] **ER-2 — Share and clean up browser launch (in progress).** Route: delegated writer (source and tests; multi-file trigger). Ensure concurrent exports share one launch, and a timed-out launch cannot leave an unmanaged browser. Existing uncommitted tests pass a mock launcher as constructor argument, but the current constructor ignores it; the attempted RED used real Chrome and hung for 30 minutes. The injectable seam and primary fix are implemented: focused 10/10, full suite 66/66, build pass. Independent verification found a remaining A/B overlap: old launch A's catch/finally clears new launch B's cancel callback, so `closeBrowser()` cannot promptly reject B. Add a focused overlap regression, guard cleanup by promise identity, rerun bounded checks before commit. Commit: pending.
- [ ] **ER-3 — Reject non-regular input without hanging.** Route: delegated writer (source and tests; multi-file trigger). Preserve path and extension validation; open FIFOs non-blocking and reject them, with a regression test suitable for Linux/Windows differences. Check: focused security test; full suite/build before commit. Commit: pending.

## Verification and decisions
- Initial git tree clean on `main` at `bee8379`; created feature branch before source changes.
- `gentle-ai review mode status` CLI was unavailable (`command not found`); native facade status/inspect will decide any applicable review at work-unit boundaries. No review authority inferred.
- ER-1: observed worker RED/GREEN, 62 passing tests and TypeScript build; independent focused check passed. Commit `2783c05` has 63 authored diff lines against `bee8379` per native assessment. Native review outcome unknown; review not due yet.
- ER-2 incident: the aborted writer left 126 lines of mock-launch tests; the next worker timed out after 30 minutes because the existing constructor ignored their injected launcher, causing real Chromium launches. No `src/exporter.ts` edit from that attempt. No test pass claimed. Several Chromium roots are orphaned under the user process; ownership of each has not been established, so none was terminated.
- ER-2 current check: `timeout 90s npx tsx --test test/service.test.ts` 10/10, `timeout 180s npm test` 66/66, `timeout 90s npm run build` pass; independent verifier reproduced the stale A cleanup/B cancellation race by code trace. ER-2 is not done.
- Native lineage `review-e01cf66e46f573b5` approved and acknowledged the exact partial tests/document target `sha256:89b8bf2b...`; this is not approval for ER-2 behavior or future changes. Reviewer model and generic agents now route to `openai-codex/gpt-6-luna` via user configuration outside this repository.

## Next step
ER-2 remains in progress. Dispatch one Luna writer for the A/B overlap regression and correction, then verify and commit if green. Keep the work-unit commit independent and record checks, assessment and review boundary.
