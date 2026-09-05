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
import { exportPlan, closeBrowser } from './exporter.js';
import type { ExportPlanOptions, ExportFormat, Theme } from './types.js';
import { z } from 'zod';

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
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    try {
      await closeBrowser();
      await server.close();
    } catch {
      // ignore
    } finally {
      process.exit(0);
    }
  };

  process.stdin.on('end', handleDisconnect);
  process.stdin.on('close', handleDisconnect);

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
    process.exit(1);
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
    process.exit(1);
  }

  let theme: Theme = 'dark';
  if (values.theme) {
    const rawTheme = values.theme.toLowerCase();
    if (rawTheme === 'light' || rawTheme === 'dark') {
      theme = rawTheme;
    } else {
      console.error(`Error: Invalid theme "${rawTheme}". Only "dark" or "light" are supported.`);
      process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
  });
}
