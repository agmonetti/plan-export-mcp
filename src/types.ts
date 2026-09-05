export type Theme = 'dark' | 'light';
export type ExportFormat = 'pdf' | 'png' | 'html';

export interface ExportPlanOptions {
  /** File path to markdown or raw markdown content */
  input: string;
  /** Visual theme. Default: "dark" */
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
