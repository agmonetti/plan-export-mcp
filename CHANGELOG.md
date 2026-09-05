# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-05

### Added
- MCP Server transport via stdio exposing `export_plan` tool.
- Standalone CLI execution mode (`npx plan-export-mcp <file.md>`).
- Dual visual themes: `dark` (GitHub Dark / VS Code Dark) and `light` (GitHub Light).
- High-resolution 2x DPR full-page PNG export for chat feeds (WhatsApp, Slack).
- Print-optimized A4 PDF generation with background color and contrast preservation.
- Self-contained HTML export with embedded styles and dynamic Content Security Policy.
- Shiki code syntax highlighting with automatic dynamic language loading and diff support.
- GitHub callouts / alerts support (`[!NOTE]`, `[!WARNING]`, `[!TIP]`, `[!IMPORTANT]`, `[!CAUTION]`).
- GFM task list checklist rendering.
- Mermaid vector architecture diagram rendering.
- Automatic Chromium path discovery with fallback to local Google Chrome, Chromium, and Edge.

### Security
- Hardened input resolution against path traversal, symlink escapes, and root filesystem CWD bypasses (CRIT-01).
- Robust HTML sanitization via `sanitize-html` with strict tag, attribute, and style allowlists (CRIT-02).
- Isolated Mermaid diagram execution in `strict` security mode (CRIT-03).
- Output directory confinement enforcing relative paths within project workspace (HIGH-02).
- Denial-of-Service prevention with concurrency queue size limiting (HIGH-01).
- Network request interception in Puppeteer blocking SSRF, loopback, and local file access.
- Attack surface reduction: JavaScript disabled in headless browser for non-diagram exports (HIGH-03).
- Error message sanitization preventing sensitive filesystem and user path disclosures (HIGH-04).
- Dynamic Content Security Policy adapting script permissions based on Mermaid presence (MED-01).
