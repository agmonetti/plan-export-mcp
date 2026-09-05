import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';
import sanitizeHtml from 'sanitize-html';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Theme } from './types.js';
import { CONFIG } from './config.js';

const SANITIZE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'svg', 'path',
    'input',
    'details', 'summary',
    'kbd', 'del', 'ins', 'sub', 'sup',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'id', 'aria-*', 'role'],
    pre: ['style', 'tabindex'],
    span: ['style'],
    code: ['style'],
    svg: ['class', 'viewbox', 'viewBox', 'width', 'height', 'fill', 'xmlns'],
    path: ['d', 'fill', 'fill-rule', 'clip-rule'],
    input: ['type', 'checked', 'disabled', 'class'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    div: ['class', 'style'],
    table: ['class', 'style'],
    th: ['style', 'align', 'colspan', 'rowspan'],
    td: ['style', 'align', 'colspan', 'rowspan'],
    details: ['open'],
  },
  transformTags: {
    input: (tagName, attribs) => {
      // Security: Strictly enforce type="checkbox" and disabled="disabled"
      // Neutralize any form inputs, passwords, text boxes, or submission buttons
      if (attribs.type !== 'checkbox') {
        return {
          tagName: 'span',
          attribs: {},
        };
      }
      return {
        tagName: 'input',
        attribs: {
          type: 'checkbox',
          disabled: 'disabled',
          ...(attribs.checked !== undefined ? { checked: 'checked' } : {}),
          ...(attribs.class ? { class: attribs.class } : {}),
        },
      };
    },
  },
  allowedStyles: {
    '*': {
      'color': [/^\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]+)\s*$/],
      'background-color': [/^\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]+)\s*$/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-weight': [/^(bold|normal|[1-9]00)$/],
      'width': [/^\d+(px|em|rem|%)?$/],
      'height': [/^\d+(px|em|rem|%)?$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  disallowedTagsMode: 'discard',
};

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let highlighterInstance: Highlighter | null = null;

const DEFAULT_LANGS = [
  'typescript',
  'javascript',
  'json',
  'bash',
  'sh',
  'python',
  'java',
  'properties',
  'sql',
  'yaml',
  'diff',
  'markdown',
  'html',
  'css',
  'dockerfile',
  'csharp',
  'kotlin',
  'rust',
  'go',
  'text',
];

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: DEFAULT_LANGS,
    });
  }
  return highlighterInstance;
}

// GitHub Callout Octicons (SVG)
const ALERT_ICONS: Record<string, string> = {
  note: `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`,
  tip: `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.931.339.626.47 1.341.504 2.012h3.25c.034-.671.165-1.386.504-2.012.203-.375.45-.667.673-.931l.214-.253c.56-.679.984-1.32.984-2.304 0-2.06-1.637-3.75-4-3.75ZM6.271 12.25h3.458a.75.75 0 0 1 0 1.5H6.271a.75.75 0 0 1 0-1.5Zm.729 2.5h2a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1 0-1.5Z"/></svg>`,
  important: `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm6.25 2a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3.5ZM8 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`,
  warning: `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>`,
  caution: `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6c0 .199-.079.389-.22.53l-4.25 4.25a.749.749 0 0 1-.53.22H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`,
};

