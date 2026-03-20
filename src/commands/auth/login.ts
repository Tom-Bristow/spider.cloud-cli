import { Command } from 'commander';
import { SpiderCloudClient } from '../../core/client.js';
import { saveConfig } from '../../core/config.js';
import { output, outputError } from '../../core/output.js';
import type { GlobalOptions } from '../../core/types.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with your Spider Cloud API key')
    .option('--api-key <key>', 'API key (skips interactive prompt)')
    .action(async (opts) => {
      const globalOpts = program.opts() as GlobalOptions;

      try {
        let apiKey = opts.apiKey || process.env.SPIDER_API_KEY;

        if (!apiKey) {
          if (!process.stdin.isTTY) {
            outputError(
              new Error('No API key provided. Use --api-key or set SPIDER_API_KEY'),
              globalOpts,
            );
            return;
          }

          console.log('Get your API key from: https://spider.cloud/credentials\n');

          const { password } = await import('@inquirer/prompts');
          apiKey = await password({
            message: 'Enter your API key:',
            mask: '*',
          });
        }

        if (!apiKey) {
          outputError(new Error('No API key provided'), globalOpts);
          return;
        }

        const client = new SpiderCloudClient({ apiKey });

        if (process.stdin.isTTY) {
          console.log('Validating API key...');
        }

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

        await saveConfig({ api_key: apiKey });

        if (process.stdin.isTTY) {
          console.log('\nAuthenticated successfully!');
          console.log('Config saved to ~/.spider-cloud/config.json');
        } else {
          output({ status: 'authenticated', config_path: '~/.spider-cloud/config.json' }, globalOpts);
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
}
