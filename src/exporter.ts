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

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB limit

export function sanitizeBaseName(rawName: string): string {
  const base = path.basename(rawName).trim();
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return sanitized.replace(/^_+|_+$/g, '') || `plan-${Date.now()}`;
}

export function assertInsideDir(filePath: string, targetDir: string): void {
  const relative = path.relative(targetDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Security Exception: Target path "${filePath}" attempts to escape output directory "${targetDir}".`);
  }
}

export function resolveExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  for (const p of COMMON_CHROME_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    const puppeteerPath = puppeteer.executablePath();
    if (fs.existsSync(puppeteerPath)) {
      return puppeteerPath;
    }
  } catch {
    // continue
  }

  return undefined;
}

const OPERATION_TIMEOUT_MS = 15000;
const MERMAID_TIMEOUT_MS = 6000;

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }

  const executablePath = resolveExecutablePath();

  sharedBrowser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-extensions',
    ],
  });

  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      // ignore
    }
    sharedBrowser = null;
  }
}

// Cleanup on exit
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

export async function exportPlan(options: ExportPlanOptions): Promise<ExportResult[]> {
  const {
    input,
    theme = 'dark',
    formats = ['png', 'pdf'],
    outputDir = './exports',
    outputName,
  } = options;

  let markdownContent = input;
  let baseName = outputName;

  // Check if input is a file path
  if (typeof input === 'string' && input.length < 4096 && fs.existsSync(input)) {
    const stat = fs.statSync(input);
    if (stat.isFile()) {
      if (stat.size > MAX_INPUT_BYTES) {
        throw new Error(`Input file exceeds maximum allowed size of 10MB: ${input}`);
      }
      markdownContent = fs.readFileSync(input, 'utf-8');
      if (!baseName) {
        baseName = path.basename(input, path.extname(input));
      }
    }
  }

  if (Buffer.byteLength(markdownContent, 'utf-8') > MAX_INPUT_BYTES) {
    throw new Error(`Markdown input exceeds maximum allowed size of 10MB.`);
  }

  const safeBaseName = sanitizeBaseName(baseName || `plan-${Date.now()}`);

  // Ensure output directory exists
  const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  // Render markdown to fully styled HTML
  const fullHtml = await renderMarkdownToHtml(markdownContent, theme);
  const results: ExportResult[] = [];

  // Format: HTML
  if (formats.includes('html')) {
    const htmlPath = path.join(resolvedOutputDir, `${safeBaseName}.html`);
    assertInsideDir(htmlPath, resolvedOutputDir);
    fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
    results.push({ format: 'html', path: htmlPath });
  }

  const needsBrowser = formats.includes('png') || formats.includes('pdf');
  if (!needsBrowser) {
    return results;
  }

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

    // 2x Retina DPR for crisp, high-density display
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'load', timeout: OPERATION_TIMEOUT_MS });

    // Wait for Mermaid diagrams if present
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
}
