import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const unblockerCommand: CommandDefinition = {
  name: 'spider_unblocker',
  group: 'unblocker',
  subcommand: 'run',
  description: 'Access blocked content using anti-bot bypass',

  inputSchema: z.object({
    url: z.string().min(1),
    return_format: z.string().optional(),
    proxy_enabled: z.boolean().optional(),
    request: z.enum(['http', 'chrome', 'smart']).optional(),
  }),

  cliMappings: {
    args: [
      { field: 'url', name: 'url', required: true },
    ],
    options: [
      { field: 'return_format', flags: '-f, --return-format <format>', description: 'Output format: markdown, raw, text, html' },
      { field: 'proxy_enabled', flags: '--proxy', description: 'Enable proxy' },
      { field: 'request', flags: '-r, --request <type>', description: 'Request type: http, chrome, smart' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/v1/unblocker',
  },

  fieldMappings: {
    url: 'body',
    return_format: 'body',
    proxy_enabled: 'body',
    request: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(unblockerCommand, input, client);
  },
};
