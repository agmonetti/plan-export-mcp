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
    const html = await renderMarkdownToHtml(mermaidMd, 'dark');

    assert.ok(html.includes("script-src 'unsafe-inline' https://cdn.jsdelivr.net"));
    assert.ok(html.includes('window.mermaid'));
    assert.ok(html.includes("securityLevel: 'strict'"));
    assert.ok(html.includes('class="mermaid"'));
  });
});
