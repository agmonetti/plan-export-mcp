#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'node:util';
import { exportPlan, renderDiagram, closeBrowser } from './exporter.js';
import type { ExportPlanOptions, ExportFormat, Theme } from './types.js';
import { z } from 'zod';
import { performGracefulShutdown, setupShutdownHandlers, gracefulExit } from './shutdown.js';

// Public API Re-exports
export type {
  ExportPlanOptions,
  ExportResult,
  Theme,
  ExportFormat,
  DiagramFormat,
  RenderDiagramOptions,
  RenderDiagramResult,
} from './types.js';
export { ExportService, defaultExportService, exportPlan, renderDiagram, closeBrowser, getBrowser } from './exporter.js';
export { renderMarkdownToHtml, renderDiagramToHtml } from './renderer.js';
export { ExportError, SecurityError, BrowserError } from './errors.js';
export { CONFIG } from './config.js';
export { performGracefulShutdown, setupShutdownHandlers, gracefulExit } from './shutdown.js';

const ExportPlanSchema = z.object({
  input: z
    .string({ message: 'The "input" parameter is required and must be a string.' })
    .min(1, 'The "input" parameter cannot be empty.'),
  theme: z.enum(['dark', 'light']).default('dark'),
  formats: z
    .array(z.enum(['pdf', 'png', 'html']))
    .min(1, 'At least one export format must be specified.')
    .default(['png', 'pdf']),
  outputDir: z.string().default('./exports'),
  outputName: z.string().optional(),
});

const RenderDiagramSchema = z.object({
  diagram: z
    .string({ message: 'The "diagram" parameter is required and must be a string.' })
    .min(1, 'The "diagram" parameter cannot be empty.'),
  theme: z.enum(['dark', 'light']).default('dark'),
  format: z.enum(['png', 'svg']).default('png'),
  outputDir: z.string().default('./exports'),
  outputName: z.string().optional(),
  includeBase64: z
    .boolean()
    .default(true)
    .describe('If true, returns base64 image data in MCP response for direct chat preview.'),
});

export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const cwd = process.cwd();
  const root = path.parse(cwd).root;

  let sanitized = raw;
  // Strip working directory path references only if not at system root
  if (cwd !== root) {
    sanitized = sanitized.split(cwd).join('.');
  }
  // Strip user home directories in common OS paths to prevent user enumeration
  sanitized = sanitized
    .replace(/\/home\/[a-zA-Z0-9._-]+/g, '/home/[user]')
    .replace(/\/Users\/[a-zA-Z0-9._-]+/g, '/Users/[user]')
    .replace(/[A-Z]:\\Users\\[a-zA-Z0-9._-]+/gi, 'C:\\Users\\[user]');
  return sanitized;
}

export function getPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && typeof pkg.version === 'string') {
        return pkg.version;
      }
    }
  } catch {
    // fallback
  }
  return '0.1.0';
}

export async function runMcpServer() {
  const version = getPackageVersion();
  const server = new Server(
    {
      name: 'plan-export-mcp',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'export_plan',
          description:
            'Export an AI agent implementation plan or audit (Markdown) to styled PDF, high-res PNG, or self-contained HTML matching IDE aesthetics.',
          inputSchema: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description:
                  'Path to the markdown file (relative or absolute) OR raw markdown text content',
              },
              theme: {
                type: 'string',
                enum: ['dark', 'light'],
                description: 'Visual theme: "dark" (GitHub Dark) or "light" (GitHub Light). Default: "dark"',
              },
              formats: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['pdf', 'png', 'html'],
                },
                description: 'List of export formats. Default: ["png", "pdf"]',
              },
              outputDir: {
                type: 'string',
                description: 'Directory where exported files will be saved. Default: "./exports"',
              },
              outputName: {
                type: 'string',
                description:
                  'Base filename for exports without extension. Default: derived from input file or "plan"',
              },
            },
            required: ['input'],
          },
        },
        {
          name: 'render_diagram',
          description:
            'Render an isolated Mermaid diagram (sequence, flowchart, class, architecture, ER) directly to a cropped PNG or SVG file with optional visual preview in chat.',
          inputSchema: {
            type: 'object',
            properties: {
              diagram: {
                type: 'string',
                description:
                  'Raw Mermaid diagram definition code (e.g. "graph TD\\nA-->B" or "sequenceDiagram...")',
              },
              theme: {
                type: 'string',
                enum: ['dark', 'light'],
                description: 'Visual theme: "dark" (GitHub Dark) or "light" (GitHub Light). Default: "dark"',
              },
              format: {
                type: 'string',
                enum: ['png', 'svg'],
                description: 'Output format: "png" (high-res auto-cropped image) or "svg" (vector XML). Default: "png"',
              },
              outputDir: {
                type: 'string',
                description: 'Directory where exported diagram file will be saved. Default: "./exports"',
              },
              outputName: {
                type: 'string',
                description: 'Base filename for the diagram without extension. Default: "diagram-<timestamp>"',
              },
              includeBase64: {
                type: 'boolean',
                description:
                  'Whether to include base64 image data in MCP response for direct visual rendering in chat. Default: true',
              },
            },
            required: ['diagram'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'render_diagram') {
      const parseResult = RenderDiagramSchema.safeParse(request.params.arguments || {});
      if (!parseResult.success) {
        const errorMsg = parseResult.error.issues.map((i) => i.message).join('; ');
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Invalid parameters: ${errorMsg}`,
            },
          ],
        };
      }

      const { diagram, theme, format, outputDir, outputName, includeBase64 } = parseResult.data;

      try {
        const result = await renderDiagram({
          diagram,
          theme,
          format,
          outputDir,
          outputName,
          includeBase64,
        });

        const content: Array<
          | { type: 'text'; text: string }
          | { type: 'image'; data: string; mimeType: string }
        > = [
          {
            type: 'text',
            text: `Diagram rendered successfully (${theme} theme):\n- **${result.format.toUpperCase()}**: \`${result.path}\``,
          },
        ];

        if (result.format === 'png' && result.base64) {
          content.push({
            type: 'image',
            data: result.base64,
            mimeType: 'image/png',
          });
        } else if (result.format === 'svg' && result.svgContent) {
          content.push({
            type: 'text',
            text: `\`\`\`xml\n${result.svgContent}\n\`\`\``,
          });
        }

        return { content };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to render diagram: ${sanitizeErrorMessage(err)}`,
            },
          ],
        };
      }
    }

    if (request.params.name !== 'export_plan') {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const parseResult = ExportPlanSchema.safeParse(request.params.arguments || {});
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join('; ');
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid parameters: ${errorMsg}`,
          },
        ],
      };
    }

    const { input, theme, formats, outputDir, outputName } = parseResult.data;

    try {
      const results = await exportPlan({
        input,
        theme,
        formats,
        outputDir,
        outputName,
      });

      const summary = results.map((r) => `- **${r.format.toUpperCase()}**: \`${r.path}\``).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Plan exported successfully (${theme} theme):\n${summary}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to export plan: ${sanitizeErrorMessage(err)}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();

  const handleDisconnect = async () => {
    await performGracefulShutdown(0, server);
  };

  process.stdin.once('end', handleDisconnect);
  process.stdin.once('close', handleDisconnect);
  setupShutdownHandlers(server);

  await server.connect(transport);
}

