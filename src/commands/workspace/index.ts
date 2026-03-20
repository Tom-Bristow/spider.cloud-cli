import { Command } from 'commander';
import { SpiderCloudClient } from '../../core/client.js';
import { saveConfig, saveWorkspace, switchWorkspace, listWorkspaces, removeWorkspace, loadConfig } from '../../core/config.js';
import { output, outputError } from '../../core/output.js';
import type { GlobalOptions } from '../../core/types.js';

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command('workspace')
    .description('Manage multiple API key workspaces');

  ws.command('add')
    .description('Save a named workspace')
    .argument('<name>', 'Workspace name')
    .option('--api-key <key>', 'API key for this workspace')
    .action(async (name: string, opts) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        let apiKey = opts.apiKey;

        if (!apiKey) {
          if (!process.stdin.isTTY) {
            outputError(new Error('No API key provided. Use --api-key'), globalOpts);
            return;
          }
          const { password } = await import('@inquirer/prompts');
          apiKey = await password({
            message: `Enter API key for workspace "${name}":`,
            mask: '*',
          });
        }

        if (!apiKey) {
          outputError(new Error('No API key provided'), globalOpts);
          return;
        }

        const client = new SpiderCloudClient({ apiKey });
        if (process.stdin.isTTY) console.log('Validating API key...');

        try {
          await client.post('/crawl', { url: 'https://example.com', limit: 1 });
        } catch (err: any) {
          if (err?.name === 'AuthError') {
            outputError(new Error('Invalid API key'), globalOpts);
          } else {
            outputError(err, globalOpts);
          }
          return;
        }

        await saveWorkspace(name, { api_key: apiKey });

        if (process.stdin.isTTY) {
          console.log(`\nWorkspace "${name}" saved.`);
        } else {
          output({ status: 'saved', workspace: name }, globalOpts);
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });

  ws.command('switch')
    .description('Switch to a named workspace')
    .argument('<name>', 'Workspace name')
    .action(async (name: string) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        await switchWorkspace(name);
        if (process.stdin.isTTY) {
          console.log(`Switched to workspace "${name}".`);
        } else {
          output({ status: 'switched', workspace: name }, globalOpts);
        }
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          outputError(new Error(`Workspace "${name}" not found. Run: spider workspace list`), globalOpts);
        } else {
          outputError(error, globalOpts);
        }
      }
    });

  ws.command('list')
    .description('List all saved workspaces')
    .action(async () => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const workspaces = await listWorkspaces();
        const current = await loadConfig();

        if (process.stdin.isTTY) {
          if (workspaces.length === 0) {
            console.log('No workspaces saved. Run: spider workspace add <name>');
          } else {
            console.log('Workspaces:');
            for (const name of workspaces) {
              console.log(`  - ${name}`);
            }
          }
        } else {
          output({ workspaces }, globalOpts);
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });

  ws.command('remove')
    .description('Remove a saved workspace')
    .argument('<name>', 'Workspace name')
    .action(async (name: string) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        await removeWorkspace(name);
        if (process.stdin.isTTY) {
          console.log(`Workspace "${name}" removed.`);
        } else {
          output({ status: 'removed', workspace: name }, globalOpts);
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
}
