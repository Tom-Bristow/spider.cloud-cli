import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const scrapeCommand: CommandDefinition = {
  name: 'spider_scrape',
  group: 'scrape',
  subcommand: 'run',
  description: 'Scrape a single page and extract its content',

  inputSchema: z.object({
    url: z.string().min(1),
    return_format: z.string().optional(),
    readability: z.boolean().optional(),
    proxy_enabled: z.boolean().optional(),
    metadata: z.boolean().optional(),
    request: z.enum(['http', 'chrome', 'smart']).optional(),
  }),

  cliMappings: {
    args: [
      { field: 'url', name: 'url', required: true },
    ],
    options: [
      { field: 'return_format', flags: '-f, --return-format <format>', description: 'Output format: markdown, raw, text, html, bytes' },
      { field: 'readability', flags: '--readability', description: 'Use readability for cleaner output' },
      { field: 'proxy_enabled', flags: '--proxy', description: 'Enable proxy' },
      { field: 'metadata', flags: '--metadata', description: 'Include page metadata' },
      { field: 'request', flags: '-r, --request <type>', description: 'Request type: http, chrome, smart' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/v1/scrape',
  },

  fieldMappings: {
    url: 'body',
    return_format: 'body',
    readability: 'body',
    proxy_enabled: 'body',
    metadata: 'body',
    request: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(scrapeCommand, input, client);
  },
};
