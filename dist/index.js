#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/core/config.ts
import { readFile, writeFile, rm, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
function getConfigDir() {
  return join(homedir(), ".spider-cloud");
}
function getConfigPath() {
  return join(getConfigDir(), "config.json");
}
function getWorkspacesDir() {
  return join(getConfigDir(), "workspaces");
}
function getWorkspacePath(name) {
  return join(getWorkspacesDir(), `${name}.json`);
}
async function loadConfig() {
  try {
    const content = await readFile(getConfigPath(), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function saveConfig(config) {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  const existing = await loadConfig() ?? {};
  const merged = { ...existing, ...config };
  await writeFile(getConfigPath(), JSON.stringify(merged, null, 2), { mode: 384 });
}
async function deleteConfig() {
  try {
    await rm(getConfigPath());
  } catch {
  }
}
async function saveWorkspace(name, config) {
  const dir = getWorkspacesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getWorkspacePath(name), JSON.stringify(config, null, 2), { mode: 384 });
}
async function switchWorkspace(name) {
  const wsPath = getWorkspacePath(name);
  const content = await readFile(wsPath, "utf-8");
  const config = JSON.parse(content);
  await saveConfig(config);
  return config;
}
async function listWorkspaces() {
  try {
    const files = await readdir(getWorkspacesDir());
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}
async function removeWorkspace(name) {
  try {
    await rm(getWorkspacePath(name));
  } catch {
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

// src/core/output.ts
function output(data, opts) {
  if (opts?.quiet) return;
  let result = data;
  if (opts?.fields && typeof data === "object" && data !== null) {
    result = projectFields(data, opts.fields);
  }
  const json = opts?.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
  console.log(json);
}
function outputError(error, opts) {
  if (opts?.quiet) {
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = error?.code ?? "UNKNOWN_ERROR";
  const json = opts?.pretty ? JSON.stringify({ error: message, code }, null, 2) : JSON.stringify({ error: message, code });
  console.error(json);
  process.exitCode = 1;
}
function projectFields(data, fields) {
  const keys = fields.split(",").map((k) => k.trim());
  if (Array.isArray(data)) {
    return data.map((item) => pickKeys(item, keys));
  }
  if (typeof data === "object" && data !== null && "items" in data) {
    const inner = data.items;
    if (Array.isArray(inner)) {
      return { ...data, items: inner.map((item) => pickKeys(item, keys)) };
    }
  }
  return pickKeys(data, keys);
}
function pickKeys(obj, keys) {
  if (typeof obj !== "object" || obj === null) return obj;
  const record = obj;
  const result = {};
  for (const key of keys) {
    if (key in record) result[key] = record[key];
  }
  return result;
}

// src/commands/auth/login.ts
function registerLoginCommand(program2) {
  program2.command("login").description("Authenticate with your Spider Cloud API key").option("--api-key <key>", "API key (skips interactive prompt)").action(async (opts) => {
    const globalOpts = program2.opts();
    try {
      let apiKey = opts.apiKey || process.env.SPIDER_API_KEY;
      if (!apiKey) {
        if (!process.stdin.isTTY) {
          outputError(
            new Error("No API key provided. Use --api-key or set SPIDER_API_KEY"),
            globalOpts
          );
          return;
        }
        console.log("Get your API key from: https://spider.cloud/credentials\n");
        const { password } = await import("@inquirer/prompts");
        apiKey = await password({
          message: "Enter your API key:",
          mask: "*"
        });
      }
      if (!apiKey) {
        outputError(new Error("No API key provided"), globalOpts);
        return;
      }
      const client = new SpiderCloudClient({ apiKey });
      if (process.stdin.isTTY) {
        console.log("Validating API key...");
      }
      try {
        await client.post("/crawl", { url: "https://example.com", limit: 1 });
      } catch (err) {
        if (err?.name === "AuthError") {
          outputError(new Error("Invalid API key"), globalOpts);
        } else {
          outputError(err, globalOpts);
        }
        return;
      }
      await saveConfig({ api_key: apiKey });
      if (process.stdin.isTTY) {
        console.log("\nAuthenticated successfully!");
        console.log("Config saved to ~/.spider-cloud/config.json");
      } else {
        output({ status: "authenticated", config_path: "~/.spider-cloud/config.json" }, globalOpts);
      }
    } catch (error) {
      outputError(error, globalOpts);
    }
  });
}

// src/commands/auth/logout.ts
function registerLogoutCommand(program2) {
  program2.command("logout").description("Remove stored API key and configuration").action(async () => {
    const globalOpts = program2.opts();
    try {
      await deleteConfig();
      const result = { status: "logged_out", message: "Config removed from ~/.spider-cloud/config.json" };
      if (process.stdin.isTTY) {
        console.log("Logged out. Config removed from ~/.spider-cloud/config.json");
      } else {
        output(result, globalOpts);
      }
    } catch (error) {
      outputError(error, globalOpts);
    }
  });
}

// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// src/commands/mcp/index.ts
function registerMcpCommand(program2) {
  program2.command("mcp").description("Start the MCP server for AI assistant integration").action(async () => {
    await startMcpServer();
  });
}

// src/commands/workspace/index.ts
function registerWorkspaceCommands(program2) {
  const ws = program2.command("workspace").description("Manage multiple API key workspaces");
  ws.command("add").description("Save a named workspace").argument("<name>", "Workspace name").option("--api-key <key>", "API key for this workspace").action(async (name, opts) => {
    const globalOpts = program2.opts();
    try {
      let apiKey = opts.apiKey;
      if (!apiKey) {
        if (!process.stdin.isTTY) {
          outputError(new Error("No API key provided. Use --api-key"), globalOpts);
          return;
        }
        const { password } = await import("@inquirer/prompts");
        apiKey = await password({
          message: `Enter API key for workspace "${name}":`,
          mask: "*"
        });
      }
      if (!apiKey) {
        outputError(new Error("No API key provided"), globalOpts);
        return;
      }
      const client = new SpiderCloudClient({ apiKey });
      if (process.stdin.isTTY) console.log("Validating API key...");
      try {
        await client.post("/crawl", { url: "https://example.com", limit: 1 });
      } catch (err) {
        if (err?.name === "AuthError") {
          outputError(new Error("Invalid API key"), globalOpts);
        } else {
          outputError(err, globalOpts);
        }
        return;
      }
      await saveWorkspace(name, { api_key: apiKey });
      if (process.stdin.isTTY) {
        console.log(`
Workspace "${name}" saved.`);
      } else {
        output({ status: "saved", workspace: name }, globalOpts);
      }
    } catch (error) {
      outputError(error, globalOpts);
    }
  });
  ws.command("switch").description("Switch to a named workspace").argument("<name>", "Workspace name").action(async (name) => {
    const globalOpts = program2.opts();
    try {
      await switchWorkspace(name);
      if (process.stdin.isTTY) {
        console.log(`Switched to workspace "${name}".`);
      } else {
        output({ status: "switched", workspace: name }, globalOpts);
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        outputError(new Error(`Workspace "${name}" not found. Run: spider workspace list`), globalOpts);
      } else {
        outputError(error, globalOpts);
      }
    }
  });
  ws.command("list").description("List all saved workspaces").action(async () => {
    const globalOpts = program2.opts();
    try {
      const workspaces = await listWorkspaces();
      const current = await loadConfig();
      if (process.stdin.isTTY) {
        if (workspaces.length === 0) {
          console.log("No workspaces saved. Run: spider workspace add <name>");
        } else {
          console.log("Workspaces:");
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
  ws.command("remove").description("Remove a saved workspace").argument("<name>", "Workspace name").action(async (name) => {
    const globalOpts = program2.opts();
    try {
      await removeWorkspace(name);
      if (process.stdin.isTTY) {
        console.log(`Workspace "${name}" removed.`);
      } else {
        output({ status: "removed", workspace: name }, globalOpts);
      }
    } catch (error) {
      outputError(error, globalOpts);
    }
  });
}

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
function registerAllCommands(program2) {
  registerLoginCommand(program2);
  registerLogoutCommand(program2);
  registerMcpCommand(program2);
  registerWorkspaceCommands(program2);
  const groups = {};
  for (const cmdDef of allCommands) {
    if (!groups[cmdDef.group]) {
      groups[cmdDef.group] = program2.command(cmdDef.group).description(`Manage ${cmdDef.group}`);
    }
    const sub = groups[cmdDef.group].command(cmdDef.subcommand).description(cmdDef.description);
    if (cmdDef.cliMappings.args) {
      for (const arg of cmdDef.cliMappings.args) {
        const name = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
        sub.argument(name, arg.field);
      }
    }
    if (cmdDef.cliMappings.options) {
      for (const opt of cmdDef.cliMappings.options) {
        sub.option(opt.flags, opt.description ?? "");
      }
    }
    sub.action(async (...args) => {
      const globalOpts = program2.opts();
      try {
        const apiKey = await resolveApiKey(globalOpts.apiKey);
        const client = new SpiderCloudClient({ apiKey });
        const rawOpts = args[args.length - 2];
        const input = { ...rawOpts };
        if (cmdDef.cliMappings.args) {
          cmdDef.cliMappings.args.forEach((arg, i) => {
            if (args[i] !== void 0) {
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

// src/index.ts
var program = new Command();
program.name("spider").description("CLI and MCP server for the Spider Cloud API").version("0.1.0").option("--api-key <key>", "Spider Cloud API key").option("--output <format>", "Output format (json or pretty)", "json").option("--pretty", "Pretty-print JSON output").option("--quiet", "Suppress output, exit codes only").option("--fields <fields>", "Comma-separated fields to include");
registerAllCommands(program);
program.parse();
//# sourceMappingURL=index.js.map