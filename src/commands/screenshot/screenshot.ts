import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const screenshotCommand: CommandDefinition = {
  name: 'spider_screenshot',
  group: 'screenshot',
  subcommand: 'run',
  description: 'Take a screenshot of a webpage',

  inputSchema: z.object({
    url: z.string().min(1),
    proxy_enabled: z.boolean().optional(),
    request: z.enum(['http', 'chrome', 'smart']).optional(),
    viewport: z.string().optional(),
  }),

  cliMappings: {
    args: [
      { field: 'url', name: 'url', required: true },
    ],
    options: [
      { field: 'proxy_enabled', flags: '--proxy', description: 'Enable proxy' },
      { field: 'request', flags: '-r, --request <type>', description: 'Request type: http, chrome, smart' },
      { field: 'viewport', flags: '--viewport <size>', description: 'Viewport size (e.g. 1280x720)' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/screenshot',
  },

  fieldMappings: {
    url: 'body',
    proxy_enabled: 'body',
    request: 'body',
    viewport: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(screenshotCommand, input, client);
  },
};
