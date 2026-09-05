import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownToHtml } from '../src/renderer.js';

describe('Markdown & HTML Renderer Tests', () => {
  it('should render basic markdown headings, lists, and bold text', async () => {
    const md = '# Architecture\n\n- Component A\n- Component B\n\n**Approved**';
    const html = await renderMarkdownToHtml(md, 'dark');

    assert.ok(html.includes('<h1>Architecture</h1>'));
    assert.ok(html.includes('<li>Component A</li>'));
    assert.ok(html.includes('<strong>Approved</strong>'));
    assert.ok(html.includes('class="plan-wrapper"'));
  });

  it('should sanitize XSS vectors and strip dangerous tags', async () => {
    const maliciousMd = `
# Attack Plan
<script>alert('xss')</script>
<iframe src="https://evil.com"></iframe>
<svg onload="evilScript()"><circle r="5"/></svg>
<img src="x" onerror="stealData()"/>
<a href="javascript:alert(1)">Click me</a>
<a href="data:text/html,<script>alert(1)</script>">Data URI</a>
<details open ontoggle="alert(1)"><summary>Open</summary></details>
`;
    const html = await renderMarkdownToHtml(maliciousMd, 'dark');

    assert.ok(!html.includes('<script>alert'), 'Should strip script tags');
    assert.ok(!html.includes('<iframe'), 'Should strip iframe tags');
    assert.ok(!html.includes('onload='), 'Should strip onload handler');
    assert.ok(!html.includes('onerror='), 'Should strip onerror handler');
    assert.ok(!html.includes('ontoggle='), 'Should strip ontoggle handler');
    assert.ok(!html.includes('javascript:'), 'Should remove javascript: protocol');
    assert.ok(!html.includes('data:text/html'), 'Should remove data: HTML uri');
  });

  it('should preserve Shiki code syntax highlighting with styles', async () => {
    const codeMd = '```typescript\nconst x: number = 42;\n```';
    const html = await renderMarkdownToHtml(codeMd, 'dark');

    assert.ok(html.includes('class="code-card"'));
    assert.ok(html.includes('<pre class="shiki github-dark"'));
    assert.ok(html.includes('<span class="line">'));
    assert.ok(html.includes('style="color:'));
  });

  it('should escape malicious HTML in code block language identifier', async () => {
    const maliciousCodeMd = '```<script>alert("lang")</script>\nconst x = 1;\n```';
    const html = await renderMarkdownToHtml(maliciousCodeMd, 'dark');

    assert.ok(!html.includes('<script>alert("lang")'), 'Should not contain raw script tag from lang');
    assert.ok(html.includes('&lt;script&gt;alert('), 'Should escape HTML in language header');
  });

  it('should render GitHub callouts with octicon SVGs', async () => {
    const calloutMd = '> [!NOTE]\n> Ensure backup is configured.\n\n> [!WARNING]\n> Service restart required.';
    const html = await renderMarkdownToHtml(calloutMd, 'dark');

    assert.ok(html.includes('markdown-alert markdown-alert-note'));
    assert.ok(html.includes('markdown-alert markdown-alert-warning'));
    assert.ok(html.includes('class="octicon"'));
  });

  it('should use script-src "none" CSP when Mermaid is not used', async () => {
    const plainMd = '# Simple Plan\nEverything is set.';
    const html = await renderMarkdownToHtml(plainMd, 'dark');

    assert.ok(html.includes("script-src 'none'"));
    assert.ok(!html.includes('window.mermaid'));
  });

  it('should inject Mermaid scripts and relax CSP only when diagrams exist', async () => {
    const mermaidMd = '```mermaid\ngraph TD\nA --> B\n```';
    const html = await renderMarkdownToHtml(mermaidMd, 'dark', { standaloneHtml: true });

    assert.ok(html.includes("script-src 'unsafe-inline' https://cdn.jsdelivr.net"));
    assert.ok(html.includes('window.mermaid'));
    assert.ok(html.includes("securityLevel: 'strict'"));
    assert.ok(html.includes('class="mermaid"'));
    assert.ok(html.includes('src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"'));
  });

  it('should neutralize interactive form inputs and force disabled checkboxes', async () => {
    const formInputMd = `
- [x] Legitimate task
<input type="password" name="pwd" value="1234">
<input type="text" name="user" value="admin">
<input type="submit" value="Phish">
`;
    const html = await renderMarkdownToHtml(formInputMd, 'dark');

    assert.ok(!html.includes('type="password"'), 'Should neutralize password input');
    assert.ok(!html.includes('type="text"'), 'Should neutralize text input');
    assert.ok(!html.includes('type="submit"'), 'Should neutralize submit input');
    assert.ok(html.includes('type="checkbox"'), 'Should preserve checkbox input');
    assert.ok(html.includes('disabled="disabled"'), 'Should enforce disabled on checkbox');
  });

  it('should sanitize dangerous CSS styles containing url() or expressions', async () => {
    const cssMd = `
<div style="background-color: url('https://evil.com/leak'); color: #ff0000;">Styled text</div>
`;
    const html = await renderMarkdownToHtml(cssMd, 'dark');

    assert.ok(!html.includes("url("), 'Should strip url() from style attributes');
    assert.ok(html.includes('color:#ff0000') || html.includes('color: #ff0000'), 'Should preserve safe hex colors');
  });
});
