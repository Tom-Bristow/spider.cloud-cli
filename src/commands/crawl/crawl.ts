import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const crawlCommand: CommandDefinition = {
  name: 'spider_crawl',
  group: 'crawl',
  subcommand: 'run',
  description: 'Crawl a website and extract content from multiple pages',

  inputSchema: z.object({
    url: z.string().min(1),
    return_format: z.string().optional(),
    limit: z.coerce.number().int().min(0).optional(),
    depth: z.coerce.number().int().min(0).optional(),
    readability: z.boolean().optional(),
    subdomains: z.boolean().optional(),
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
      { field: 'limit', flags: '-l, --limit <number>', description: 'Max pages to crawl' },
      { field: 'depth', flags: '-d, --depth <number>', description: 'Max crawl depth' },
      { field: 'readability', flags: '--readability', description: 'Use readability for cleaner output' },
      { field: 'subdomains', flags: '--subdomains', description: 'Include subdomains' },
      { field: 'proxy_enabled', flags: '--proxy', description: 'Enable proxy' },
      { field: 'metadata', flags: '--metadata', description: 'Include page metadata' },
      { field: 'request', flags: '-r, --request <type>', description: 'Request type: http, chrome, smart' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/v1/crawl',
  },

  fieldMappings: {
    url: 'body',
    return_format: 'body',
    limit: 'body',
    depth: 'body',
    readability: 'body',
    subdomains: 'body',
    proxy_enabled: 'body',
    metadata: 'body',
    request: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(crawlCommand, input, client);
  },
};