export async function runCli(args: string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        theme: { type: 'string', default: 'dark' },
        formats: { type: 'string', default: 'png,pdf' },
        'output-dir': { type: 'string', default: './exports' },
        'output-name': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
    });
  } catch (err: any) {
    console.error(`Error: ${sanitizeErrorMessage(err)}`);
    gracefulExit(1);
    return;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    const v = getPackageVersion();
    console.log(`
plan-export-mcp v${v}

Usage:
  npx plan-export-mcp <file.md> [options]    Run as CLI
  npx plan-export-mcp                       Run as MCP stdio server

Options:
  --theme <dark|light>      Theme to use (default: dark)
  --formats <formats>       Comma-separated formats: png,pdf,html (default: png,pdf)
  --output-dir <dir>        Output directory (default: ./exports)
  --output-name <name>      Base filename without extension
  -h, --help                Show this help message
`);
    return;
  }

  const inputFile = positionals[0];
  if (!inputFile) {
    console.error('Error: Please provide a markdown file path or run without arguments for MCP mode.');
    gracefulExit(1);
    return;
  }

  let theme: Theme = 'dark';
  if (values.theme) {
    const rawTheme = values.theme.toLowerCase();
    if (rawTheme === 'light' || rawTheme === 'dark') {
      theme = rawTheme;
    } else {
      console.error(`Error: Invalid theme "${rawTheme}". Only "dark" or "light" are supported.`);
      gracefulExit(1);
      return;
    }
  }

  const VALID_FORMATS = new Set<string>(['pdf', 'png', 'html']);
  const formatsRaw = values.formats || 'png,pdf';
  const parsedFormats = formatsRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((f) => {
      if (!VALID_FORMATS.has(f)) {
        process.stderr.write(`[plan-export-mcp] Warning: Unknown format "${f}" ignored. Valid: pdf, png, html\n`);
        return false;
      }
      return true;
    }) as ExportFormat[];

  if (parsedFormats.length === 0) {
    console.error('Error: At least one valid export format must be specified (pdf, png, or html).');
    gracefulExit(1);
    return;
  }
  const formats = parsedFormats;

  const outputDir = values['output-dir'] || './exports';
  const outputName = values['output-name'];

  try {
    console.log(`Exporting ${inputFile} (${theme} theme)...`);
    const results = await exportPlan({
      input: inputFile,
      theme,
      formats,
      outputDir,
      outputName,
    });

    console.log('Done!');
    for (const r of results) {
      console.log(`  - [${r.format.toUpperCase()}] ${r.path}`);
    }
  } catch (err: any) {
    console.error(`Error: ${sanitizeErrorMessage(err)}`);
    gracefulExit(1);
  } finally {
    await closeBrowser();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runMcpServer();
  } else {
    await runCli(args);
  }
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const scriptPath = fs.realpathSync(path.resolve(process.argv[1]));
    const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
    return scriptPath === currentPath;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error(`Fatal error in plan-export-mcp: ${sanitizeErrorMessage(err)}`);
    gracefulExit(1);
  });
}
