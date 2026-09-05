import puppeteer, { type Browser } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { renderMarkdownToHtml } from './renderer.js';
import type { ExportPlanOptions, ExportResult, Theme, ExportFormat } from './types.js';
import { ExportError, SecurityError, BrowserError } from './errors.js';
import { CONFIG } from './config.js';

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
    if (Buffer.byteLength(input, 'utf-8') > CONFIG.limits.maxInputBytes) {
      throw new ExportError(`Markdown input exceeds maximum allowed size of 10MB.`, 'INPUT_TOO_LARGE');
    }
    return { content: input };
  }

  if (typeof input === 'string' && input.length < 4096) {
    const trimmed = input.trim();
    if (trimmed.includes('\0')) {
      throw new SecurityError('Security Exception: Null bytes are not permitted in path input.', 'NULL_BYTE');
    }

    const ext = path.extname(trimmed).toLowerCase();
    const isExplicitFileExt = CONFIG.allowedExtensions.has(ext);

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
      throw new SecurityError(
        `Security Exception: Access denied. Cannot access restricted system or credential path: "${trimmed}".`,
        'RESTRICTED_PATH'
      );
    }

    let realPath: string | null = null;
    try {
      realPath = fs.realpathSync(candidatePath);
    } catch {
      // Path does not exist
      if (isExplicitFileExt) {
        throw new ExportError(`File not found: "${trimmed}".`, 'FILE_NOT_FOUND');
      }
    }

    if (realPath !== null) {
      // Eagerly verify resolved real path is not a restricted system or credential path
      if (isSystemOrRestrictedPath(realPath)) {
        throw new SecurityError(
          `Security Exception: Access denied. Target file or symlink resolves to a restricted path.`,
          'RESTRICTED_PATH'
        );
      }

      let fd: number | null = null;
      try {
        // Open file descriptor atomically to eliminate TOCTOU symlink races
        fd = fs.openSync(realPath, 'r');
        const stat = fs.fstatSync(fd);

        if (!stat.isFile()) {
          throw new ExportError(`Invalid input: Path is not a regular file: "${trimmed}".`, 'NOT_A_FILE');
        }

        const fileExt = path.extname(realPath).toLowerCase();
        if (!CONFIG.allowedExtensions.has(fileExt)) {
          throw new SecurityError(
            `Security Exception: Invalid file extension "${fileExt}". Only Markdown and text files (.md, .markdown, .txt) are permitted.`,
            'INVALID_EXTENSION'
          );
        }

        if (stat.size > CONFIG.limits.maxInputBytes) {
          throw new ExportError(`Input file exceeds maximum allowed size of 10MB: "${trimmed}".`, 'INPUT_TOO_LARGE');
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

  if (Buffer.byteLength(input, 'utf-8') > CONFIG.limits.maxInputBytes) {
    throw new ExportError(`Markdown input exceeds maximum allowed size of 10MB.`, 'INPUT_TOO_LARGE');
  }

  return { content: input };
}

export function sanitizeBaseName(rawName: string): string {
  if (typeof rawName === 'string' && rawName.includes('\0')) {
    throw new SecurityError('Security Exception: Null bytes are not permitted in output name.', 'NULL_BYTE');
  }
  const base = path.basename(rawName).trim();
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return sanitized.replace(/^_+|_+$/g, '') || `plan-${Date.now()}`;
}

export function assertInsideDir(filePath: string, targetDir: string): void {
  const resolvedTarget = path.resolve(targetDir);
  const resolvedFile = path.resolve(filePath);

  const realTarget = fs.existsSync(resolvedTarget)
    ? fs.realpathSync(resolvedTarget)
    : resolvedTarget;

  let realFile = resolvedFile;
  if (fs.existsSync(resolvedFile)) {
    realFile = fs.realpathSync(resolvedFile);
  } else {
    const parentDir = path.dirname(resolvedFile);
    if (fs.existsSync(parentDir)) {
      realFile = path.join(fs.realpathSync(parentDir), path.basename(resolvedFile));
    }
  }

  const relative = path.relative(realTarget, realFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || realFile === realTarget) {
    throw new SecurityError(
      `Security Exception: Target path "${filePath}" attempts to escape output directory "${targetDir}".`,
      'PATH_TRAVERSAL'
    );
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
  for (const p of CONFIG.commonChromePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return undefined;
}


const BASE_BROWSER_ARGS: string[] = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--font-render-hinting=none',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-extensions',
];

export async function launchChromiumWithFallback(executablePath?: string): Promise<Browser> {
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const forceNoSandbox = isRoot || process.env.PLAN_EXPORT_NO_SANDBOX === 'true';

  if (!forceNoSandbox) {
    try {
      return await puppeteer.launch({
        executablePath,
        headless: true,
        args: BASE_BROWSER_ARGS,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isSandboxIssue =
        errMsg.includes('sandbox') ||
        errMsg.includes('setuid') ||
        errMsg.includes('namespace') ||
        errMsg.includes('zygote');

      if (!isSandboxIssue) {
        throw err;
      }
      process.stderr.write(
        '[plan-export-mcp] Notice: Chromium sandbox is unavailable in current environment; falling back to un-sandboxed mode.\n'
      );
    }
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', ...BASE_BROWSER_ARGS],
  });
}

export function isAllowedBrowserUrl(urlStr: string): boolean {
  if (urlStr.startsWith('data:') || urlStr.startsWith('blob:') || urlStr === 'about:blank') {
    return true;
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    // Strict hostname and path validation for Mermaid CDN with no credentials or unusual ports
    if (
      parsed.hostname === 'cdn.jsdelivr.net' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      parsed.pathname.startsWith('/npm/mermaid@')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export class ExportService {
  private sharedBrowser: Browser | null = null;
  private activeExports = 0;
  private waitQueue: Array<() => void> = [];
  private browserIdleTimer: NodeJS.Timeout | null = null;
  private config: typeof CONFIG;

  constructor(config: typeof CONFIG = CONFIG) {
    this.config = config;
  }

  public getActiveExports(): number {
    return this.activeExports;
  }

  public getQueueLength(): number {
    return this.waitQueue.length;
  }

  public hasActiveBrowser(): boolean {
    return this.sharedBrowser !== null && this.sharedBrowser.connected;
  }

  public resetBrowserIdleTimer(): void {
    if (this.browserIdleTimer) {
      clearTimeout(this.browserIdleTimer);
      this.browserIdleTimer = null;
    }
    if (this.sharedBrowser && this.activeExports === 0) {
      this.browserIdleTimer = setTimeout(() => {
        if (this.activeExports === 0 && this.sharedBrowser) {
          this.closeBrowser().catch(() => {});
        }
      }, this.config.timeouts.browserIdleMs);
      if (this.browserIdleTimer && typeof this.browserIdleTimer.unref === 'function') {
        this.browserIdleTimer.unref();
      }
    }
  }

  public async acquireExportSlot(): Promise<void> {
    if (this.browserIdleTimer) {
      clearTimeout(this.browserIdleTimer);
      this.browserIdleTimer = null;
    }
    if (this.activeExports < this.config.limits.maxConcurrentExports) {
      this.activeExports++;
      return;
    }
    if (this.waitQueue.length >= this.config.limits.maxQueueSize) {
      throw new ExportError(
        `Export capacity exceeded: Concurrency queue is full (max ${this.config.limits.maxQueueSize} pending requests). Please retry shortly.`,
        'CAPACITY_EXCEEDED'
      );
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeExports++;
        resolve();
      });
    });
  }

  public releaseExportSlot(): void {
    this.activeExports--;
    if (this.waitQueue.length > 0 && this.activeExports < this.config.limits.maxConcurrentExports) {
      const next = this.waitQueue.shift();
      if (next) next();
    } else if (this.activeExports === 0) {
      this.resetBrowserIdleTimer();
    }
  }

  public async getBrowser(): Promise<Browser> {
    if (this.sharedBrowser && this.sharedBrowser.connected) {
      try {
        // Proactive health check to ensure browser process is responsive and not crashed
        await this.sharedBrowser.version();
        return this.sharedBrowser;
      } catch {
        // Browser disconnected or crashed; reset reference and re-launch
        this.sharedBrowser = null;
      }
    }

    const executablePath = resolveExecutablePath();

    try {
      const launchPromise = launchChromiumWithFallback(executablePath);

      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          reject(
            new Error(
              `Timed out after ${this.config.timeouts.browserLaunchMs / 1000}s attempting to launch headless browser.`
            )
          );
        }, this.config.timeouts.browserLaunchMs);
        if (typeof t.unref === 'function') t.unref();
      });

      this.sharedBrowser = await Promise.race([launchPromise, timeoutPromise]);
      this.resetBrowserIdleTimer();
      return this.sharedBrowser;
    } catch (err: any) {
      throw new BrowserError(
        `Failed to launch headless browser for PDF/PNG export. ` +
        `HTML exports remain available without a browser. ` +
        `To enable PDF/PNG, run "npx puppeteer browsers install chrome" or set PUPPETEER_EXECUTABLE_PATH. ` +
        `Details: ${err?.message || err}`
      );
    }
  }

  public async closeBrowser(): Promise<void> {
    if (this.browserIdleTimer) {
      clearTimeout(this.browserIdleTimer);
      this.browserIdleTimer = null;
    }
    if (this.sharedBrowser) {
      try {
        await this.sharedBrowser.close();
      } catch {
        // ignore
      }
      this.sharedBrowser = null;
    }
  }

  public async exportPlan(options: ExportPlanOptions): Promise<ExportResult[]> {
    await this.acquireExportSlot();
    try {
      const {
        input,
        theme = this.config.defaults.theme,
        formats = [...this.config.defaults.formats],
        outputDir = this.config.defaults.outputDir,
        outputName,
      } = options;

      const { content: markdownContent, derivedName } = resolveSafeMarkdownInput(input);
      const safeBaseName = sanitizeBaseName(outputName || derivedName || `plan-${Date.now()}`);

      // Validate outputDir: allow relative and safe absolute paths, block system and credential paths
      const trimmedOutputDir = outputDir.trim();
      if (trimmedOutputDir.includes('\0')) {
        throw new SecurityError('Security Exception: Null bytes are not permitted in output directory.', 'NULL_BYTE');
      }
      const cwd = path.resolve(process.cwd());
      const expandedOut = expandHome(trimmedOutputDir);
      const resolvedOutputDir = path.isAbsolute(expandedOut)
        ? path.normalize(expandedOut)
        : path.resolve(cwd, expandedOut);

      if (isSystemOrRestrictedPath(resolvedOutputDir)) {
        throw new SecurityError(
          `Security Exception: Access denied. Target output directory "${trimmedOutputDir}" is a restricted system or credential path.`,
          'RESTRICTED_PATH'
        );
      }

      if (!fs.existsSync(resolvedOutputDir)) {
        fs.mkdirSync(resolvedOutputDir, { recursive: true });
      }

      const realOutputDir = fs.realpathSync(resolvedOutputDir);
      if (isSystemOrRestrictedPath(realOutputDir)) {
        throw new SecurityError(
          `Security Exception: Access denied. Target output directory resolves to a restricted system path.`,
          'RESTRICTED_PATH'
        );
      }

      const dirStat = fs.statSync(realOutputDir);
      if (!dirStat.isDirectory()) {
        throw new ExportError(
          `Invalid output directory: Target path is not a directory: "${trimmedOutputDir}".`,
          'NOT_A_DIRECTORY'
        );
      }

      const results: ExportResult[] = [];

      // Format: HTML (Standalone lightweight output with CDN Mermaid if present)
      if (formats.includes('html')) {
        const standaloneHtml = await renderMarkdownToHtml(markdownContent, theme, { standaloneHtml: true });
        const htmlPath = path.join(realOutputDir, `${safeBaseName}.html`);
        assertInsideDir(htmlPath, realOutputDir);
        fs.writeFileSync(htmlPath, standaloneHtml, 'utf-8');
        results.push({ format: 'html', path: htmlPath });
      }

      const needsBrowser = formats.includes('png') || formats.includes('pdf');
      if (!needsBrowser) {
        return results;
      }

      // Render HTML for headless browser (using local offline bundle for Mermaid)
      const browserHtml = await renderMarkdownToHtml(markdownContent, theme, { standaloneHtml: false });
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        // Network isolation & strict allowlist anti-SSRF request interception
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (isAllowedBrowserUrl(req.url())) {
            req.continue();
          } else {
            req.abort('blockedbyclient');
          }
        });

        // Defensive default timeout for all page operations
        page.setDefaultTimeout(this.config.timeouts.operationMs);

        // Attack surface reduction: disable JavaScript entirely when Mermaid diagrams are not present
        const hasMermaid = browserHtml.includes('class="mermaid');
        if (!hasMermaid) {
          await page.setJavaScriptEnabled(false);
        }

        // 2x Retina DPR for crisp, high-density display
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        await page.setContent(browserHtml, { waitUntil: 'load', timeout: this.config.timeouts.operationMs });

        // Wait for Mermaid diagrams if present
        if (hasMermaid) {
          await page
            .waitForFunction(
              () => {
                const diagrams = document.querySelectorAll('.mermaid');
                if (diagrams.length === 0) return true;
                return Array.from(diagrams).every((d) => d.querySelector('svg'));
              },
              { timeout: this.config.timeouts.mermaidMs }
            )
            .catch(() => {
              // Fallback: proceed if mermaid takes too long or isn't present
            });
        }

        // Format: PNG
        if (formats.includes('png')) {
          const pngPath = path.join(realOutputDir, `${safeBaseName}.png`);
          assertInsideDir(pngPath, realOutputDir);
          await page.screenshot({
            path: pngPath,
            fullPage: true,
            type: 'png',
          });
          results.push({ format: 'png', path: pngPath });
        }

        // Format: PDF
        if (formats.includes('pdf')) {
          const pdfPath = path.join(realOutputDir, `${safeBaseName}.pdf`);
          assertInsideDir(pdfPath, realOutputDir);
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
      this.releaseExportSlot();
    }
  }
}

export const defaultExportService = new ExportService();

export async function exportPlan(options: ExportPlanOptions): Promise<ExportResult[]> {
  return defaultExportService.exportPlan(options);
}

export async function getBrowser(): Promise<Browser> {
  return defaultExportService.getBrowser();
}

export async function closeBrowser(): Promise<void> {
  return defaultExportService.closeBrowser();
}

export function resetBrowserIdleTimer(): void {
  defaultExportService.resetBrowserIdleTimer();
}

// Robust cleanup on termination signals
function handleExitSignal(): void {
  defaultExportService
    .closeBrowser()
    .catch(() => {})
    .finally(() => {
      process.exit(0);
    });
}

process.on('SIGINT', handleExitSignal);
process.on('SIGTERM', handleExitSignal);

