#!/usr/bin/env node

// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/core/config.ts
import { readFile, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
function getConfigDir() {
  return join(homedir(), ".spider-cloud");
}
function getConfigPath() {
  return join(getConfigDir(), "config.json");
}
async function loadConfig() {
  try {
    const content = await readFile(getConfigPath(), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// src/core/errors.ts
var ServiceError = class extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
};
var AuthError = class extends ServiceError {
  constructor(message = "Authentication failed") {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
};
var NotFoundError = class extends ServiceError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends ServiceError {
  constructor(message = "Validation failed") {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
};
var RateLimitError = class extends ServiceError {
  constructor(message = "Rate limit exceeded") {
    super(message, "RATE_LIMIT");
    this.name = "RateLimitError";
  }
};
var ServerError = class extends ServiceError {
  constructor(message = "Server error") {
    super(message, "SERVER_ERROR");
    this.name = "ServerError";
  }
};

// src/core/auth.ts
async function resolveApiKey(flagKey) {
  if (flagKey) return flagKey;
  const envKey = process.env.SPIDER_API_KEY;
  if (envKey) return envKey;
  const config = await loadConfig();
  if (config?.api_key) return config.api_key;
  throw new AuthError(
    "No API key found. Run: spider login"
  );
}

// src/core/client.ts
var SpiderCloudClient = class {
  apiKey;
  baseUrl;
  constructor(opts) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.spider.cloud";
  }
  async request(opts) {
    const maxRetries = 3;
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.doRequest(opts);
      } catch (error) {
        lastError = error;
        if (error instanceof AuthError || error instanceof ValidationError || error instanceof NotFoundError) {
          throw error;
        }
        if (error instanceof RateLimitError || error instanceof ServerError) {
          const delay = Math.min(1e3 * Math.pow(2, attempt), 1e4);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
  async doRequest(opts) {
    let url = `${this.baseUrl}${opts.path}`;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== void 0 && value !== null) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const response = await fetch(url, {
        method: opts.method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "spider-cloud-cli/0.1.0"
        },
        body: opts.body ? JSON.stringify(opts.body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.status === 401 || response.status === 403) {
        throw new AuthError("Authentication failed. Check your API key.");
      }
      if (response.status === 404) {
        throw new NotFoundError(`Not found: ${opts.path}`);
      }
      if (response.status === 422) {
        const body = await response.json().catch(() => ({}));
        throw new ValidationError(JSON.stringify(body));
      }
      if (response.status === 429) {
        throw new RateLimitError("Rate limited");
      }
      if (response.status >= 500) {
        throw new ServerError(`Server error: ${response.status}`);
      }
      if (response.status === 204) return { success: true };
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        throw new Error("Request timed out after 30s");
      }
      throw error;
    }
  }
  async get(path, query) {
    return this.request({ method: "GET", path, query });
  }
  async post(path, body) {
    return this.request({ method: "POST", path, body });
  }
  async put(path, body) {
    return this.request({ method: "PUT", path, body });
  }
  async patch(path, body) {
    return this.request({ method: "PATCH", path, body });
  }
  async delete(path) {
    return this.request({ method: "DELETE", path });
  }
};

// src/commands/crawl/crawl.ts
import { z } from "zod";

// src/core/handler.ts
async function executeCommand(cmdDef, input, client) {
  let path = cmdDef.endpoint.path;
  const query = {};
  const body = {};
  for (const [field, location] of Object.entries(cmdDef.fieldMappings)) {
    const value = input[field];
    if (value === void 0 || value === null) continue;
    switch (location) {
      case "path":
        path = path.replace(`{${field}}`, encodeURIComponent(String(value)));
        break;
      case "query":
        query[field] = value;
        break;
      case "body":
        body[field] = value;
        break;
    }
  }
  return client.request({
    method: cmdDef.endpoint.method,
    path,
    query: Object.keys(query).length > 0 ? query : void 0,
    body: Object.keys(body).length > 0 ? body : void 0
  });
}

// src/commands/crawl/crawl.ts
var crawlCommand = {
  name: "spider_crawl",
  group: "crawl",
  subcommand: "run",
  description: "Crawl a website and extract content from multiple pages",
  inputSchema: z.object({
    url: z.string().min(1),
    return_format: z.string().optional(),
    limit: z.coerce.number().int().min(0).optional(),
    depth: z.coerce.number().int().min(0).optional(),
    readability: z.boolean().optional(),
    subdomains: z.boolean().optional(),
    proxy_enabled: z.boolean().optional(),
    metadata: z.boolean().optional(),
    request: z.enum(["http", "chrome", "smart"]).optional()
  }),
  cliMappings: {
    args: [
      { field: "url", name: "url", required: true }
    ],
    options: [
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, raw, text, html, bytes" },
      { field: "limit", flags: "-l, --limit <number>", description: "Max pages to crawl" },
      { field: "depth", flags: "-d, --depth <number>", description: "Max crawl depth" },
      { field: "readability", flags: "--readability", description: "Use readability for cleaner output" },
      { field: "subdomains", flags: "--subdomains", description: "Include subdomains" },
      { field: "proxy_enabled", flags: "--proxy", description: "Enable proxy" },
      { field: "metadata", flags: "--metadata", description: "Include page metadata" },
      { field: "request", flags: "-r, --request <type>", description: "Request type: http, chrome, smart" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/crawl"
  },
  fieldMappings: {
    url: "body",
    return_format: "body",
    limit: "body",
    depth: "body",
    readability: "body",
    subdomains: "body",
    proxy_enabled: "body",
    metadata: "body",
    request: "body"
  },
  handler: async (input, client) => {
    return executeCommand(crawlCommand, input, client);
  }
};

// src/commands/scrape/scrape.ts
import { z as z2 } from "zod";
var scrapeCommand = {
  name: "spider_scrape",
  group: "scrape",
  subcommand: "run",
  description: "Scrape a single page and extract its content",
  inputSchema: z2.object({
    url: z2.string().min(1),
    return_format: z2.string().optional(),
    readability: z2.boolean().optional(),
    proxy_enabled: z2.boolean().optional(),
    metadata: z2.boolean().optional(),
    request: z2.enum(["http", "chrome", "smart"]).optional()
  }),
  cliMappings: {
    args: [
      { field: "url", name: "url", required: true }
    ],
    options: [
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, raw, text, html, bytes" },
      { field: "readability", flags: "--readability", description: "Use readability for cleaner output" },
      { field: "proxy_enabled", flags: "--proxy", description: "Enable proxy" },
      { field: "metadata", flags: "--metadata", description: "Include page metadata" },
      { field: "request", flags: "-r, --request <type>", description: "Request type: http, chrome, smart" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/scrape"
  },
  fieldMappings: {
    url: "body",
    return_format: "body",
    readability: "body",
    proxy_enabled: "body",
    metadata: "body",
    request: "body"
  },
  handler: async (input, client) => {
    return executeCommand(scrapeCommand, input, client);
  }
};

// src/commands/search/search.ts
import { z as z3 } from "zod";
var searchCommand = {
  name: "spider_search",
  group: "search",
  subcommand: "run",
  description: "Search the web and optionally crawl results",
  inputSchema: z3.object({
    search: z3.string().min(1),
    return_format: z3.string().optional(),
    limit: z3.coerce.number().int().min(1).optional(),
    fetch_page_content: z3.boolean().optional(),
    num: z3.coerce.number().int().min(1).optional()
  }),
  cliMappings: {
    args: [
      { field: "search", name: "query", required: true }
    ],
    options: [
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, raw, text, html" },
      { field: "limit", flags: "-l, --limit <number>", description: "Max results to return" },
      { field: "fetch_page_content", flags: "--fetch-content", description: "Fetch page content for each result" },
      { field: "num", flags: "-n, --num <number>", description: "Number of search results" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/search"
  },
  fieldMappings: {
    search: "body",
    return_format: "body",
    limit: "body",
    fetch_page_content: "body",
    num: "body"
  },
  handler: async (input, client) => {
    return executeCommand(searchCommand, input, client);
  }
};

// src/commands/links/links.ts
import { z as z4 } from "zod";
var linksCommand = {
  name: "spider_links",
  group: "links",
  subcommand: "run",
  description: "Extract links from a webpage",
  inputSchema: z4.object({
    url: z4.string().min(1),
    return_format: z4.string().optional(),
    limit: z4.coerce.number().int().min(0).optional(),
    depth: z4.coerce.number().int().min(0).optional(),
    subdomains: z4.boolean().optional(),
    proxy_enabled: z4.boolean().optional(),
    request: z4.enum(["http", "chrome", "smart"]).optional()
  }),
  cliMappings: {
    args: [
      { field: "url", name: "url", required: true }
    ],
    options: [
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, raw, text, html" },
      { field: "limit", flags: "-l, --limit <number>", description: "Max links to extract" },
      { field: "depth", flags: "-d, --depth <number>", description: "Max crawl depth" },
      { field: "subdomains", flags: "--subdomains", description: "Include subdomains" },
      { field: "proxy_enabled", flags: "--proxy", description: "Enable proxy" },
      { field: "request", flags: "-r, --request <type>", description: "Request type: http, chrome, smart" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/links"
  },
  fieldMappings: {
    url: "body",
    return_format: "body",
    limit: "body",
    depth: "body",
    subdomains: "body",
    proxy_enabled: "body",
    request: "body"
  },
  handler: async (input, client) => {
    return executeCommand(linksCommand, input, client);
  }
};

// src/commands/screenshot/screenshot.ts
import { z as z5 } from "zod";
var screenshotCommand = {
  name: "spider_screenshot",
  group: "screenshot",
  subcommand: "run",
  description: "Take a screenshot of a webpage",
  inputSchema: z5.object({
    url: z5.string().min(1),
    proxy_enabled: z5.boolean().optional(),
    request: z5.enum(["http", "chrome", "smart"]).optional(),
    viewport: z5.string().optional()
  }),
  cliMappings: {
    args: [
      { field: "url", name: "url", required: true }
    ],
    options: [
      { field: "proxy_enabled", flags: "--proxy", description: "Enable proxy" },
      { field: "request", flags: "-r, --request <type>", description: "Request type: http, chrome, smart" },
      { field: "viewport", flags: "--viewport <size>", description: "Viewport size (e.g. 1280x720)" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/screenshot"
  },
  fieldMappings: {
    url: "body",
    proxy_enabled: "body",
    request: "body",
    viewport: "body"
  },
  handler: async (input, client) => {
    return executeCommand(screenshotCommand, input, client);
  }
};

// src/commands/transform/transform.ts
import { z as z6 } from "zod";
var transformCommand = {
  name: "spider_transform",
  group: "transform",
  subcommand: "run",
  description: "Transform HTML content to markdown or text",
  inputSchema: z6.object({
    data: z6.string().min(1),
    return_format: z6.string().optional(),
    readability: z6.boolean().optional()
  }),
  cliMappings: {
    options: [
      { field: "data", flags: "--data <html>", description: "HTML content to transform" },
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, text" },
      { field: "readability", flags: "--readability", description: "Use readability for cleaner output" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/transform"
  },
  fieldMappings: {
    data: "body",
    return_format: "body",
    readability: "body"
  },
  handler: async (input, client) => {
    return executeCommand(transformCommand, input, client);
  }
};

// src/commands/unblocker/unblocker.ts
import { z as z7 } from "zod";
var unblockerCommand = {
  name: "spider_unblocker",
  group: "unblocker",
  subcommand: "run",
  description: "Access blocked content using anti-bot bypass",
  inputSchema: z7.object({
    url: z7.string().min(1),
    return_format: z7.string().optional(),
    proxy_enabled: z7.boolean().optional(),
    request: z7.enum(["http", "chrome", "smart"]).optional()
  }),
  cliMappings: {
    args: [
      { field: "url", name: "url", required: true }
    ],
    options: [
      { field: "return_format", flags: "-f, --return-format <format>", description: "Output format: markdown, raw, text, html" },
      { field: "proxy_enabled", flags: "--proxy", description: "Enable proxy" },
      { field: "request", flags: "-r, --request <type>", description: "Request type: http, chrome, smart" }
    ]
  },
  endpoint: {
    method: "POST",
    path: "/unblocker"
  },
  fieldMappings: {
    url: "body",
    return_format: "body",
    proxy_enabled: "body",
    request: "body"
  },
  handler: async (input, client) => {
    return executeCommand(unblockerCommand, input, client);
  }
};

// src/commands/credits/credits.ts
import { z as z8 } from "zod";
var creditsCommand = {
  name: "spider_credits",
  group: "credits",
  subcommand: "check",
  description: "Check your Spider Cloud credit balance",
  inputSchema: z8.object({}),
  cliMappings: {},
  endpoint: {
    method: "GET",
    path: "/credits"
  },
  fieldMappings: {},
  handler: async (_input, client) => {
    return client.request({ method: "GET", path: "/credits" });
  }
};

// src/commands/index.ts
var allCommands = [
  crawlCommand,
  scrapeCommand,
  searchCommand,
  linksCommand,
  screenshotCommand,
  transformCommand,
  unblockerCommand,
  creditsCommand
];

// src/mcp/server.ts
async function startMcpServer() {
  const apiKey = await resolveApiKey();
  const client = new SpiderCloudClient({ apiKey });
  const server = new McpServer({
    name: "spider",
    version: "0.1.0"
  });
  for (const cmdDef of allCommands) {
    const shape = cmdDef.inputSchema.shape;
    server.registerTool(
      cmdDef.name,
      {
        description: cmdDef.description,
        inputSchema: shape
      },
      async (args) => {
        try {
          const result = await cmdDef.handler(args, client);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error.message ?? String(error),
                  code: error.code ?? "UNKNOWN_ERROR"
                })
              }
            ],
            isError: true
          };
        }
      }
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Spider Cloud MCP server started. Tools registered: ${allCommands.length}`);
}

// src/mcp.ts
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
startMcpServer().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
//# sourceMappingURL=mcp.js.map