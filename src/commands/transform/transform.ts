import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const transformCommand: CommandDefinition = {
  name: 'spider_transform',
  group: 'transform',
  subcommand: 'run',
  description: 'Transform HTML content to markdown or text',

  inputSchema: z.object({
    data: z.string().min(1),
    return_format: z.string().optional(),
    readability: z.boolean().optional(),
  }),

  cliMappings: {
    options: [
      { field: 'data', flags: '--data <html>', description: 'HTML content to transform' },
      { field: 'return_format', flags: '-f, --return-format <format>', description: 'Output format: markdown, text' },
      { field: 'readability', flags: '--readability', description: 'Use readability for cleaner output' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/transform',
  },

  fieldMappings: {
    data: 'body',
    return_format: 'body',
    readability: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(transformCommand, input, client);
  },
};
