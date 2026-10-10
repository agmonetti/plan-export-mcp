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
- [ ] **ER-1 — Isolate process signal handling (in progress).** Route: delegated writer (source and tests; multi-file trigger). Remove import-time signal listeners, keep CLI/MCP shutdown handling, test that module import adds no process listeners. Check: focused service test; full suite/build before commit. Commit: pending.
- [ ] **ER-2 — Share and clean up browser launch.** Route: delegated writer (source and tests; multi-file trigger). Ensure concurrent exports share one launch, and a timed-out launch cannot leave an unmanaged browser; test both paths with a deterministic seam where practical. Check: focused service test; full suite/build before commit. Commit: pending.
- [ ] **ER-3 — Reject non-regular input without hanging.** Route: delegated writer (source and tests; multi-file trigger). Preserve path and extension validation; open FIFOs non-blocking and reject them, with a regression test suitable for Linux/Windows differences. Check: focused security test; full suite/build before commit. Commit: pending.

## Verification and decisions
- Initial git tree clean on `main` at `bee8379`; created feature branch before source changes.
- `gentle-ai review mode status` CLI was unavailable (`command not found`); native facade status/inspect will decide any applicable review at work-unit boundaries. No review authority inferred.
- Prior audit: 61 tests and TypeScript build passed; no new task check has been run yet.

## Next step
ER-1 is in progress. Start its bounded writer; read this document before edits. Record observed RED/GREEN, checks, commit identity and running diff lines, then update this document and Engram mirror.
