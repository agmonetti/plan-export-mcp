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

## 2. Mermaid Diagram Asynchronous Rendering

### Context
Mermaid is not a static server-side Markdown transform; it calculates SVG layouts (dagre/elk) directly within a DOM environment.

### Pitfalls & Solutions
- **Premature Snapshot Bug:** If the headless browser takes a snapshot immediately after `page.setContent()`, Mermaid diagrams will render as unparsed text blocks or broken empty containers.
- **Resolution:** 
  1. Inject Mermaid JS script into the rendered HTML template.
  2. Call `mermaid.initialize({ startOnLoad: true, theme: theme === 'dark' ? 'dark' : 'default' })`.
  3. Wait explicitly in the headless page before taking a snapshot:
     ```typescript
     await page.evaluate(() => (window as any).mermaid?.run?.());
     // Wait for all .mermaid elements to contain rendered SVG elements
     await page.waitForFunction(() => {
       const nodes = document.querySelectorAll('.mermaid');
       if (nodes.length === 0) return true;
       return Array.from(nodes).every(n => n.querySelector('svg'));
     }, { timeout: 5000 }).catch(() => {/* fallback: continue if no mermaid */});
     ```

---

## 3. Dark Theme Fidelity in PDF Printing

### Context
By default, Chromium's `page.pdf()` applies `@media print` CSS rules. Browsers aggressively strip dark backgrounds in print mode to save printer ink, turning dark themes into unreadable gray/white text.

### Pitfalls & Solutions
- **Resolution:** 
  1. Must pass `printBackground: true` to Chromium's PDF options.
  2. Include CSS property on the root container:
     ```css
     * {
       -webkit-print-color-adjust: exact !important;
       print-color-adjust: exact !important;
     }
     ```
  3. Call `page.emulateMediaType('screen')` prior to generating the PDF to preserve screen contrast, padding, and dark aesthetics.

---

## 4. Crispness on Mobile Messaging (WhatsApp / Slack)

### Context
When images are uploaded to WhatsApp or Slack, their servers apply compression. A standard 1x resolution (DPR 1.0) image becomes blurry and illegible when zoomed in on a high-density mobile display (Retina/OLED).

### Pitfalls & Solutions
- **Resolution:**
  1. Set viewport `deviceScaleFactor: 2` (2x Retina rendering) for PNG exports:
     ```typescript
     await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
     ```
  2. Use full-page screenshot (`page.screenshot({ fullPage: true, type: 'png' })`).
  3. Fixed content width (e.g. `860px` centered with generous padding) guarantees that lines of code and tables do not stretch awkwardly on wide monitors, maintaining readability on mobile.

---

## 5. Cross-Platform Font Rendering

### Context
Developer fonts (like JetBrains Mono, Inter, Fira Code) may not be installed on the machine running the MCP server. Without proper fallbacks, code blocks look inconsistent or misaligned across macOS, Linux, and Windows.

### Pitfalls & Solutions
- **Resolution:**
  - Modern system font stack for body text:
    ```css
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    ```
  - Monospace font stack with zero-dependency fallback:
    ```css
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    ```
  - Code line-height set to `1.5` with explicit subpixel antialiasing:
    ```css
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    ```

---

## 6. Shiki Code Highlighting & Bundle Strategy

### Context
Shiki uses TextMate grammars and Oniguruma WASM engine. Loading all languages upfront increases cold start time and bundle weight.

### Pitfalls & Solutions
- **Resolution:**
  - Use `createHighlighter` with bundled `github-dark` and `github-light` themes.
  - Pre-load common languages for AI agent plans: `typescript`, `javascript`, `json`, `bash`, `python`, `sql`, `yaml`, `diff`, `markdown`, `html`, `css`.
  - Fallback to plain text gracefully if an unknown language is encountered, preventing crashes during export.
