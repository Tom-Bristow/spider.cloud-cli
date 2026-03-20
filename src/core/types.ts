import { z } from 'zod';

export interface CliMapping {
  args?: Array<{
    field: string;
    name: string;
    required?: boolean;
  }>;
  options?: Array<{
    field: string;
    flags: string;
    description?: string;
  }>;
}

export interface CommandDefinition<TInput extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string;
  group: string;
  subcommand: string;
  description: string;
  examples?: string[];
  inputSchema: TInput;
  cliMappings: CliMapping;
  endpoint: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
  };
  fieldMappings: Record<string, 'path' | 'query' | 'body'>;
  handler: (input: z.infer<TInput>, client: SpiderClient) => Promise<unknown>;
}

export interface ServiceRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface SpiderClient {
  request(opts: ServiceRequestOptions): Promise<unknown>;
}

export interface ServiceConfig {
  api_key?: string;
}

export interface GlobalOptions {
  pretty?: boolean;
  quiet?: boolean;
  fields?: string;
  apiKey?: string;
  output?: string;
}
