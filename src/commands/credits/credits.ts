import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';

export const creditsCommand: CommandDefinition = {
  name: 'spider_credits',
  group: 'credits',
  subcommand: 'check',
  description: 'Check your Spider Cloud credit balance',

  inputSchema: z.object({}),

  cliMappings: {},

  endpoint: {
    method: 'GET',
    path: '/v1/credits',
  },

  fieldMappings: {},

  handler: async (_input, client) => {
    return client.request({ method: 'GET', path: '/v1/credits' });
  },
};