function githubAlertsPlugin(md: MarkdownIt) {
  md.core.ruler.after('block', 'github_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'blockquote_open') {
        const nextInline = tokens[i + 2];
        if (nextInline && nextInline.type === 'inline' && nextInline.content) {
          const match = nextInline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?([\s\S]*)$/i);
          if (match) {
            const rawType = match[1].toLowerCase();
            const type = rawType in ALERT_ICONS ? rawType : 'note';
            const titleText = rawType.charAt(0).toUpperCase() + rawType.slice(1);

            tokens[i].type = 'alert_open';
            tokens[i].tag = 'div';
            tokens[i].attrs = [['class', `markdown-alert markdown-alert-${type}`]];

            nextInline.content = match[2].trim();
            if (nextInline.children && nextInline.children.length > 0) {
              const firstChild = nextInline.children[0];
              if (firstChild && firstChild.type === 'text') {
                firstChild.content = firstChild.content.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
              }
            }

            const titleOpen = new state.Token('html_inline', '', 0);
            titleOpen.content = `<p class="markdown-alert-title">${ALERT_ICONS[type]} ${titleText}</p>`;
            tokens.splice(i + 1, 0, titleOpen);
            i++;

            let depth = 1;
            for (let j = i + 1; j < tokens.length; j++) {
              if (tokens[j].type === 'blockquote_open') depth++;
              if (tokens[j].type === 'blockquote_close') {
                depth--;
                if (depth === 0) {
                  tokens[j].type = 'alert_close';
                  tokens[j].tag = 'div';
                  break;
                }
              }
            }
          }
        }
      }
    }
  });
}

function getMermaidBundle(): string {
  const localPaths = [
    path.join(__dirname, '../node_modules/mermaid/dist/mermaid.min.js'),
    path.join(__dirname, '../../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve(process.cwd(), 'node_modules/mermaid/dist/mermaid.min.js'),
  ];

  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        // Prevent premature script/body closure by HTML parsers & Live Server injectors
        return raw
          .replace(/<\/script/gi, '<\\/script')
          .replace(/<\/body/gi, '<\\/body')
          .replace(/<\/html/gi, '<\\/html');
      } catch {
        // continue
      }
    }
  }
  return '';
}

