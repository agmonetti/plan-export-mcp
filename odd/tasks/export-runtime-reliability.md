# Export runtime reliability

Locator: `odd/tasks/export-runtime-reliability.md`
Branch: `fix/export-runtime-reliability`
Status: completed

## Objective
Fix the three highest-impact runtime defects from the repository audit without changing the documented export interface: imported modules must not take over host signals; concurrent/slow browser launches must not orphan Chromium; non-regular file input must not block the MCP server. Preserve input-path security and existing supported regular files.

## Scope and constraints
- Scope: `src/exporter.ts`, `src/index.ts`/`src/shutdown.ts` if needed, focused tests under `test/`.
- Keep one writer at a time, test-first where a deterministic RED is meaningful, and include tests in each work-unit commit.
- No remote-image policy, default-theme, Node engine, refactoring-only, or integration-smoke changes in this feature; those remain authorized follow-up work.
- Input symlink race needs a separate, carefully bounded threat-model decision; do not claim the FIFO fix closes it.
- Review workload forecast: approximately 250–350 authored changed lines across the three work units, excluding task tracking; `ask-on-risk` if the running branch exceeds ~400 lines. No push or PR authorized.

## Tasks
- [x] **ER-1 — Isolate process signal handling.** Route: delegated writer (source and tests; multi-file trigger). Removed import-time listeners, preserved explicit CLI/MCP shutdown, and added isolated import regression. RED: SIGINT/SIGTERM listener deltas 1/1; GREEN: focused 6/6; full suite 62/62; build passed; independent focused check and `git diff --check` passed. Commit: `2783c05` (`fix(runtime): keep signal handlers out of library imports`). Native assessment: medium, `reviewDue=false` (`under_budget`), deferred to the full feature slice; that slice was later approved and acknowledged under `review-f478fc396ed0ffcf`.
- [x] **ER-2 — Share and clean up browser launch.** Route: delegated writer (source and tests; multi-file trigger). An injectable launcher, shared in-flight promise, timeout/close cleanup and identity-guarded cancellation protect overlapping attempts. The initial test harness incorrectly launched real Chromium (no meaningful RED); a later focused A/B overlap regression observed RED (retry timed out instead of cancelling) and GREEN after the guard. Focused 11/11, full suite 67/67 and build passed; independent focused check and `git diff --check` passed. Commit: `9178f5c` (`fix(browser): close stale launches and share in-flight browser`). Native assessment: medium, 239 changed lines from `2783c05`, `reviewDue=false` (`under_budget`), deferred to the full feature slice; that slice was subsequently approved and acknowledged under `review-f478fc396ed0ffcf`.
- [x] **ER-3 — Reject non-regular input without hanging.** Route: delegated writer (source and tests; multi-file trigger). Non-blocking `openSync` allows `fstat` to reject FIFOs without freezing the event loop, preserving regular-file checks and descriptor cleanup. Linux child-process test observed RED (3-second timeout) and GREEN (`NOT_A_FILE`); Windows skips this regression. Focused security 36/36, full suite 68/68, build passed; independent focused verification passed. Commit: `019a390` (`fix(input): reject named pipes without blocking`). Native assessment high; exact committed range from `9178f5c` approved by four native lenses and acknowledged (`review-c75ebdf020021a2b`), authority burned. Separate symlink TOCTOU issue remains open.

## Verification and decisions
- Initial git tree clean on `main` at `bee8379`; created feature branch before source changes.
- `gentle-ai review mode status` CLI was unavailable (`command not found`); native facade status/inspect will decide any applicable review at work-unit boundaries. No review authority inferred.
- ER-1: observed worker RED/GREEN, 62 passing tests and TypeScript build; independent focused check passed. Commit `2783c05` has 63 authored diff lines against `bee8379` per native assessment. Native review outcome unknown; review not due yet.
- ER-2 incident: the aborted writer left 126 lines of mock-launch tests; the next worker timed out after 30 minutes because the existing constructor ignored their injected launcher, causing real Chromium launches. No `src/exporter.ts` edit from that attempt. No test pass claimed. Several Chromium roots are orphaned under the user process; ownership of each has not been established, so none was terminated.
- ER-2: `timeout 90s npx tsx --test test/service.test.ts` 11/11, `timeout 180s npm test` 67/67, `timeout 90s npm run build` passed; independent verifier found no new race. Commit `9178f5c`; native assessment medium, not yet due for review. Running authored commit diff from branch point: 302 lines (63 + 239); monitor ~400-line delivery threshold before next commit.
- ER-3: `timeout 90s npx tsx --test test/security.test.ts` 36/36, `timeout 180s npm test` 68/68, `timeout 90s npm run build` passed. Commit `019a390` has 40 authored lines against `9178f5c`; running branch total 342 (63 + 239 + 40) before this final task-document update.
- Native lineage `review-e01cf66e46f573b5` approved and acknowledged the exact partial tests/document target `sha256:89b8bf2b...`; this is not approval for ER-2 behavior or future changes. Native lineage `review-c75ebdf020021a2b` approved and acknowledged the ER-3 committed slice. The full 328-line feature slice from `bee8379` through `06e699d` was independently approved and acknowledged under `review-f478fc396ed0ffcf`; one non-blocking resilience warning `R4-001` at `src/exporter.ts:440` remains for later triage. Reviewer model and generic agents route to `openai-codex/gpt-6-luna` via user configuration outside this repository.
- Full task scope finished; no push, PR or merge. Reviews never authorize delivery. CLI/MCP/PDF integration smoke and Windows FIFO behavior were not verified. No known test/build failures.

## Next step
The three runtime work units are complete. Continue the remaining audit recommendations as separate reviewable work: Node engine/doc drift, remote-image contract, integration smoke, and only valuable deduplication. Resolve the separate input-path TOCTOU threat model before claiming the security boundary is fixed. Monitor the >400-line accumulated branch review budget before the next commit.
