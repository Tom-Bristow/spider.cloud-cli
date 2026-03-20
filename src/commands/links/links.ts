import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const linksCommand: CommandDefinition = {
  name: 'spider_links',
  group: 'links',
  subcommand: 'run',
  description: 'Extract links from a webpage',

  inputSchema: z.object({
    url: z.string().min(1),
    return_format: z.string().optional(),
    limit: z.coerce.number().int().min(0).optional(),
    depth: z.coerce.number().int().min(0).optional(),
    subdomains: z.boolean().optional(),
    proxy_enabled: z.boolean().optional(),
    request: z.enum(['http', 'chrome', 'smart']).optional(),
  }),

  cliMappings: {
    args: [
      { field: 'url', name: 'url', required: true },
    ],
    options: [
      { field: 'return_format', flags: '-f, --return-format <format>', description: 'Output format: markdown, raw, text, html' },
      { field: 'limit', flags: '-l, --limit <number>', description: 'Max links to extract' },
      { field: 'depth', flags: '-d, --depth <number>', description: 'Max crawl depth' },
      { field: 'subdomains', flags: '--subdomains', description: 'Include subdomains' },
      { field: 'proxy_enabled', flags: '--proxy', description: 'Enable proxy' },
      { field: 'request', flags: '-r, --request <type>', description: 'Request type: http, chrome, smart' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/v1/links',
  },

  fieldMappings: {
    url: 'body',
    return_format: 'body',
    limit: 'body',
    depth: 'body',
    subdomains: 'body',
    proxy_enabled: 'body',
    request: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(linksCommand, input, client);
  },
};
