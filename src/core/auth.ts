import { loadConfig } from './config.js';
import { AuthError } from './errors.js';

export interface AuthContext {
  apiKey: string;
  baseUrl: string;
}

export async function resolveApiKey(flagKey?: string): Promise<string> {
  // 1. --api-key flag (highest priority)
  if (flagKey) return flagKey;

  // 2. Environment variable
  const envKey = process.env.SPIDER_API_KEY;
  if (envKey) return envKey;

  // 3. Config file
  const config = await loadConfig();
  if (config?.api_key) return config.api_key;

  throw new AuthError(
    'No API key found. Run: spider login'
  );
}