export function getThemeStyles(theme: Theme): string {
  const isDark = theme === 'dark';

  return `
    :root {
      --bg-color: ${isDark ? '#0d1117' : '#ffffff'};
      --text-color: ${isDark ? '#c9d1d9' : '#1f2328'};
      --border-color: ${isDark ? '#30363d' : '#d0d7de'};
      --subtle-border: ${isDark ? '#21262d' : '#e1e4e8'};
      --code-bg: ${isDark ? '#161b22' : '#f6f8fa'};
      --heading-color: ${isDark ? '#f0f6fc' : '#1f2328'};
      --link-color: ${isDark ? '#58a6ff' : '#0969da'};
      --table-row-alt: ${isDark ? '#161b22' : '#f6f8fa'};
      
      /* Alerts */
      --alert-note-border: ${isDark ? '#1f6feb' : '#0969da'};
      --alert-note-text: ${isDark ? '#58a6ff' : '#0969da'};
      --alert-tip-border: ${isDark ? '#238636' : '#1a7f37'};
      --alert-tip-text: ${isDark ? '#3fb950' : '#1a7f37'};
      --alert-important-border: ${isDark ? '#8957e5' : '#8250df'};
      --alert-important-text: ${isDark ? '#a371f7' : '#8250df'};
      --alert-warning-border: ${isDark ? '#9e6a03' : '#9a6700'};
      --alert-warning-text: ${isDark ? '#d29922' : '#9a6700'};
      --alert-caution-border: ${isDark ? '#da3633' : '#cf222e'};
      --alert-caution-text: ${isDark ? '#f85149' : '#cf222e'};
    }

    @page {
      size: A4;
      margin: 18mm 16mm;
      background-color: ${isDark ? '#0d1117' : '#ffffff'};
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      background-color: var(--bg-color) !important;
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      margin: 0;
      padding: 0;
      word-wrap: break-word;
      -webkit-font-smoothing: antialiased;
    }

    .plan-wrapper {
      padding: 24px 32px;
      max-width: 900px;
      margin: 0 auto;
    }

    @media print {
      .plan-wrapper {
        padding: 0 !important;
        max-width: 100% !important;
      }
    }

    h1, h2, h3, h4, h5, h6 {
      color: var(--heading-color);
      font-weight: 600;
      line-height: 1.3;
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    h1 {
      font-size: 18pt;
      padding-bottom: 6pt;
      border-bottom: 1px solid var(--border-color);
      margin-top: 0;
      margin-bottom: 12pt;
    }

    h2 {
      font-size: 13pt;
      padding-bottom: 4pt;
      border-bottom: 1px solid var(--subtle-border);
      margin-top: 18pt;
      margin-bottom: 8pt;
    }

    h3 {
      font-size: 11pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }

    h4 {
      font-size: 10pt;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }

    p, ul, ol {
      margin-top: 0;
      margin-bottom: 8pt;
    }

    ul, ol {
      padding-left: 1.6em;
    }

    li {
      margin-bottom: 3pt;
    }

    a {
      color: var(--link-color);
      text-decoration: none;
    }

    /* Task lists */
    .contains-task-list {
      list-style-type: none;
      padding-left: 0.2em;
    }

    .task-list-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 4pt;
    }

    .task-list-item input[type="checkbox"] {
      margin: 0.2em 0.5em 0 0;
      cursor: default;
      accent-color: var(--link-color);
      transform: scale(1.05);
    }

    /* Code Blocks */
    .code-card {
      margin: 8pt 0 14pt 0;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background-color: var(--code-bg);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .code-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4pt 10pt;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'};
      border-bottom: 1px solid var(--border-color);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 8pt;
      color: ${isDark ? '#8b949e' : '#656d76'};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .code-card pre.shiki {
      margin: 0 !important;
      padding: 8pt 12pt !important;
      border-radius: 0 !important;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      font-size: 8.5pt !important;
      line-height: 1.5 !important;
      background-color: transparent !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }

    code:not(pre code) {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 85%;
      padding: 0.15em 0.35em;
      background-color: ${isDark ? 'rgba(110,118,129,0.35)' : 'rgba(175,184,193,0.2)'};
      border-radius: 3px;
    }

    /* Tables */
    table {
      display: table !important;
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 8pt 0 14pt 0;
      font-size: 8.5pt;
      line-height: 1.45;
      page-break-inside: auto !important;
      break-inside: auto !important;
      border: 1px solid var(--border-color);
      border-radius: 6px;
    }

    thead {
      display: table-header-group !important;
    }

    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    table th, table td {
      padding: 6pt 8pt;
      border: 1px solid var(--border-color);
      vertical-align: top;
    }

    table th {
      font-weight: 600;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'} !important;
      color: var(--heading-color);
    }

    table tr:nth-child(2n) {
      background-color: var(--table-row-alt) !important;
    }

    /* Blockquotes */
    blockquote {
      margin: 10pt 0;
      padding: 0 1em;
      color: ${isDark ? '#8b949e' : '#656d76'};
      border-left: 0.25em solid var(--border-color);
    }

    /* GitHub Alerts */
    .markdown-alert {
      padding: 10pt 12pt;
      margin-bottom: 12pt;
      color: inherit;
      border-left: 4px solid var(--border-color);
      background-color: ${isDark ? 'rgba(110,118,129,0.1)' : 'rgba(175,184,193,0.1)'};
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .markdown-alert-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 9.5pt;
      margin-bottom: 4pt;
      line-height: 1;
    }

    .markdown-alert p:last-child {
      margin-bottom: 0;
    }

    .markdown-alert .octicon {
      display: inline-block;
      vertical-align: text-bottom;
      flex-shrink: 0;
    }

    .markdown-alert-note { border-left-color: var(--alert-note-border); }
    .markdown-alert-note .markdown-alert-title { color: var(--alert-note-text); }
    .markdown-alert-tip { border-left-color: var(--alert-tip-border); }
    .markdown-alert-tip .markdown-alert-title { color: var(--alert-tip-text); }
    .markdown-alert-important { border-left-color: var(--alert-important-border); }
    .markdown-alert-important .markdown-alert-title { color: var(--alert-important-text); }
    .markdown-alert-warning { border-left-color: var(--alert-warning-border); }
    .markdown-alert-warning .markdown-alert-title { color: var(--alert-warning-text); }
    .markdown-alert-caution { border-left-color: var(--alert-caution-border); }
    .markdown-alert-caution .markdown-alert-title { color: var(--alert-caution-text); }

    /* Mermaid Container */
    .mermaid-container {
      margin: 12pt 0;
      padding: 14pt;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'};
      border: 1px solid var(--border-color);
      border-radius: 6px;
      text-align: center;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .mermaid {
      display: flex;
      justify-content: center;
    }

    hr {
      height: 1px;
      padding: 0;
      margin: 16pt 0;
      background-color: var(--border-color);
      border: 0;
    }
  `;
}

