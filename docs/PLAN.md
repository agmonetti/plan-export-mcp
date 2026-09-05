# PLAN: plan-export-mcp

> MCP server to transform AI agent implementation plans and architectural audits (Markdown) into professionally styled PDFs, high-resolution PNGs, and self-contained HTML files matching the visual fidelity of modern IDEs.

---

## 1. Problem & Purpose

### The Pain Point
When an AI coding agent (Cursor, Claude Code, Pi, Windsurf, Aider) audits a codebase or drafts an implementation plan, it produces rich Markdown containing code diffs, task lists, GitHub callouts (`[!NOTE]`, `[!WARNING]`), Mermaid architecture diagrams, and formatted tables.

- **In the IDE:** It looks pristine (dark theme, crisp syntax highlighting, structured visual hierarchy).
- **When Shared:** When sent to teammates, tech leads, or clients over **WhatsApp, Slack, GitHub chat, or Email**, raw Markdown breaks down. On mobile, it looks like unformatted text walls. Generic converters (`pandoc`, `markdown-pdf`) output 1990s-style plain academic white PDFs, break Mermaid diagrams, and discard the dark theme entirely.

### The Solution
A lightweight local MCP server (`plan-export-mcp`) exposing a native tool so the AI agent itself (or the developer via CLI) can export the artifact immediately into:
1. **Full-height PNG (Long Screenshot):** The ideal format for WhatsApp and Slack. Inline preview directly in the chat feed on mobile and desktop without downloading an external viewer.
2. **Styled PDF:** Clean, paginated A4 document with margins, page numbers, and proper contrast.
3. **Self-Contained HTML (Single File):** Embedded Base64 styles and fonts, zero external network dependencies, ready to email or open in any browser.

---

## 2. Scope & Design Rules

- **Themes:** Strictly **`dark`** (GitHub Dark / VS Code Dark default) and **`light`** (GitHub Light).
  - *Rule:* No endless theme sprawl. Two polished, high-contrast themes satisfy 100% of real-world use cases.
- **Syntax Highlighting:** TextMate / Shiki engine (the exact engine powering VS Code).
- **Supported GFM & Artifact Elements:**
  - Code blocks with language detection and diff highlighting (`+` / `-`).
  - GitHub Callouts / Alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`).
  - Interactive checklists (`- [ ]`, `- [x]`).
  - Clean bordered tables with comfortable padding.
  - Mermaid architecture diagrams pre-rendered to scalable vector graphics (SVG).

---

## 3. MCP Tool Specification

### Tool Name: `export_plan`

#### Input Schema:
```typescript
interface ExportPlanArgs {
  /** Relative or absolute path to a markdown file, OR raw markdown content string */
  input: string;

  /** Visual theme. Default: "dark" */
  theme?: "dark" | "light";

  /** Formats to generate. Default: ["png", "pdf"] */
  formats?: ("pdf" | "png" | "html")[];

  /** Destination directory. Default: "./exports" */
  outputDir?: string;

  /** Base filename without extension. Default: derived from input filename or "plan" */
  outputName?: string;
}
```

#### Expected Tool Response:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Plan exported successfully:\n- PNG: exports/auth-plan.png\n- PDF: exports/auth-plan.pdf"
    }
  ]
}
```

---

## 4. Technical Stack & Architecture

- **Runtime:** Node.js (>= 18) + TypeScript.
- **MCP Protocol:** `@modelcontextprotocol/sdk`.
- **Markdown Pipeline:**
  - `markdown-it` (fast, deterministic, extensible).
  - `markdown-it-task-lists` (checkboxes).
  - Lightweight plugin for GitHub Alerts / Callouts.
  - `shiki` (VS Code-grade syntax highlighting).
  - `mermaid` (SVG diagram rendering).
- **Headless Render Engine:**
  - `puppeteer` (or `playwright-core` with system Chromium detection / lightweight runner).
- **Distribution:** Executable via `npx plan-export-mcp` (stdio transport).

---

## 5. Visibility & Ecosystem Strategy (Discovery Playbook)

To ensure high visibility on GitHub, npm, and agent registries:
1. **GitHub Topics:** `mcp`, `mcp-server`, `model-context-protocol`, `claude-code`, `cursor`, `windsurf`, `markdown-to-pdf`, `agent-artifacts`, `implementation-plan`.
2. **Smithery Registry:** Root `smithery.yaml` to enable 1-click installation in Claude Desktop and Cursor via Smithery.ai.
3. **npm Publishing:** Published as `plan-export-mcp` with proper keywords (`mcp`, `modelcontextprotocol`).
4. **Community Registries:** Indexing PR to `punkpeye/awesome-mcp-servers` and automatic indexing by Glama.ai and PulseMCP bots.

---

## 6. Milestones

- [x] **Milestone 1: Docs & Foundation**
  - Translate and freeze `docs/PLAN.md` in English.
  - Create `docs/LESSONS.md` (documenting headless Chromium sandbox quirks, font rendering, Mermaid async rendering, and fallbacks).
  - Initialize project with `package.json`, `tsconfig.json`, and folder structure (`src/`).
- [x] **Milestone 2: Render Pipeline (Markdown -> Styled HTML)**
  - Implement Markdown-to-HTML parser with GFM task lists and GitHub callouts.
  - Integrate Shiki for code blocks with `dark` and `light` themes.
  - Integrate Mermaid rendering to inline SVG.
  - Produce self-contained HTML with inlined CSS and fonts.
- [x] **Milestone 3: Headless Exporter (HTML -> PDF / PNG)**
  - Integrate headless browser rendering.
  - Implement full-height PNG capture (2x DPR for crisp mobile preview).
  - Implement clean A4 PDF generation with pagination.
- [x] **Milestone 4: MCP Server Implementation**
  - Implement stdio MCP server exposing `export_plan`.
  - Validate end-to-end flow with a realistic agent plan sample.
- [x] **Milestone 5: Packaging & Open Source Launch**
  - Configure CLI `bin` entrypoint for `npx plan-export-mcp`.
  - Add `smithery.yaml`.
  - Write high-converting README with visual "Before vs. After" side-by-side comparisons and setup guides for Cursor, Claude Code, and Windsurf.
