import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { createHighlighter, type Highlighter } from 'shiki';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Theme } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let highlighterInstance: Highlighter | null = null;

const SUPPORTED_LANGS = [
  'typescript',
  'javascript',
  'json',
  'bash',
  'sh',
  'shell',
  'python',
  'sql',
  'yaml',
  'yml',
  'diff',
  'markdown',
  'md',
  'html',
  'css',
  'dockerfile',
  'rust',
  'go',
  'text',
];

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: SUPPORTED_LANGS,
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

            // Strip the marker from inline content
            nextInline.content = match[2].trim();
            if (nextInline.children && nextInline.children.length > 0) {
              const firstChild = nextInline.children[0];
              if (firstChild && firstChild.type === 'text') {
                firstChild.content = firstChild.content.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
              }
            }

            // Insert alert title token right before the paragraph content
            const titleOpen = new state.Token('html_inline', '', 0);
            titleOpen.content = `<p class="markdown-alert-title">${ALERT_ICONS[type]} ${titleText}</p>`;
            tokens.splice(i + 1, 0, titleOpen);
            i++; // shift index

            // Close matching blockquote_close
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
  // Check local node_modules first for 100% offline capability
  const localPaths = [
    path.join(__dirname, '../node_modules/mermaid/dist/mermaid.min.js'),
    path.join(__dirname, '../../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve(process.cwd(), 'node_modules/mermaid/dist/mermaid.min.js'),
  ];

  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf-8');
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

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      margin: 0;
      padding: 48px 36px;
      word-wrap: break-word;
      -webkit-font-smoothing: antialiased;
    }

    .plan-container {
      max-width: 880px;
      margin: 0 auto;
    }

    h1, h2, h3, h4, h5, h6 {
      color: var(--heading-color);
      font-weight: 600;
      line-height: 1.25;
      margin-top: 24px;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 2rem;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--border-color);
      margin-top: 0;
    }

    h2 {
      font-size: 1.5rem;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--subtle-border);
      margin-top: 32px;
    }

    h3 { font-size: 1.25rem; }
    h4 { font-size: 1rem; }

    p, ul, ol {
      margin-top: 0;
      margin-bottom: 16px;
    }

    ul, ol {
      padding-left: 2em;
    }

    li + li {
      margin-top: 0.25em;
    }

    a {
      color: var(--link-color);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    /* Task lists */
    .contains-task-list {
      list-style-type: none;
      padding-left: 0.5em;
    }

    .task-list-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 6px;
    }

    .task-list-item input[type="checkbox"] {
      margin: 0.25em 0.6em 0 0;
      cursor: default;
      accent-color: var(--link-color);
      transform: scale(1.1);
    }

    /* Code Blocks */
    .code-card {
      margin: 16px 0 24px 0;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      background-color: var(--code-bg);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .code-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 14px;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'};
      border-bottom: 1px solid var(--border-color);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      color: ${isDark ? '#8b949e' : '#656d76'};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .code-card pre.shiki {
      margin: 0 !important;
      padding: 16px !important;
      border-radius: 0 !important;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      font-size: 13.5px !important;
      line-height: 1.55 !important;
      overflow-x: auto;
      background-color: transparent !important;
    }

    code:not(pre code) {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 85%;
      padding: 0.2em 0.4em;
      margin: 0;
      background-color: ${isDark ? 'rgba(110,118,129,0.4)' : 'rgba(175,184,193,0.2)'};
      border-radius: 4px;
    }

    /* Tables */
    table {
      border-spacing: 0;
      border-collapse: collapse;
      margin-top: 0;
      margin-bottom: 16px;
      width: 100%;
      overflow: auto;
      display: block;
      border: 1px solid var(--border-color);
      border-radius: 6px;
    }

    table th, table td {
      padding: 8px 14px;
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
    }

    table th:last-child, table td:last-child {
      border-right: none;
    }

    table th {
      font-weight: 600;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'};
      color: var(--heading-color);
      border-top: none;
    }

    table tr:nth-child(2n) {
      background-color: var(--table-row-alt);
    }

    /* Blockquotes */
    blockquote {
      margin: 16px 0;
      padding: 0 1em;
      color: ${isDark ? '#8b949e' : '#656d76'};
      border-left: 0.25em solid var(--border-color);
    }

    /* GitHub Alerts */
    .markdown-alert {
      padding: 12px 16px;
      margin-bottom: 18px;
      color: inherit;
      border-left: 4px solid var(--border-color);
      background-color: ${isDark ? 'rgba(110,118,129,0.1)' : 'rgba(175,184,193,0.1)'};
      border-radius: 0 6px 6px 0;
    }

    .markdown-alert-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 6px;
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

    .markdown-alert-note {
      border-left-color: var(--alert-note-border);
    }
    .markdown-alert-note .markdown-alert-title {
      color: var(--alert-note-text);
    }

    .markdown-alert-tip {
      border-left-color: var(--alert-tip-border);
    }
    .markdown-alert-tip .markdown-alert-title {
      color: var(--alert-tip-text);
    }

    .markdown-alert-important {
      border-left-color: var(--alert-important-border);
    }
    .markdown-alert-important .markdown-alert-title {
      color: var(--alert-important-text);
    }

    .markdown-alert-warning {
      border-left-color: var(--alert-warning-border);
    }
    .markdown-alert-warning .markdown-alert-title {
      color: var(--alert-warning-text);
    }

    .markdown-alert-caution {
      border-left-color: var(--alert-caution-border);
    }
    .markdown-alert-caution .markdown-alert-title {
      color: var(--alert-caution-text);
    }

    /* Mermaid Container */
    .mermaid-container {
      margin: 20px 0 24px 0;
      padding: 20px;
      background-color: ${isDark ? '#161b22' : '#f6f8fa'};
      border: 1px solid var(--border-color);
      border-radius: 8px;
      text-align: center;
      overflow-x: auto;
    }

    .mermaid {
      display: flex;
      justify-content: center;
    }

    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: var(--border-color);
      border: 0;
    }
  `;
}

export async function renderMarkdownToHtml(markdown: string, theme: Theme = 'dark'): Promise<string> {
  const highlighter = await getHighlighter();
  const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight: (code: string, lang: string) => {
      if (lang === 'mermaid') {
        return `<div class="mermaid-container"><div class="mermaid">${code.trim()}</div></div>`;
      }

      const normalizedLang = lang.trim().toLowerCase();
      const safeLang = highlighter.getLoadedLanguages().includes(normalizedLang)
        ? normalizedLang
        : 'text';

      const highlightedCode = highlighter.codeToHtml(code, {
        lang: safeLang,
        theme: shikiTheme,
      });

      const displayLang = normalizedLang || 'text';

      return `
        <div class="code-card">
          <div class="code-card-header">
            <span>${displayLang}</span>
          </div>
          ${highlightedCode}
        </div>
      `;
    },
  });

  md.use(taskLists, { enabled: true });
  md.use(githubAlertsPlugin);

  const renderedContent = md.render(markdown);
  const styles = getThemeStyles(theme);

  const localMermaid = getMermaidBundle();
  const mermaidScriptTag = localMermaid
    ? `<script>${localMermaid}</script>`
    : `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`;

  const mermaidTheme = theme === 'dark' ? 'dark' : 'default';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Implementation Plan</title>
  <style>
    ${styles}
  </style>
</head>
<body>
  <div class="plan-container">
    ${renderedContent}
  </div>
  ${mermaidScriptTag}
  <script>
    if (window.mermaid) {
      mermaid.initialize({
        startOnLoad: true,
        theme: '${mermaidTheme}',
        securityLevel: 'loose',
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
  </script>
</body>
</html>`;
}
