import fs from "fs/promises";
import path from "path";
import os from "os";

const CONFIG_FILE = path.join(process.cwd(), ".agent-config.json");

export interface AgentConfig {
  agentId: string;
  agentName: string;
  authToken: string;
  mongodbUri: string;
  anthropicApiKey: string;
}

/**
 * Load saved config from the local config file.
 * Returns null if no config file exists.
 */
async function loadSavedConfig(): Promise<AgentConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data) as AgentConfig;
  } catch {
    return null;
  }
}

/**
 * Save config to the local config file.
 */
async function saveConfig(config: AgentConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  // Restrict permissions to owner only
  await fs.chmod(CONFIG_FILE, 0o600);
  console.log(`[Bootstrap] Config saved to ${CONFIG_FILE}`);
}

/**
 * Register with the TARS main app using a one-time setup token.
 */
async function registerWithToken(
  tarsUrl: string,
  setupToken: string
): Promise<AgentConfig> {
  console.log(`[Bootstrap] Registering with TARS at ${tarsUrl}...`);

  const response = await fetch(`${tarsUrl}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: setupToken,
      hostname: os.hostname(),
      os: process.platform,
      cpus: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Registration failed (${response.status}): ${(error as { error: string }).error}`
    );
  }

  const data = (await response.json()) as {
    agentId: string;
    agentName: string;
    authToken: string;
    mongodbUri: string;
    anthropicApiKey: string;
  };

  return {
    agentId: data.agentId,
    agentName: data.agentName,
    authToken: data.authToken,
    mongodbUri: data.mongodbUri,
    anthropicApiKey: data.anthropicApiKey,
  };
}

/**
 * Bootstrap the agent server config.
 *
 * Priority:
 * 1. Local config file (.agent-config.json) — from a previous registration
 * 2. TARS_SETUP_TOKEN + TARS_URL — one-time registration flow
 * 3. Manual env vars (MONGODB_URI, ANTHROPIC_API_KEY, etc.) — fallback
 */
export async function bootstrap(): Promise<AgentConfig> {
  // 1. Check for saved config
  const saved = await loadSavedConfig();
  if (saved) {
    console.log(`[Bootstrap] Loaded config for agent: ${saved.agentId}`);
    // Inject into process.env so the rest of the app can use them
    process.env.ANTHROPIC_API_KEY = saved.anthropicApiKey;
    process.env.MONGODB_URI = saved.mongodbUri;
    process.env.AGENT_AUTH_TOKEN = saved.authToken;
    process.env.AGENT_ID = saved.agentId;
    process.env.AGENT_NAME = saved.agentName;
    return saved;
  }

  // 2. One-time setup token registration
  const setupToken = process.env.TARS_SETUP_TOKEN;
  const tarsUrl = process.env.TARS_URL;

  if (setupToken && tarsUrl) {
    const config = await registerWithToken(tarsUrl.replace(/\/$/, ""), setupToken);
    await saveConfig(config);

    // Inject into process.env
    process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    process.env.MONGODB_URI = config.mongodbUri;
    process.env.AGENT_AUTH_TOKEN = config.authToken;
    process.env.AGENT_ID = config.agentId;
    process.env.AGENT_NAME = config.agentName;

    console.log(`[Bootstrap] Registered as: ${config.agentId} (${config.agentName})`);
    return config;
  }

  // 3. Manual env fallback
  if (process.env.MONGODB_URI && process.env.ANTHROPIC_API_KEY && process.env.AGENT_AUTH_TOKEN) {
    console.log("[Bootstrap] Using manual env configuration");
    return {
      agentId: process.env.AGENT_ID ?? `agent-${os.hostname()}`,
      agentName: process.env.AGENT_NAME ?? "TARS Agent",
      authToken: process.env.AGENT_AUTH_TOKEN,
      mongodbUri: process.env.MONGODB_URI,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  throw new Error(
    "No configuration found. Either:\n" +
      "  1. Set TARS_SETUP_TOKEN and TARS_URL for automatic registration\n" +
      "  2. Set MONGODB_URI, ANTHROPIC_API_KEY, and AGENT_AUTH_TOKEN manually\n" +
      "  3. Run the agent once with a setup token to save config locally"
  );
}
