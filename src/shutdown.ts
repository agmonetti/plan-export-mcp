import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { closeBrowser } from './exporter.js';

let isShuttingDown = false;

/**
 * Ensures stdout and stderr buffers are fully flushed before the process exits.
 * Avoids abrupt truncation of JSON-RPC MCP messages or error logs.
 */
export function gracefulExit(code = 0): void {
  process.exitCode = code;
  const finish = () => {
    process.exit(code);
  };

  const hasStdout = process.stdout && process.stdout.writable && !process.stdout.writableEnded;
  const hasStderr = process.stderr && process.stderr.writable && !process.stderr.writableEnded;

  if (hasStdout) {
    process.stdout.write('', () => {
      if (hasStderr) {
        process.stderr.write('', finish);
      } else {
        finish();
      }
    });
  } else if (hasStderr) {
    process.stderr.write('', finish);
  } else {
    finish();
  }
}

/**
 * Handles graceful shutdown by closing MCP server transport, headless browser instances,
 * and draining output streams.
 */
export async function performGracefulShutdown(code = 0, server?: Server): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Enforce a hard timeout so shutdown cannot hang indefinitely
  const forceTimer = setTimeout(() => {
    process.exit(code);
  }, 3000);
  if (typeof forceTimer.unref === 'function') {
    forceTimer.unref();
  }

  try {
    if (server) {
      await server.close().catch(() => {});
    }
    await closeBrowser().catch(() => {});
  } finally {
    clearTimeout(forceTimer);
    gracefulExit(code);
  }
}

/**
 * Attaches graceful termination handlers to system signals (SIGINT, SIGTERM).
 */
export function setupShutdownHandlers(server?: Server): () => void {
  const handler = () => {
    performGracefulShutdown(0, server).catch(() => {
      gracefulExit(0);
    });
  };

  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);

  return () => {
    process.removeListener('SIGINT', handler);
    process.removeListener('SIGTERM', handler);
  };
}
