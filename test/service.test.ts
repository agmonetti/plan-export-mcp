import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ExportService, defaultExportService, CONFIG, ExportError } from '../src/index.js';

describe('ExportService Unit Tests', () => {
  const tempDir = path.join(process.cwd(), '.tmp-service-test');

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should instantiate ExportService with default and custom configurations', () => {
    const service1 = new ExportService();
    assert.equal(service1.getActiveExports(), 0);
    assert.equal(service1.getQueueLength(), 0);
    assert.equal(service1.hasActiveBrowser(), false);

    const customConfig = {
      ...CONFIG,
      limits: {
        ...CONFIG.limits,
        maxConcurrentExports: 5,
      },
    };
    const service2 = new ExportService(customConfig);
    assert.equal(service2.getActiveExports(), 0);
    assert.equal(service2.getQueueLength(), 0);
  });

  it('should export HTML successfully using a dedicated service instance', async () => {
    const service = new ExportService();
    const results = await service.exportPlan({
      input: '# Isolated Service Test\n\nContent rendered via instance.',
      formats: ['html'],
      outputDir: tempDir,
      outputName: 'isolated-test',
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].format, 'html');
    assert.ok(fs.existsSync(results[0].path));
    const content = fs.readFileSync(results[0].path, 'utf-8');
    assert.ok(content.includes('Isolated Service Test'));
    assert.equal(service.getActiveExports(), 0);
    assert.equal(service.getQueueLength(), 0);
  });

  it('should enforce concurrency queue limits on custom configured service', async () => {
    const customConfig = {
      ...CONFIG,
      limits: {
        ...CONFIG.limits,
        maxConcurrentExports: 1,
        maxQueueSize: 0,
      },
    };
    const service = new ExportService(customConfig);

    // Simulate slot acquisition
    await service.acquireExportSlot();
    assert.equal(service.getActiveExports(), 1);

    // Second acquisition should fail immediately because maxQueueSize is 0
    await assert.rejects(
      async () => {
        await service.acquireExportSlot();
      },
      (err: any) => {
        assert.ok(err instanceof ExportError);
        assert.equal(err.code, 'CAPACITY_EXCEEDED');
        return true;
      }
    );

    // Release the acquired slot
    service.releaseExportSlot();
    assert.equal(service.getActiveExports(), 0);
  });

  it('should provide defaultExportService singleton ready to use', () => {
    assert.ok(defaultExportService instanceof ExportService);
    assert.equal(typeof defaultExportService.exportPlan, 'function');
    assert.equal(typeof defaultExportService.getBrowser, 'function');
    assert.equal(typeof defaultExportService.closeBrowser, 'function');
  });
});
