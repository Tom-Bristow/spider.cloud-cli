import type { ServiceRequestOptions, SpiderClient } from './types.js';
import { AuthError, RateLimitError, NotFoundError, ValidationError, ServerError } from './errors.js';

interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export class SpiderCloudClient implements SpiderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://api.spider.cloud';
  }

  async request(opts: ServiceRequestOptions): Promise<unknown> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.doRequest(opts);
      } catch (error: any) {
        lastError = error;

        if (error instanceof AuthError || error instanceof ValidationError || error instanceof NotFoundError) {
          throw error;
        }

        if (error instanceof RateLimitError || error instanceof ServerError) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  private async doRequest(opts: ServiceRequestOptions): Promise<unknown> {
    let url = `${this.baseUrl}${opts.path}`;

    if (opts.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: opts.method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'spider-cloud-cli/0.1.0',
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 401 || response.status === 403) {
        throw new AuthError('Authentication failed. Check your API key.');
      }
      if (response.status === 404) {
        throw new NotFoundError(`Not found: ${opts.path}`);
      }
      if (response.status === 422) {
        const body = await response.json().catch(() => ({}));
        throw new ValidationError(JSON.stringify(body));
      }
      if (response.status === 429) {
        throw new RateLimitError('Rate limited');
      }
      if (response.status >= 500) {
        throw new ServerError(`Server error: ${response.status}`);
      }

      if (response.status === 204) return { success: true };

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out after 30s');
      }
      throw error;
    }
  }

  async get(path: string, query?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'GET', path, query });
  }

  async post(path: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'POST', path, body });
  }

  async put(path: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'PUT', path, body });
  }

  async patch(path: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'PATCH', path, body });
  }

  async delete(path: string): Promise<unknown> {
    return this.request({ method: 'DELETE', path });
  }
}
