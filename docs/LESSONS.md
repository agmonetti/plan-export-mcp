# Architectural Lessons & Technical Fallbacks (LESSONS.md)

This document tracks technical decisions, known pitfalls, edge cases, and architectural fallbacks for `plan-export-mcp`. It serves as persistent context for maintainers and AI agents working on this codebase.

---

## 1. Headless Browser Execution & Linux Sandboxing

### Context
Exporting HTML to pixel-perfect PDF and high-res PNG requires a headless Chromium instance. However, running headless Chrome in diverse developer environments (Ubuntu, WSL2, Docker, CI, macOS) frequently encounters permissions and memory errors.

### Pitfalls & Solutions
- **The Sandbox Error:** In many Linux environments (WSL, Docker, root users), Chromium fails to launch with `Running as root without --no-sandbox is not supported`.
  - **Resolution:** Chromium launch options must include:
    ```typescript
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Prevents crashes on small /dev/shm shared memory
      '--font-render-hinting=none',
    ]
    ```
- **System Chrome Fallback (ECONNRESET & Restricted Environments):**
  Relying solely on Puppeteer's automatic ~170MB browser download during `npm install` frequently fails due to connection resets, corporative firewalls, or blocked postinstall scripts.
  - **Resolution:** Implement intelligent browser path resolution:
    1. `process.env.PUPPETEER_EXECUTABLE_PATH`
    2. Cached Puppeteer Chrome binary (if present)
    3. Common system installation paths (`/usr/bin/google-chrome-stable`, `/usr/bin/google-chrome`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/Applications/Google Chrome.app/...`)
    This allows zero-friction execution when Chrome is already installed on the host machine.

---

## 2. Full-Bleed Dark Theme in Puppeteer PDFs (The White Margin Trap)

### Context
When generating PDFs in dark mode, passing margins via Puppeteer options `page.pdf({ margin: { top: '20mm', ... } })` forces Chromium's Skia engine to render the margin area as blank, unpainted white paper. The dark HTML body gets framed inside an ugly white border.

### Pitfalls & Solutions
- **Resolution:**
  1. Always set `margin: { top: '0', right: '0', bottom: '0', left: '0' }` in `page.pdf()`.
  2. Apply CSS `@page { size: A4; margin: 0; }`.
  3. Ensure both `html` and `body` have `background-color: var(--bg-color) !important; margin: 0; padding: 0;`.
  4. Handle inner printable padding via a root container: `.plan-wrapper { padding: 16mm 16mm; }`.
  This produces a flawless edge-to-edge dark document with zero white letterboxing.

---

## 3. Chromium Print Engine Pagination & The `overflow` Bug

### Context
In multi-page PDF generation, table rows get cut in half across page boundaries, code cards split in awkward places (e.g. card header on page N, code lines on page N+1), and headings get stranded alone at the bottom of pages (orphan headers).

### Pitfalls & Solutions
- **The Overflow Bug:** In Chromium's print layout engine, any element styled with `overflow: hidden` or `overflow: auto` cancels `break-inside: avoid` / `page-break-inside: avoid`.
  - **Resolution for Code Blocks:**
    ```css
    .code-card {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      overflow: visible !important;
    }
    .code-card pre.shiki {
      overflow: visible !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }
    ```
- **Table Row Slicing:** When `table` is set to `display: block` (common in responsive web tables), Chromium destroys table pagination semantics.
  - **Resolution:**
    ```css
    table {
      display: table !important;
      width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto !important;
    }
    thead {
      display: table-header-group !important; /* Repeats table header across every page */
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    ```
- **Orphan Headings:**
  ```css
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  ```

---

## 4. Universal Syntax Highlighting via Dynamic Shiki Loading

### Context
Hardcoding a fixed language list (e.g. 10 languages) causes enterprise code blocks (`java`, `properties`, `csharp`, `kotlin`, `sql`) to fall back silently to plain text with zero color highlighting.

### Pitfalls & Solutions
- **Resolution:**
  1. Shiki ships with 346 bundled grammars in `bundledLanguages`.
  2. Scan the incoming Markdown with regex `/```([a-zA-Z0-9_-]+)/g` prior to rendering.
  3. Dynamically invoke `await highlighter.loadLanguage(lang)` for any detected language.
  4. Guarantees 100% full-color syntax highlighting for any tech stack without loading 346 grammars into memory upfront.

---

## 5. Normalizing AI Agent Artifacts (Links & Badges)

### Context
Coding agents frequently output raw IDE filesystem URIs (e.g. `[OrderService.java](file:///home/user/project/backend/...)`) and uppercase action tokens (e.g. `[MODIFY]`, `[NEW]`, `[DELETE]`). In print, 120-character URLs wrap into four lines of broken text.

### Pitfalls & Solutions
- **Resolution:**
  - Strip local file links into clean file tags: `[Name](file://...)` -> `<code class="file-name">Name</code>`.
  - Transform action tags into styled badge pills: `[MODIFY]` -> `<span class="badge badge-modify">MODIFY</span>`.
  - Transform table verdict keywords (`Cumplido`, `Faltante`, `Parcial`, `Approved`) into color-coded status chips.

---

## 6. Mermaid Diagram Asynchronous Rendering

### Context
Mermaid renders vector diagrams asynchronously in the browser DOM. Taking a snapshot before the SVG layout completes results in blank containers.

### Pitfalls & Solutions
- **Resolution:**
  1. Inject Mermaid bundle locally for offline capability.
  2. Wait explicitly for SVG nodes:
     ```typescript
     await page.waitForFunction(() => {
       const diagrams = document.querySelectorAll('.mermaid');
       return diagrams.length === 0 || Array.from(diagrams).every(d => d.querySelector('svg'));
     }, { timeout: 8000 });
     ```

---

## 7. Typographic Scale & Density for Engineering Deliverables

### Context
Web typography scales (e.g. 2rem / 32px headings) cause document sprawl on A4 paper, turning an 8-page implementation plan into 21 bloated, sparse pages.

### Pitfalls & Solutions
- **Harmonious Print Scale:**
  - H1: `18pt` (title), H2: `13pt` (sections), H3: `11pt` (subsections).
  - Body text: `10pt` with `1.55` line-height.
  - Table text: `8.5pt` with `6pt 8pt` cell padding.
  - Code text: `8.5pt` with `1.5` line-height.
  This achieves optimal information density matching professional engineering audit standards.
