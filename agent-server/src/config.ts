import os from "os";

export interface AgentServerConfig {
  port: number;
  authToken: string;
  agentId: string;
  agentName: string;
  mongodbUri: string;
  defaultModel: string;
  maxBudgetUsd: number;
  maxTurns: number;
  tarsUrl?: string;
  debug: boolean;
}

export function loadConfig(): AgentServerConfig {
  const authToken = process.env.AGENT_AUTH_TOKEN;
  if (!authToken) {
    throw new Error("AGENT_AUTH_TOKEN environment variable is required");
  }

  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error("MONGODB_URI environment variable is required");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  return {
    port: parseInt(process.env.PORT ?? "4001", 10),
    authToken,
    agentId: process.env.AGENT_ID ?? `agent-${os.hostname()}`,
    agentName: process.env.AGENT_NAME ?? "TARS Agent",
    mongodbUri,
    defaultModel: process.env.DEFAULT_MODEL ?? "claude-sonnet-4-6",
    maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD ?? "10.00"),
    maxTurns: parseInt(process.env.MAX_TURNS ?? "100", 10),
    tarsUrl: process.env.TARS_URL || undefined,
    debug: process.env.DEBUG === "true",
  };
}
