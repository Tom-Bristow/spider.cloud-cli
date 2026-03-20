import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { executeCommand } from '../../core/handler.js';

export const searchCommand: CommandDefinition = {
  name: 'spider_search',
  group: 'search',
  subcommand: 'run',
  description: 'Search the web and optionally crawl results',

  inputSchema: z.object({
    search: z.string().min(1),
    return_format: z.string().optional(),
    limit: z.coerce.number().int().min(1).optional(),
    fetch_page_content: z.boolean().optional(),
    num: z.coerce.number().int().min(1).optional(),
  }),

  cliMappings: {
    args: [
      { field: 'search', name: 'query', required: true },
    ],
    options: [
      { field: 'return_format', flags: '-f, --return-format <format>', description: 'Output format: markdown, raw, text, html' },
      { field: 'limit', flags: '-l, --limit <number>', description: 'Max results to return' },
      { field: 'fetch_page_content', flags: '--fetch-content', description: 'Fetch page content for each result' },
      { field: 'num', flags: '-n, --num <number>', description: 'Number of search results' },
    ],
  },

  endpoint: {
    method: 'POST',
    path: '/v1/search',
  },

  fieldMappings: {
    search: 'body',
    return_format: 'body',
    limit: 'body',
    fetch_page_content: 'body',
    num: 'body',
  },

  handler: async (input, client) => {
    return executeCommand(searchCommand, input, client);
  },
};
