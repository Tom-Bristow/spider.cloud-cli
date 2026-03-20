import { Command } from 'commander';
import { resolveApiKey } from '../core/auth.js';
import { SpiderCloudClient } from '../core/client.js';
import { executeCommand } from '../core/handler.js';
import { output, outputError } from '../core/output.js';
import { formatError } from '../core/errors.js';
import { registerLoginCommand } from './auth/login.js';
import { registerLogoutCommand } from './auth/logout.js';
import { registerMcpCommand } from './mcp/index.js';
import type { CommandDefinition, GlobalOptions } from '../core/types.js';

import { crawlCommand } from './crawl/crawl.js';
import { scrapeCommand } from './scrape/scrape.js';
import { searchCommand } from './search/search.js';
import { linksCommand } from './links/links.js';
import { screenshotCommand } from './screenshot/screenshot.js';
import { transformCommand } from './transform/transform.js';
import { unblockerCommand } from './unblocker/unblocker.js';
import { creditsCommand } from './credits/credits.js';

export const allCommands: CommandDefinition[] = [
  crawlCommand,
  scrapeCommand,
  searchCommand,
  linksCommand,
  screenshotCommand,
  transformCommand,
  unblockerCommand,
  creditsCommand,
];

export function registerAllCommands(program: Command): void {
  registerLoginCommand(program);
  registerLogoutCommand(program);
  registerMcpCommand(program);

  const groups: Record<string, Command> = {};

  for (const cmdDef of allCommands) {
    if (!groups[cmdDef.group]) {
      groups[cmdDef.group] = program
        .command(cmdDef.group)
        .description(`Manage ${cmdDef.group}`);
    }

    const sub = groups[cmdDef.group]
      .command(cmdDef.subcommand)
      .description(cmdDef.description);

    if (cmdDef.cliMappings.args) {
      for (const arg of cmdDef.cliMappings.args) {
        const name = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
        sub.argument(name, arg.field);
      }
    }

    if (cmdDef.cliMappings.options) {
      for (const opt of cmdDef.cliMappings.options) {
        sub.option(opt.flags, opt.description ?? '');
      }
    }

    sub.action(async (...args: any[]) => {
      const globalOpts = program.opts() as GlobalOptions;

      try {
        const apiKey = await resolveApiKey(globalOpts.apiKey);
        const client = new SpiderCloudClient({ apiKey });

        const rawOpts = args[args.length - 2];
        const input: Record<string, unknown> = { ...rawOpts };

        if (cmdDef.cliMappings.args) {
          cmdDef.cliMappings.args.forEach((arg, i) => {
            if (args[i] !== undefined) {
              input[arg.field] = args[i];
            }
          });
        }

        const validated = cmdDef.inputSchema.parse(input);
        const result = await cmdDef.handler(validated, client);
        output(result, globalOpts);
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
  }
}
