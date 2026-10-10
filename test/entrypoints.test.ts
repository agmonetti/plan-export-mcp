import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectDir = process.cwd();
const entrypoint = path.join(projectDir, 'src/index.ts');

function capture(child: ChildProcess): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 1000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await closed;
  }
}

async function watchdog<T>(operation: Promise<T>, close: () => void, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          close();
          reject(new Error(`${label} timed out after 10 seconds`));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function assertProcessExited(pid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`MCP subprocess ${pid} is still running after close`);
}

describe('entry point smoke tests', () => {
  it('exports a standalone HTML artifact through the CLI without requiring dist', { timeout: 20000 }, async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-export-cli-'));
    const inputPath = path.join(tempDir, 'plan.md');
    const outputDir = path.join(tempDir, 'output');
    fs.writeFileSync(inputPath, '# CLI smoke\n\nEntry point artifact.');
    const child = spawn(process.execPath, ['--import', 'tsx/esm', entrypoint, inputPath, '--formats', 'html', '--output-dir', outputDir, '--output-name', 'cli-smoke'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const resultPromise = capture(child);

    try {
      const result = await watchdog(resultPromise, () => void stop(child), 'CLI subprocess');
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Done!/);
      assert.match(result.stdout, /cli-smoke\.html/);
      const artifact = path.join(outputDir, 'cli-smoke.html');
      assert.ok(fs.existsSync(artifact));
      assert.match(fs.readFileSync(artifact, 'utf8'), /CLI smoke/);
    } finally {
      await stop(child);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('exports HTML and returns its artifact path through MCP stdio without requiring dist', { timeout: 20000 }, async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-export-mcp-'));
    const outputDir = path.join(tempDir, 'output');
    const client = new Client({ name: 'plan-export-smoke-test', version: '1.0.0' }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx/esm', entrypoint],
      cwd: projectDir,
      stderr: 'pipe',
    });
    let pid: number | null = null;

    try {
      await watchdog((async () => {
        await client.connect(transport);
        pid = transport.pid;
        assert.ok(pid);
        const tools = await client.listTools();
        assert.ok(tools.tools.some((tool) => tool.name === 'export_plan'));
        const response = await client.callTool({
          name: 'export_plan',
          arguments: {
            input: '# MCP smoke\n\nEntry point artifact.',
            formats: ['html'],
            outputDir,
            outputName: 'mcp-smoke',
          },
        });
        assert.equal(response.isError, undefined);
        const message = response.content.find((item) => item.type === 'text');
        assert.ok(message && message.type === 'text');
        assert.match(message.text, /Plan exported successfully/);
        assert.match(message.text, /mcp-smoke\.html/);
        const artifact = path.join(outputDir, 'mcp-smoke.html');
        assert.ok(fs.existsSync(artifact));
        assert.match(fs.readFileSync(artifact, 'utf8'), /MCP smoke/);
      })(), () => {
        pid ??= transport.pid;
        void transport.close();
      }, 'MCP request');
    } finally {
      await transport.close();
      await client.close().catch(() => {});
      assert.equal(transport.pid, null, `MCP subprocess ${pid ?? ''} should be closed`);
      if (pid !== null) await assertProcessExited(pid);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