export interface RenderOptions {
  standaloneHtml?: boolean;
}

export async function renderMarkdownToHtml(
  markdown: string,
  theme: Theme = CONFIG.defaults.theme,
  options: RenderOptions = {}
): Promise<string> {
  const highlighter = await getHighlighter();

  // Scan and dynamically load any language found in markdown code blocks (capped to prevent memory exhaustion)
  let loadedLangsCount = 0;
  const langMatches = markdown.matchAll(/```([a-zA-Z0-9_-]+)/g);
  for (const match of langMatches) {
    if (loadedLangsCount >= CONFIG.limits.maxDynamicLangs) break;
    const rawLang = match[1].toLowerCase().trim();
    if (rawLang && rawLang !== 'mermaid' && !highlighter.getLoadedLanguages().includes(rawLang)) {
      if (rawLang in bundledLanguages) {
        try {
          await highlighter.loadLanguage(rawLang as any);
          loadedLangsCount++;
        } catch (err) {
          process.stderr.write(
            `[plan-export-mcp] Warning: Could not dynamically load grammar for language "${rawLang}": ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }
    }
  }

  const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';
  const hasMermaid = /(?:^|\n)```mermaid\b/.test(markdown);

  const md = new MarkdownIt({
    html: true,
    linkify: true,
  });

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const lang = info ? info.split(/\s+/)[0].toLowerCase() : '';
    const code = token.content;

    if (lang === 'mermaid') {
      return `<div class="mermaid-container"><div class="mermaid">${escapeHtml(code.trim())}</div></div>\n`;
    }

    const safeLang = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';
    const highlightedCode = highlighter.codeToHtml(code, {
      lang: safeLang,
      theme: shikiTheme,
    });
    const displayLang = escapeHtml(lang || 'code');

    return `<div class="code-card"><div class="code-card-header"><span>${displayLang}</span></div>${highlightedCode}</div>\n`;
  };

  md.use(taskLists, { enabled: true });
  md.use(githubAlertsPlugin);

  // Normalize local IDE file links ([File](file:///...)) into clean inline code: `File`
  const normalizedMarkdown = markdown.replace(
    /\[([^\]]+)\]\((?:file|vscode|cursor|windsurf):\/\/[^\)]+\)/g,
    (_, label) => {
      const clean = label.trim().replace(/^`+|`+$/g, '');
      return `\`${clean}\``;
    }
  );

  const rawRenderedContent = md.render(normalizedMarkdown);
  const renderedContent = sanitizeHtml(rawRenderedContent, SANITIZE_HTML_OPTIONS);
  const styles = getThemeStyles(theme);

  let mermaidAssets = '';
  if (hasMermaid) {
    const localMermaid = getMermaidBundle();
    // Hybrid: In standalone exported HTML, use official CDN to keep file lightweight (~30KB)
    // In Puppeteer (offline/headless export), use bundled script for speed and network isolation
    const useCdn = options.standaloneHtml === true || !localMermaid;
    const mermaidScriptTag = useCdn
      ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@${CONFIG.mermaid.version}/dist/mermaid.min.js" integrity="${CONFIG.mermaid.sri}" crossorigin="anonymous"></script>`
      : `<script>${localMermaid}</script>`;

    const mermaidTheme = theme === 'dark' ? 'dark' : 'default';

    mermaidAssets = `
  ${mermaidScriptTag}
  <script>
    if (window.mermaid) {
      mermaid.initialize({
        startOnLoad: true,
        theme: '${mermaidTheme}',
        securityLevel: 'strict',
        themeVariables: {
          darkMode: ${theme === 'dark'},
          background: '${theme === 'dark' ? '#161b22' : '#ffffff'}',
          primaryColor: '${theme === 'dark' ? '#21262d' : '#f6f8fa'}',
          primaryTextColor: '${theme === 'dark' ? '#c9d1d9' : '#1f2328'}',
          primaryBorderColor: '${theme === 'dark' ? '#30363d' : '#d0d7de'}',
          lineColor: '${theme === 'dark' ? '#8b949e' : '#57606a'}',
          secondaryColor: '${theme === 'dark' ? '#1f6feb' : '#0969da'}',
          tertiaryColor: '${theme === 'dark' ? '#161b22' : '#f6f8fa'}'
        }
      });
      mermaid.run();
    }
  </script>`;
  }

  const scriptSrc = hasMermaid ? "'unsafe-inline' https://cdn.jsdelivr.net" : "'none'";
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc}; img-src data: https:; font-src data:;`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Implementation Plan</title>
  <style>
    ${styles}
  </style>
</head>
<body>
  <div class="plan-wrapper">
    ${renderedContent}
  </div>${mermaidAssets}
</body>
</html>`;
}

