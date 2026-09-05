import puppeteer, { type Browser } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { renderMarkdownToHtml } from './renderer.js';
import type { ExportPlanOptions, ExportResult, Theme, ExportFormat } from './types.js';

let sharedBrowser: Browser | null = null;

const COMMON_CHROME_PATHS: string[] = [
  // Linux
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

import os from 'os';

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_INPUT_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);

export function expandHome(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  if (filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function isSystemOrRestrictedPath(targetPath: string): boolean {
  const expanded = expandHome(targetPath);
  const normalized = path.normalize(path.resolve(expanded));
  const lower = normalized.toLowerCase();

  const parsed = path.parse(normalized);
  if (normalized === parsed.root) {
    return true;
  }

  // Linux / Unix system paths
  const unixSystemPrefixes = ['/etc', '/proc', '/sys', '/dev', '/boot', '/root', '/run', '/var/run'];
  for (const prefix of unixSystemPrefixes) {
    if (lower === prefix || lower.startsWith(prefix + '/')) {
      return true;
    }
  }

  // Windows system paths
  const winSystemPrefixes = ['c:\\windows', 'c:\\programdata'];
  for (const prefix of winSystemPrefixes) {
    if (lower === prefix || lower.startsWith(prefix + '\\')) {
      return true;
    }
  }

  // Sensitive user credential directories and files
  const parts = lower.split(/[/\\]/);
  const sensitiveSegments = new Set([
    '.ssh',
    '.aws',
    '.gnupg',
    '.kube',
    '.docker',
    '.netrc',
    '.npmrc',
    '.pypirc',
  ]);
  for (const part of parts) {
    if (sensitiveSegments.has(part)) {
      return true;
    }
    if (part === '.env' || part.startsWith('.env.')) {
      return true;
    }
    if (part === 'id_rsa' || part === 'id_ed25519' || part === 'id_ecdsa' || part === 'id_dsa') {
      return true;
    }
  }

  return false;
}

export function resolveSafeMarkdownInput(input: string): { content: string; derivedName?: string } {
  // If input contains newlines, it is definitely raw markdown content, not a filesystem path
  if (typeof input === 'string' && input.includes('\n')) {
    if (Buffer.byteLength(input, 'utf-8') > MAX_INPUT_BYTES) {
      throw new Error(`Markdown input exceeds maximum allowed size of 10MB.`);
    }
    return { content: input };
  }

  if (typeof input === 'string' && input.length < 4096) {
    const trimmed = input.trim();
    if (trimmed.includes('\0')) {
      throw new Error('Security Exception: Null bytes are not permitted in path input.');
    }

    const ext = path.extname(trimmed).toLowerCase();
    const isExplicitFileExt = ALLOWED_INPUT_EXTENSIONS.has(ext);

    const cwd = path.resolve(process.cwd());
    const expanded = expandHome(trimmed);
    const candidatePath = path.isAbsolute(expanded)
      ? path.normalize(expanded)
      : path.resolve(cwd, expanded);

    const hasPathIndicator =
      trimmed.startsWith('~') ||
      trimmed.startsWith('.') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('\\') ||
      /^[a-zA-Z]:[/\\]/.test(trimmed) ||
      isExplicitFileExt;

    // Eagerly reject any attempt to target restricted system or credential paths
    if (isSystemOrRestrictedPath(candidatePath) && hasPathIndicator) {
      throw new Error(
        `Security Exception: Access denied. Cannot access restricted system or credential path: "${trimmed}".`
      );
    }

    let realPath: string | null = null;
    try {
      realPath = fs.realpathSync(candidatePath);
    } catch {
      // Path does not exist
      if (isExplicitFileExt) {
        throw new Error(`File not found: "${trimmed}".`);
      }
    }

    if (realPath !== null) {
      // Eagerly verify resolved real path is not a restricted system or credential path
      if (isSystemOrRestrictedPath(realPath)) {
        throw new Error(
          `Security Exception: Access denied. Target file or symlink resolves to a restricted path.`
        );
      }

      let fd: number | null = null;
      try {
        // Open file descriptor atomically to eliminate TOCTOU symlink races
        fd = fs.openSync(realPath, 'r');
        const stat = fs.fstatSync(fd);

        if (!stat.isFile()) {
          throw new Error(`Invalid input: Path is not a regular file: "${trimmed}".`);
        }

        const fileExt = path.extname(realPath).toLowerCase();
        if (!ALLOWED_INPUT_EXTENSIONS.has(fileExt)) {
          throw new Error(
            `Security Exception: Invalid file extension "${fileExt}". Only Markdown and text files (.md, .markdown, .txt) are permitted.`
          );
        }

        if (stat.size > MAX_INPUT_BYTES) {
          throw new Error(`Input file exceeds maximum allowed size of 10MB: "${trimmed}".`);
        }

        // Read content directly from open file descriptor
        const buffer = Buffer.alloc(stat.size);
        let bytesRead = 0;
        while (bytesRead < stat.size) {
          const chunk = fs.readSync(fd, buffer, bytesRead, stat.size - bytesRead, bytesRead);
          if (chunk === 0) break;
          bytesRead += chunk;
        }

        return {
          content: buffer.subarray(0, bytesRead).toString('utf-8'),
          derivedName: path.basename(candidatePath, path.extname(candidatePath)),
        };
      } finally {
        if (fd !== null) {
          try {
            fs.closeSync(fd);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  if (Buffer.byteLength(input, 'utf-8') > MAX_INPUT_BYTES) {
    throw new Error(`Markdown input exceeds maximum allowed size of 10MB.`);
  }

  return { content: input };
}

export function sanitizeBaseName(rawName: string): string {
  const base = path.basename(rawName).trim();
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return sanitized.replace(/^_+|_+$/g, '') || `plan-${Date.now()}`;
}

export function assertInsideDir(filePath: string, targetDir: string): void {
  const resolvedTarget = path.resolve(targetDir);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedTarget, resolvedFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || resolvedFile === resolvedTarget) {
    throw new Error(`Security Exception: Target path "${filePath}" attempts to escape output directory "${targetDir}".`);
  }
}

export function resolveExecutablePath(): string | undefined {
  // 1. Explicit user-configured environment variable takes precedence
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Puppeteer's own managed headless shell / cache
  try {
    const puppeteerPath = puppeteer.executablePath();
    if (fs.existsSync(puppeteerPath)) {
      return puppeteerPath;
    }
  } catch {
    // continue
  }

  // 3. System Chromium / Chrome / Edge fallback if available on the host
  for (const p of COMMON_CHROME_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return undefined;
}

const OPERATION_TIMEOUT_MS = 15000;
const MERMAID_TIMEOUT_MS = 6000;
const BROWSER_LAUNCH_TIMEOUT_MS = 15000;
const BROWSER_IDLE_TIMEOUT_MS = 60000; // Auto-close Chromium after 60s idle to free RAM

// Concurrency control: limit simultaneous browser export tasks to prevent RAM exhaustion
const MAX_CONCURRENT_EXPORTS = 2;
const MAX_QUEUE_SIZE = 20;
let activeExports = 0;
const waitQueue: Array<() => void> = [];
let browserIdleTimer: NodeJS.Timeout | null = null;

export function resetBrowserIdleTimer(): void {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }
  if (sharedBrowser && activeExports === 0) {
    browserIdleTimer = setTimeout(() => {
      if (activeExports === 0 && sharedBrowser) {
        closeBrowser().catch(() => {});
      }
    }, BROWSER_IDLE_TIMEOUT_MS);
    if (browserIdleTimer && typeof browserIdleTimer.unref === 'function') {
      browserIdleTimer.unref();
    }
  }
}

async function acquireExportSlot(): Promise<void> {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }
  if (activeExports < MAX_CONCURRENT_EXPORTS) {
    activeExports++;
    return;
  }
  if (waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error(
      'Export capacity exceeded: Concurrency queue is full (max 20 pending requests). Please retry shortly.'
    );
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeExports++;
      resolve();
    });
  });
}

function releaseExportSlot(): void {
  activeExports--;
  if (waitQueue.length > 0 && activeExports < MAX_CONCURRENT_EXPORTS) {
    const next = waitQueue.shift();
    if (next) next();
  } else if (activeExports === 0) {
    resetBrowserIdleTimer();
  }
}

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) {
    try {
      // Proactive health check to ensure browser process is responsive and not crashed
      await sharedBrowser.version();
      return sharedBrowser;
    } catch {
      // Browser disconnected or crashed; reset reference and re-launch
      sharedBrowser = null;
    }
  }

  const executablePath = resolveExecutablePath();

  try {
    const launchPromise = puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--font-render-hinting=none',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-extensions',
      ],
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`Timed out after ${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s attempting to launch headless browser.`));
      }, BROWSER_LAUNCH_TIMEOUT_MS);
      if (typeof t.unref === 'function') t.unref();
    });

    sharedBrowser = await Promise.race([launchPromise, timeoutPromise]);
    resetBrowserIdleTimer();
    return sharedBrowser;
  } catch (err: any) {
    throw new Error(
      `Failed to launch headless browser for PDF/PNG export. ` +
      `HTML exports remain available without a browser. ` +
      `To enable PDF/PNG, run "npx puppeteer browsers install chrome" or set PUPPETEER_EXECUTABLE_PATH. ` +
      `Details: ${err?.message || err}`
    );
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      // ignore
    }
    sharedBrowser = null;
  }
}

