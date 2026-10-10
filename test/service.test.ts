import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExportService, defaultExportService, CONFIG, ExportError, BrowserError } from '../src/index.js';

describe('ExportService Unit Tests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-export-service-'));

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
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

  it('should register and clean up shutdown handlers cleanly', async () => {
    const { setupShutdownHandlers } = await import('../src/index.js');
    const initialSigintCount = process.listenerCount('SIGINT');
    const initialSigtermCount = process.listenerCount('SIGTERM');

    const cleanup = setupShutdownHandlers();
    assert.equal(process.listenerCount('SIGINT'), initialSigintCount + 1);
    assert.equal(process.listenerCount('SIGTERM'), initialSigtermCount + 1);

    cleanup();
    assert.equal(process.listenerCount('SIGINT'), initialSigintCount);
    assert.equal(process.listenerCount('SIGTERM'), initialSigtermCount);
  });

  it('should not register SIGINT or SIGTERM listeners on exporter module import', async () => {
    const { execFileSync } = await import('node:child_process');
    const checkScript = `
      const sigintBefore = process.listenerCount('SIGINT');
      const sigtermBefore = process.listenerCount('SIGTERM');
      await import('./src/exporter.js');
      const sigintDiff = process.listenerCount('SIGINT') - sigintBefore;
      const sigtermDiff = process.listenerCount('SIGTERM') - sigtermBefore;
      if (sigintDiff !== 0 || sigtermDiff !== 0) {
        console.error(JSON.stringify({ sigintDiff, sigtermDiff }));
        process.exit(1);
      }
    `;
    const result = execFileSync(
      process.execPath,
      ['--import', 'tsx/esm', '--input-type=module', '-e', checkScript],
      { encoding: 'utf-8' }
    );
    assert.equal(result.trim(), '');
  });

  it('should share exactly one in-flight launch between concurrent getBrowser requests', async () => {
    let launchCount = 0;
    const mockBrowser = {
      connected: true,
      version: async () => '1.0',
      close: async () => {},
    };
    const mockLauncher = async () => {
      launchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return mockBrowser as any;
    };

    const service = new ExportService(CONFIG, mockLauncher as any);
    const [b1, b2] = await Promise.all([service.getBrowser(), service.getBrowser()]);

    assert.equal(launchCount, 1);
    assert.equal(b1, b2);
    assert.equal(b1, mockBrowser);
  });

  it('should close browser if launch completes after timeout to prevent orphaning Chromium', async () => {
    let closed = false;
    const mockBrowser = {
      connected: true,
      version: async () => '1.0',
      close: async () => {
        closed = true;
      },
    };

    const mockLauncher = async () => {
      await new Promise((r) => setTimeout(r, 60));
      return mockBrowser as any;
    };

    const customConfig = {
      ...CONFIG,
      timeouts: {
        ...CONFIG.timeouts,
        browserLaunchMs: 20,
      },
    };

    const service = new ExportService(customConfig, mockLauncher as any);

    await assert.rejects(
      async () => {
        await service.getBrowser();
      },
      (err: any) => {
        assert.ok(err instanceof BrowserError);
        assert.match(err.message, /Timed out/);
        return true;
      }
    );

    await new Promise((r) => setTimeout(r, 80));

    assert.equal(closed, true, 'Browser should be closed after completing past timeout');
    assert.equal(service.hasActiveBrowser(), false);
  });

  it('should preserve the newer launch cancellation callback when a cancelled launch overlaps a retry', async () => {
    const launchResolvers: Array<(browser: any) => void> = [];
    const mockLauncher = () => new Promise<any>((resolve) => launchResolvers.push(resolve));
    const service = new ExportService(CONFIG, mockLauncher as any);
    const firstLaunch = service.getBrowser();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(launchResolvers.length, 1);

    const firstClose = service.closeBrowser();
    const secondLaunch = service.getBrowser();
    await firstClose;
    await assert.rejects(firstLaunch, /cancelled by closeBrowser/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(launchResolvers.length, 2);

    await service.closeBrowser();
    await assert.rejects(secondLaunch, /cancelled by closeBrowser/);
  });

  it('should close browser if launch completes after service close to prevent orphaning Chromium', async () => {
    let closed = false;
    const mockBrowser = {
      connected: true,
      version: async () => '1.0',
      close: async () => {
        closed = true;
      },
    };

    const mockLauncher = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return mockBrowser as any;
    };

    const service = new ExportService(CONFIG, mockLauncher as any);

    const launchPromise = service.getBrowser().catch(() => {});
    await service.closeBrowser();
    await launchPromise;

    await new Promise((r) => setTimeout(r, 70));

    assert.equal(closed, true, 'Browser should be closed if launch finishes after closeBrowser');
    assert.equal(service.hasActiveBrowser(), false);
  });

  it('should export a PDF through a mock page with print options and a generated path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-export-pdf-'));
    let pdfOptions: any;
    let mediaType: string | undefined;
    let pageClosed = false;
    const mockPage = {
      setRequestInterception: async () => {},
      on: () => {},
      setDefaultTimeout: () => {},
      setJavaScriptEnabled: async () => {},
      setViewport: async () => {},
      setContent: async () => {},
      emulateMediaType: async (type: string) => { mediaType = type; },
      pdf: async (options: any) => {
        pdfOptions = options;
        fs.writeFileSync(options.path, '%PDF-mock');
      },
      close: async () => { pageClosed = true; },
    };
    const mockBrowser = {
      connected: true,
      version: async () => '1.0',
      newPage: async () => mockPage,
      close: async () => {},
    };
    const service = new ExportService(CONFIG, async () => mockBrowser as any);

    try {
      const results = await service.exportPlan({
        input: '# PDF smoke\n\nGenerated with a mock page.',
        formats: ['pdf'],
        outputDir: tempDir,
        outputName: 'pdf-smoke',
      });
      const expectedPath = path.join(tempDir, 'pdf-smoke.pdf');
      assert.deepEqual(results, [{ format: 'pdf', path: expectedPath }]);
      assert.equal(mediaType, 'print');
      assert.deepEqual(pdfOptions, {
        path: expectedPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      assert.equal(fs.readFileSync(expectedPath, 'utf8'), '%PDF-mock');
      assert.equal(pageClosed, true);
    } finally {
      await service.closeBrowser();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should retry launch after a previous launch failure', async () => {
    let attempts = 0;
    const mockBrowser = {
      connected: true,
      version: async () => '1.0',
      close: async () => {},
    };

    const mockLauncher = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Launch failure simulated');
      }
      return mockBrowser as any;
    };

    const service = new ExportService(CONFIG, mockLauncher as any);

    await assert.rejects(
      async () => {
        await service.getBrowser();
      },
      (err: any) => {
        assert.ok(err instanceof BrowserError);
        assert.match(err.message, /Launch failure simulated/);
        return true;
      }
    );

    const b = await service.getBrowser();
    assert.equal(attempts, 2);
    assert.equal(b, mockBrowser);
  });
});

