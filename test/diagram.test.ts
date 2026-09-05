import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  renderDiagramToHtml,
  renderDiagram,
  closeBrowser,
  ExportError,
  SecurityError,
} from '../src/index.js';

describe('Diagram Renderer & render_diagram Tool Tests', () => {
  const tempDir = path.join(process.cwd(), '.tmp-diagram-test');

  after(async () => {
    await closeBrowser();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('renderDiagramToHtml', () => {
    it('should generate valid standalone HTML with Mermaid bundle and CSP', () => {
      const diagram = 'graph TD\n  A[Start] --> B[Finish]';
      const html = renderDiagramToHtml(diagram, 'dark');

      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Content-Security-Policy'));
      assert.ok(html.includes('class="mermaid"'));
      assert.ok(html.includes('A[Start] --&gt; B[Finish]'));
      assert.ok(html.includes('darkMode: true'));
      assert.ok(html.includes('#0d1117'));
    });

    it('should escape malicious HTML in diagram definition', () => {
      const xssDiagram = 'graph TD\n  A["<script>alert(1)</script>"] --> B';
      const html = renderDiagramToHtml(xssDiagram, 'light');

      assert.ok(!html.includes('<script>alert(1)</script>'));
      assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert.ok(html.includes('darkMode: false'));
    });
  });

  describe('renderDiagram validation', () => {
    it('should reject empty or whitespace-only diagram inputs', async () => {
      await assert.rejects(
        async () => {
          await renderDiagram({ diagram: '   ' });
        },
        (err: any) => {
          assert.ok(err instanceof ExportError);
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('should reject null bytes in diagram content', async () => {
      await assert.rejects(
        async () => {
          await renderDiagram({ diagram: 'graph TD\0A-->B' });
        },
        (err: any) => {
          assert.ok(err instanceof SecurityError);
          assert.equal(err.code, 'NULL_BYTE');
          return true;
        }
      );
    });

    it('should reject restricted system paths in outputDir', async () => {
      await assert.rejects(
        async () => {
          await renderDiagram({
            diagram: 'graph TD\nA-->B',
            outputDir: '/etc',
          });
        },
        (err: any) => {
          assert.ok(err instanceof SecurityError);
          assert.equal(err.code, 'RESTRICTED_PATH');
          return true;
        }
      );
    });
  });

  describe('renderDiagram execution (Browser)', () => {
    it('should render a diagram to SVG and return svgContent', async () => {
      const result = await renderDiagram({
        diagram: 'graph TD\n  Start --> Done',
        theme: 'dark',
        format: 'svg',
        outputDir: tempDir,
        outputName: 'test-flowchart',
      });

      assert.equal(result.format, 'svg');
      assert.ok(fs.existsSync(result.path));
      assert.ok(result.path.endsWith('.svg'));
      assert.ok(result.svgContent);
      assert.ok(result.svgContent.includes('<svg'));
      assert.ok(result.svgContent.includes('Done'));
    });

    it('should render a diagram to PNG and return base64 preview data', async () => {
      const result = await renderDiagram({
        diagram: 'sequenceDiagram\n  autonumber\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
        theme: 'dark',
        format: 'png',
        outputDir: tempDir,
        outputName: 'test-sequence',
        includeBase64: true,
      });

      assert.equal(result.format, 'png');
      assert.ok(fs.existsSync(result.path));
      assert.ok(result.path.endsWith('.png'));
      const stat = fs.statSync(result.path);
      assert.ok(stat.size > 100);
      assert.ok(result.base64);
      assert.ok(result.base64.length > 100);
    });

    it('should throw typed MERMAID_SYNTAX_ERROR on broken diagram syntax', async () => {
      await assert.rejects(
        async () => {
          await renderDiagram({
            diagram: 'graph INVALID_SYNTAX -->> ??? !!!',
            format: 'png',
            outputDir: tempDir,
          });
        },
        (err: any) => {
          assert.ok(err instanceof ExportError);
          assert.equal(err.code, 'MERMAID_SYNTAX_ERROR');
          return true;
        }
      );
    });
  });
});
