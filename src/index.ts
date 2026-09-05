#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { exportPlan, closeBrowser } from './exporter.js';
import type { ExportPlanOptions, ExportFormat, Theme } from './types.js';

export async function runMcpServer() {
  const server = new Server(
    {
      name: 'plan-export-mcp',
      version: '0.1.0',
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

    const args = (request.params.arguments || {}) as Record<string, any>;
    const input = args.input as string;

    if (!input) {
      throw new McpError(ErrorCode.InvalidParams, 'The "input" parameter is required.');
    }

    const theme = (args.theme as Theme) || 'dark';
    const formats = (args.formats as ExportFormat[]) || ['png', 'pdf'];
    const outputDir = (args.outputDir as string) || './exports';
    const outputName = args.outputName as string | undefined;

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
            text: `Failed to export plan: ${err.message || String(err)}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function runCli(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
plan-export-mcp v0.1.0

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

  const inputFile = args.find((a) => !a.startsWith('-'));
  if (!inputFile) {
    console.error('Error: Please provide a markdown file path or run without arguments for MCP mode.');
    process.exit(1);
  }

  const themeIndex = args.indexOf('--theme');
  const theme = (themeIndex !== -1 && (args[themeIndex + 1] === 'light' ? 'light' : 'dark')) || 'dark';

  const formatsIndex = args.indexOf('--formats');
  const formatsRaw = formatsIndex !== -1 ? args[formatsIndex + 1] : 'png,pdf';
  const formats = formatsRaw.split(',').map((s) => s.trim().toLowerCase()) as ExportFormat[];

  const dirIndex = args.indexOf('--output-dir');
  const outputDir = dirIndex !== -1 ? args[dirIndex + 1] : './exports';

  const nameIndex = args.indexOf('--output-name');
  const outputName = nameIndex !== -1 ? args[nameIndex + 1] : undefined;

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

  await closeBrowser();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runMcpServer();
  } else {
    await runCli(args);
  }
}

main().catch((err) => {
  console.error('Fatal error in plan-export-mcp:', err);
  process.exit(1);
});
