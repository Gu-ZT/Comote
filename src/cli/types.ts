export type CliFlags = Record<string, any>;
export type CliEnvironment = NodeJS.ProcessEnv;

export interface ParsedArgs {
  path: string[];
  flags: CliFlags;
  positionals: string[];
  pairs: Record<string, string>;
}

export type CliWrite = (text: string) => void;

export interface CliClient {
  baseUrl?: string;
  hasToken?: boolean;
  get(path: string): Promise<any>;
  post(path: string, body?: unknown): Promise<any>;
  put(path: string, body?: unknown): Promise<any>;
  del(path: string): Promise<any>;
  request?(method: string, path: string, body?: unknown): Promise<any>;
}

export interface CliTableOptions {
  head?: unknown[] | null;
  gap?: number;
}

export interface CliRenderer {
  useColor: boolean;
  json: boolean;
  bold(text: unknown): string;
  dim(text: unknown): string;
  red(text: unknown): string;
  green(text: unknown): string;
  yellow(text: unknown): string;
  cyan(text: unknown): string;
  state(text: unknown): string;
  table(rows: unknown[][], options?: CliTableOptions): string;
  keyval(pairs: unknown[] | Record<string, unknown>, options?: { gap?: number }): string;
  osc8(url: string, label?: string): string;
  jsonText(value: unknown): string;
}

export interface CliCommandContext {
  command?: string;
  parsed: ParsedArgs;
  client: CliClient;
  env: CliEnvironment;
  write: CliWrite;
}

export interface CliDependencies {
  write?: CliWrite;
  writeErr?: CliWrite;
  loadCommand?: (moduleFile: string) => Promise<any>;
  client?: CliClient;
  fetch?: (...args: any[]) => Promise<any>;
  env?: CliEnvironment;
}
