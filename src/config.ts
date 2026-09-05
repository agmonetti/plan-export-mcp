export const CONFIG = {
  limits: {
    maxInputBytes: parseInt(process.env.PLAN_EXPORT_MAX_INPUT_BYTES || '', 10) || 10 * 1024 * 1024,
    maxConcurrentExports: parseInt(process.env.PLAN_EXPORT_MAX_CONCURRENT || '', 10) || 2,
    maxQueueSize: parseInt(process.env.PLAN_EXPORT_MAX_QUEUE || '', 10) || 20,
    maxDynamicLangs: 20,
  },
  timeouts: {
    operationMs: parseInt(process.env.PLAN_EXPORT_OPERATION_TIMEOUT_MS || '', 10) || 15000,
    mermaidMs: parseInt(process.env.PLAN_EXPORT_MERMAID_TIMEOUT_MS || '', 10) || 6000,
    browserLaunchMs: parseInt(process.env.PLAN_EXPORT_LAUNCH_TIMEOUT_MS || '', 10) || 15000,
    browserIdleMs: parseInt(process.env.PLAN_EXPORT_IDLE_TIMEOUT_MS || '', 10) || 60000,
  },
  defaults: {
    outputDir: './exports',
    theme: 'dark' as const,
    formats: ['png', 'pdf'] as const,
  },
  allowedExtensions: new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']),
  mermaid: {
    version: '11.17.2',
    sri: 'sha384-EOXBFmc3gx5mb+vn0vPvvGqACToJD24hhacX5Yx+8NUUQrHIle/Qi5Bg9o3zKwW2',
  },
  commonChromePaths: [
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
  ],
};
