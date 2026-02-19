import type { AgentServerConfig } from "./config.js";
import { log } from "./logger.js";

export interface WebhookPayload {
  taskId: string;
  status: string;
  result?: string | null;
  error?: string | null;
  stopReason?: string | null;
  costUsd?: number;
  turnsCompleted?: number;
  filesModified?: string[];
  lastActivity?: string;
}

/**
 * Fire-and-forget notification to the TARS app when a task completes.
 * Skips gracefully if no tarsUrl is configured.
 */
export function notifyTars(config: AgentServerConfig, payload: WebhookPayload): void {
  if (!config.tarsUrl) return;

  const url = `${config.tarsUrl}/api/agents/tasks/webhook`;

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
    },
    body: JSON.stringify({
      agentId: config.agentId,
      agentName: config.agentName,
      ...payload,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    log.warn(`Webhook failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}
