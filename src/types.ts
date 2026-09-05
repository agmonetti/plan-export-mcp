export type Theme = 'dark' | 'light';
export type ExportFormat = 'pdf' | 'png' | 'html';

export interface ExportPlanOptions {
  /** File path to markdown or raw markdown content */
  input: string;
  /** Visual theme. Default: "light" */
  theme?: Theme;
  /** Formats to export. Default: ["png", "pdf"] */
  formats?: ExportFormat[];
  /** Target output directory. Default: "./exports" */
  outputDir?: string;
  /** Base filename without extension. Default: derived from input file or "plan" */
  outputName?: string;
}

export interface ExportResult {
  format: ExportFormat;
  path: string;
}

export type DiagramFormat = 'png' | 'svg';

export interface RenderDiagramOptions {
  /** Mermaid diagram syntax definition */
  diagram: string;
  /** Visual theme. Default: "light" */
  theme?: Theme;
  /** Export format. Default: "png" */
  format?: DiagramFormat;
  /** Target output directory. Default: "./exports" */
  outputDir?: string;
  /** Base filename without extension. Default: "diagram-<timestamp>" */
  outputName?: string;
  /** If true, returns base64 data for visual preview. Default: true */
  includeBase64?: boolean;
}

export interface RenderDiagramResult {
  format: DiagramFormat;
  path: string;
  base64?: string;
  svgContent?: string;
}
