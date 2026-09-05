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
  if (fs.existsSync(input)) {
    const stat = fs.statSync(input);
    if (stat.isFile()) {
      markdownContent = fs.readFileSync(input, 'utf-8');
      if (!baseName) {
        baseName = path.basename(input, path.extname(input));
      }
    }
  }

  if (!baseName) {
    baseName = `plan-${Date.now()}`;
  }

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
    const htmlPath = path.join(resolvedOutputDir, `${baseName}.html`);
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
    // 2x Retina DPR for crisp, high-density display
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'load' });

    // Wait for Mermaid diagrams if present
    await page
      .waitForFunction(
        () => {
          const diagrams = document.querySelectorAll('.mermaid');
          if (diagrams.length === 0) return true;
          return Array.from(diagrams).every((d) => d.querySelector('svg'));
        },
        { timeout: 8000 }
      )
      .catch(() => {
        // Fallback: proceed if mermaid takes too long or isn't present
      });

    // Format: PNG
    if (formats.includes('png')) {
      const pngPath = path.join(resolvedOutputDir, `${baseName}.png`);
      await page.screenshot({
        path: pngPath,
        fullPage: true,
        type: 'png',
      });
      results.push({ format: 'png', path: pngPath });
    }

    // Format: PDF
    if (formats.includes('pdf')) {
      const pdfPath = path.join(resolvedOutputDir, `${baseName}.pdf`);
      await page.emulateMediaType('screen');
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
      });
      results.push({ format: 'pdf', path: pdfPath });
    }
  } finally {
    await page.close();
  }

  return results;
}
