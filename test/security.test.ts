import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  resolveSafeMarkdownInput,
  sanitizeBaseName,
  assertInsideDir,
  isSystemOrRestrictedPath,
  resetBrowserIdleTimer,
  closeBrowser,
  exportPlan,
} from '../src/exporter.js';
import { sanitizeErrorMessage } from '../src/index.js';

describe('Security & Input Validation Tests', () => {
  describe('resolveSafeMarkdownInput', () => {
    it('should reject absolute paths to system files', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('/etc/passwd'),
        /Security Exception/
      );
    });

    it('should reject access to user credential files like .ssh or .env', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('~/.ssh/id_rsa'),
        /Security Exception/
      );
      assert.throws(
        () => resolveSafeMarkdownInput('.env'),
        /Security Exception/
      );
      assert.throws(
        () => resolveSafeMarkdownInput('./config/.env.production'),
        /Security Exception/
      );
    });

    it('should reject null bytes in path inputs', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('sample-plan.md\0/etc/passwd'),
        /Null bytes are not permitted/
      );
    });

    it('should reject disallowed file extensions for existing files', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('package.json'),
        /Invalid file extension/
      );
    });

    it('should throw File not found for nonexistent .md files', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('definitely-nonexistent-file.md'),
        /File not found/
      );
    });

    it('should accept and load valid markdown files within workspace (relative and absolute)', () => {
      const relResult = resolveSafeMarkdownInput('sample-plan.md');
      assert.ok(relResult.content.length > 0);
      assert.ok(relResult.content.includes('# Agent Implementation Plan'));
      assert.equal(relResult.derivedName, 'sample-plan');

      const absPath = path.resolve('sample-plan.md');
      const absResult = resolveSafeMarkdownInput(absPath);
      assert.ok(absResult.content.length > 0);
      assert.equal(absResult.derivedName, 'sample-plan');
    });

    it('should treat plain markdown text strings as raw content', () => {
      const raw = '# Quick Note\nThis is direct text content without a file.';
      const result = resolveSafeMarkdownInput(raw);
      assert.equal(result.content, raw);
      assert.equal(result.derivedName, undefined);
    });

    it('should treat single-line markdown text with slashes as raw content instead of crashing as file', () => {
      const raw = '# Plan: Migration auth/billing to v2.0';
      const result = resolveSafeMarkdownInput(raw);
      assert.equal(result.content, raw);
      assert.equal(result.derivedName, undefined);
    });
  });

  describe('isSystemOrRestrictedPath', () => {
    it('should detect Unix system directories', () => {
      assert.equal(isSystemOrRestrictedPath('/etc'), true);
      assert.equal(isSystemOrRestrictedPath('/etc/shadow'), true);
      assert.equal(isSystemOrRestrictedPath('/proc/cpuinfo'), true);
      assert.equal(isSystemOrRestrictedPath('/sys/class'), true);
      assert.equal(isSystemOrRestrictedPath('/root/.bashrc'), true);
    });

    it('should detect credential directories and files', () => {
      assert.equal(isSystemOrRestrictedPath('~/.ssh/id_rsa'), true);
      assert.equal(isSystemOrRestrictedPath('/home/user/.aws/credentials'), true);
      assert.equal(isSystemOrRestrictedPath('/home/user/project/.env'), true);
      assert.equal(isSystemOrRestrictedPath('/home/user/project/.env.local'), true);
    });

    it('should allow normal workspace files and directories', () => {
      assert.equal(isSystemOrRestrictedPath('./exports'), false);
      assert.equal(isSystemOrRestrictedPath('/home/user/projects/my-app/docs/plan.md'), false);
    });
  });

  describe('sanitizeBaseName', () => {
    it('should sanitize dangerous filesystem characters', () => {
      assert.equal(sanitizeBaseName('../../../malicious/name'), 'name');
      assert.equal(sanitizeBaseName('malicious<>:"|?*file'), 'malicious_file');
    });

    it('should fallback to default pattern if sanitized name is empty', () => {
      const fallback = sanitizeBaseName('////:::***');
      assert.match(fallback, /^plan-\d+$/);
    });
  });

  describe('assertInsideDir', () => {
    it('should allow files inside the target directory', () => {
      assert.doesNotThrow(() => {
        assertInsideDir(path.resolve('./exports/file.html'), path.resolve('./exports'));
      });
    });

    it('should throw when a file escapes the target directory', () => {
      assert.throws(() => {
        assertInsideDir(path.resolve('./exports/../secret.txt'), path.resolve('./exports'));
      }, /attempts to escape/);
    });
  });

  describe('outputDir validation in exportPlan', () => {
    it('should reject output directory paths pointing to system directories', async () => {
      await assert.rejects(
        async () => {
          await exportPlan({
            input: '# Test',
            outputDir: '/etc/exports',
            formats: ['html'],
          });
        },
        /Security Exception/
      );
    });

    it('should reject output directory paths pointing to credential folders', async () => {
      await assert.rejects(
        async () => {
          await exportPlan({
            input: '# Test',
            outputDir: '~/.ssh',
            formats: ['html'],
          });
        },
        /Security Exception/
      );
    });

    it('should reject null bytes in outputDir', async () => {
      await assert.rejects(
        async () => {
          await exportPlan({
            input: '# Test',
            outputDir: 'exports\0evil',
            formats: ['html'],
          });
        },
        /Null bytes are not permitted/
      );
    });

    it('should allow safe relative and absolute output directories', async () => {
      const absOutputDir = path.resolve('./exports');
      const results = await exportPlan({
        input: '# Test Safe Output',
        outputDir: absOutputDir,
        outputName: 'test-safe-output',
        formats: ['html'],
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].format, 'html');
      assert.ok(results[0].path.endsWith('test-safe-output.html'));
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact current working directory from error messages', () => {
      const cwd = process.cwd();
      const err = new Error(`File access failed at ${cwd}/private/secret.txt`);
      const sanitized = sanitizeErrorMessage(err);
      assert.ok(!sanitized.includes(cwd));
      assert.ok(sanitized.includes('./private/secret.txt'));
    });

    it('should redact user home directories', () => {
      const err = new Error('Failed to open /home/john_doe/.ssh/id_rsa');
      const sanitized = sanitizeErrorMessage(err);
      assert.ok(!sanitized.includes('john_doe'));
      assert.ok(sanitized.includes('/home/[user]/.ssh/id_rsa'));
    });
  });

  describe('Browser Idle Reaper & Lifecycle', () => {
    it('should configure and reset idle timer without throwing', () => {
      assert.doesNotThrow(() => {
        resetBrowserIdleTimer();
      });
    });
  });

  after(async () => {
    await closeBrowser();
    // Clean up temporary test artifacts created in ./exports
    const exportDir = path.resolve('./exports');
    if (fs.existsSync(exportDir)) {
      try {
        const files = fs.readdirSync(exportDir);
        for (const f of files) {
          try {
            fs.unlinkSync(path.join(exportDir, f));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  });
});
