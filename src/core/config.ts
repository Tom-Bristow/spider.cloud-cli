import { readFile, writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ServiceConfig } from './types.js';

function getConfigDir(): string {
  return join(homedir(), '.spider-cloud');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export async function loadConfig(): Promise<ServiceConfig | null> {
  try {
    const content = await readFile(getConfigPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function saveConfig(config: ServiceConfig): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  const existing = await loadConfig() ?? {};
  const merged = { ...existing, ...config };
  await writeFile(getConfigPath(), JSON.stringify(merged, null, 2), { mode: 0o600 });
}

export async function deleteConfig(): Promise<void> {
  try {
    await rm(getConfigPath());
  } catch {
    // Ignore if doesn't exist
  }
}
