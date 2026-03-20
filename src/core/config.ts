import { readFile, writeFile, rm, mkdir, readdir, copyFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ServiceConfig } from './types.js';

function getConfigDir(): string {
  return join(homedir(), '.spider-cloud');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

function getWorkspacesDir(): string {
  return join(getConfigDir(), 'workspaces');
}

function getWorkspacePath(name: string): string {
  return join(getWorkspacesDir(), `${name}.json`);
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

export async function saveWorkspace(name: string, config: ServiceConfig): Promise<void> {
  const dir = getWorkspacesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getWorkspacePath(name), JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function switchWorkspace(name: string): Promise<ServiceConfig> {
  const wsPath = getWorkspacePath(name);
  const content = await readFile(wsPath, 'utf-8');
  const config: ServiceConfig = JSON.parse(content);
  await saveConfig(config);
  return config;
}

export async function listWorkspaces(): Promise<string[]> {
  try {
    const files = await readdir(getWorkspacesDir());
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export async function removeWorkspace(name: string): Promise<void> {
  try {
    await rm(getWorkspacePath(name));
  } catch {
    // Ignore if doesn't exist
  }
}
