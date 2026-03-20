import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    mcp: 'src/mcp.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  target: 'node18',
  clean: true,
  splitting: false,
  shims: true,
  sourcemap: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['@inquirer/prompts'],
});