/**
 * Renders a standalone Mermaid diagram inside a minimal, auto-centering HTML document.
 * Includes local offline Mermaid bundle (or CDN when standaloneHtml is requested)
 * and strict CSP headers.
 */
export function renderDiagramToHtml(
  diagram: string,
  theme: Theme = CONFIG.defaults.theme,
  options: { standaloneHtml?: boolean } = {}
): string {
  const isDark = theme === 'dark';
  const mermaidTheme = isDark ? 'dark' : 'default';
  const bgColor = isDark ? '#0d1117' : '#ffffff';
  const escapedDiagram = escapeHtml(diagram.trim());

  let mermaidScriptTag = '';
  const cdnTag = `<script src="https://cdn.jsdelivr.net/npm/mermaid@${CONFIG.mermaid.version}/dist/mermaid.min.js" integrity="${CONFIG.mermaid.sri}" crossorigin="anonymous"></script>`;
  if (options.standaloneHtml) {
    mermaidScriptTag = cdnTag;
  } else {
    const bundle = getMermaidBundle();
    if (bundle) {
      mermaidScriptTag = `<script>${bundle}</script>`;
    } else {
      mermaidScriptTag = cdnTag;
    }
  }

  const scriptSrc = "'unsafe-inline' https://cdn.jsdelivr.net";
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc}; img-src data:; font-src data:;`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Diagram</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 32px;
      background-color: ${bgColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-width: 100vw;
      min-height: 100vh;
    }
    .mermaid-standalone {
      display: inline-block;
      padding: 16px;
      background-color: ${bgColor};
      border-radius: 8px;
    }
    .mermaid {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="mermaid-standalone">
    <div class="mermaid">${escapedDiagram}</div>
  </div>
  ${mermaidScriptTag}
  <script>
    if (window.mermaid) {
      mermaid.initialize({
        startOnLoad: true,
        theme: '${mermaidTheme}',
        securityLevel: 'strict',
        themeVariables: {
          darkMode: ${isDark},
          background: '${isDark ? '#161b22' : '#ffffff'}',
          primaryColor: '${isDark ? '#21262d' : '#f6f8fa'}',
          primaryTextColor: '${isDark ? '#c9d1d9' : '#1f2328'}',
          primaryBorderColor: '${isDark ? '#30363d' : '#d0d7de'}',
          lineColor: '${isDark ? '#8b949e' : '#57606a'}',
          secondaryColor: '${isDark ? '#1f6feb' : '#0969da'}',
          tertiaryColor: '${isDark ? '#161b22' : '#f6f8fa'}'
        }
      });
      mermaid.run();
    }
  </script>
</body>
</html>`;
}

