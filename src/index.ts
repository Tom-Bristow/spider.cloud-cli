import { Command } from 'commander';
import { registerAllCommands } from './commands/index.js';

const program = new Command();

program
  .name('spider')
  .description('CLI and MCP server for the Spider Cloud API')
  .version('0.1.0')
  .option('--api-key <key>', 'Spider Cloud API key')
  .option('--output <format>', 'Output format (json or pretty)', 'json')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--quiet', 'Suppress output, exit codes only')
  .option('--fields <fields>', 'Comma-separated fields to include');

registerAllCommands(program);

program.parse();
