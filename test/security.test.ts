import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  resolveSafeMarkdownInput,
  sanitizeBaseName,
  assertInsideDir,
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

    it('should reject path traversal attempts escaping the workspace', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('../../outside.md'),
        /Security Exception/
      );
    });

    it('should reject null bytes in path inputs', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('sample-plan.md\0/etc/passwd'),
        /Null bytes are not permitted/
      );
    });

    it('should reject disallowed file extensions', () => {
      assert.throws(
        () => resolveSafeMarkdownInput('package.json'),
        /Invalid file extension/
      );
    });

    it('should accept and load valid markdown files within workspace', () => {
      const result = resolveSafeMarkdownInput('sample-plan.md');
      assert.ok(result.content.length > 0);
      assert.ok(result.content.includes('# Agent Implementation Plan'));
      assert.equal(result.derivedName, 'sample-plan');
    });

    it('should treat plain markdown text strings as raw content', () => {
      const raw = '# Quick Note\nThis is direct text content without a file.';
      const result = resolveSafeMarkdownInput(raw);
      assert.equal(result.content, raw);
      assert.equal(result.derivedName, undefined);
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
    it('should reject absolute output directory paths', async () => {
      await assert.rejects(
        async () => {
          await exportPlan({
            input: '# Test',
            outputDir: '/tmp',
            formats: ['html'],
          });
        },
        /Absolute path "\/tmp" is not permitted/
      );
    });

    it('should reject output directory paths escaping the workspace', async () => {
      await assert.rejects(
        async () => {
          await exportPlan({
            input: '# Test',
            outputDir: '../outside-workspace',
            formats: ['html'],
          });
        },
        /escapes the project workspace/
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
});