// Robust cleanup on termination signals
function handleExitSignal(): void {
  closeBrowser()
    .catch(() => {})
    .finally(() => {
      process.exit(0);
    });
}

process.on('SIGINT', handleExitSignal);
process.on('SIGTERM', handleExitSignal);

export async function exportPlan(options: ExportPlanOptions): Promise<ExportResult[]> {
  await acquireExportSlot();
  try {
    const {
      input,
      theme = 'dark',
      formats = ['png', 'pdf'],
      outputDir = './exports',
      outputName,
    } = options;

    const { content: markdownContent, derivedName } = resolveSafeMarkdownInput(input);
    const safeBaseName = sanitizeBaseName(outputName || derivedName || `plan-${Date.now()}`);

    // Validate outputDir: allow relative and safe absolute paths, block system and credential paths
    const trimmedOutputDir = outputDir.trim();
    if (trimmedOutputDir.includes('\0')) {
      throw new Error('Security Exception: Null bytes are not permitted in output directory.');
    }
    const cwd = path.resolve(process.cwd());
    const expandedOut = expandHome(trimmedOutputDir);
    const resolvedOutputDir = path.isAbsolute(expandedOut)
      ? path.normalize(expandedOut)
      : path.resolve(cwd, expandedOut);

    if (isSystemOrRestrictedPath(resolvedOutputDir)) {
      throw new Error(
        `Security Exception: Access denied. Target output directory "${trimmedOutputDir}" is a restricted system or credential path.`
      );
    }

    if (fs.existsSync(resolvedOutputDir)) {
      const realOutputDir = fs.realpathSync(resolvedOutputDir);
      if (isSystemOrRestrictedPath(realOutputDir)) {
        throw new Error(
          `Security Exception: Access denied. Target output directory resolves to a restricted system path.`
        );
      }
    } else {
      fs.mkdirSync(resolvedOutputDir, { recursive: true });
    }

    const results: ExportResult[] = [];

    // Format: HTML (Standalone lightweight output with CDN Mermaid if present)
    if (formats.includes('html')) {
      const standaloneHtml = await renderMarkdownToHtml(markdownContent, theme, { standaloneHtml: true });
      const htmlPath = path.join(resolvedOutputDir, `${safeBaseName}.html`);
      assertInsideDir(htmlPath, resolvedOutputDir);
      fs.writeFileSync(htmlPath, standaloneHtml, 'utf-8');
      results.push({ format: 'html', path: htmlPath });
    }

    const needsBrowser = formats.includes('png') || formats.includes('pdf');
    if (!needsBrowser) {
      return results;
    }

    // Render HTML for headless browser (using local offline bundle for Mermaid)
    const browserHtml = await renderMarkdownToHtml(markdownContent, theme, { standaloneHtml: false });
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      // Network isolation & anti-SSRF request interception
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const urlStr = req.url();

        // Allow safe internal data/blob protocols and initial document
        if (urlStr.startsWith('data:') || urlStr.startsWith('blob:') || urlStr === 'about:blank') {
          req.continue();
          return;
        }

        // Allow official Mermaid CDN only if needed
        if (urlStr.startsWith('https://cdn.jsdelivr.net/npm/mermaid@')) {
          req.continue();
          return;
        }

        // Block local filesystem access and private IP ranges (SSRF)
        try {
          const parsed = new URL(urlStr);
          const hostname = parsed.hostname.toLowerCase();

          const isPrivateOrLoopback =
            parsed.protocol === 'file:' ||
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname === '169.254.169.254' ||
            /^10\./.test(hostname) ||
            /^192\.168\./.test(hostname) ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

          if (isPrivateOrLoopback) {
            req.abort('accessdenied');
            return;
          }
        } catch {
          req.abort('accessdenied');
          return;
        }

        // Block all other unauthorized external requests
        req.abort('blockedbyclient');
      });

      // Defensive default timeout for all page operations
      page.setDefaultTimeout(OPERATION_TIMEOUT_MS);

      // Attack surface reduction: disable JavaScript entirely when Mermaid diagrams are not present
      const hasMermaid = browserHtml.includes('class="mermaid');
      if (!hasMermaid) {
        await page.setJavaScriptEnabled(false);
      }

      // 2x Retina DPR for crisp, high-density display
      await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
      await page.setContent(browserHtml, { waitUntil: 'load', timeout: OPERATION_TIMEOUT_MS });

      // Wait for Mermaid diagrams if present
      if (hasMermaid) {
        await page
          .waitForFunction(
            () => {
              const diagrams = document.querySelectorAll('.mermaid');
              if (diagrams.length === 0) return true;
              return Array.from(diagrams).every((d) => d.querySelector('svg'));
            },
            { timeout: MERMAID_TIMEOUT_MS }
          )
          .catch(() => {
            // Fallback: proceed if mermaid takes too long or isn't present
          });
      }

      // Format: PNG
      if (formats.includes('png')) {
        const pngPath = path.join(resolvedOutputDir, `${safeBaseName}.png`);
        assertInsideDir(pngPath, resolvedOutputDir);
        await page.screenshot({
          path: pngPath,
          fullPage: true,
          type: 'png',
        });
        results.push({ format: 'png', path: pngPath });
      }

      // Format: PDF
      if (formats.includes('pdf')) {
        const pdfPath = path.join(resolvedOutputDir, `${safeBaseName}.pdf`);
        assertInsideDir(pdfPath, resolvedOutputDir);
        await page.emulateMediaType('print');
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          margin: {
            top: '0',
            bottom: '0',
            left: '0',
            right: '0',
          },
        });
        results.push({ format: 'pdf', path: pdfPath });
      }
    } finally {
      await page.close();
    }

    return results;
  } finally {
    releaseExportSlot();
  }
}
