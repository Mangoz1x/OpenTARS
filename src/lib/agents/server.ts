import { z } from "zod/v4";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { connectDB, Agent, Archetype, Task, Message, Conversation } from "@/lib/db";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Check if a fetch error is a connection refusal (server not running). */
function isConnectionRefused(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: Error }).cause;
  const msg = (cause?.message ?? err.message).toLowerCase();
  return msg.includes("econnrefused") || msg.includes("connect") || msg.includes("fetch failed");
}

/** Make an authenticated HTTP request to a remote agent server. */
async function agentFetch(
  url: string,
  apiKey: string | undefined,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    return await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createAgentsMcpServer(conversationId: string) {
  // ─── list_agents ───
  const listAgentsTool = tool(
    "list_agents",
    `List all registered agents and their current status. Returns each agent's ID, name, archetypes, online status, and URL. Use this to see what agents are available before assigning tasks.`,
    {},
    async () => {
      try {
        await connectDB();
        const agents = await Agent.find()
          .sort({ isLocal: -1, createdAt: 1 })
          .lean();

        if (agents.length === 0) {
          return textResult("No agents registered. The user needs to add agents in Settings > Agents.");
        }

        const lines = (agents as Array<Record<string, unknown>>).map((a) => {
          const status = a.isOnline ? "ONLINE" : "OFFLINE";
          const archetypes = (a.archetypes as string[])?.join(", ") || "none";
          const local = a.isLocal ? " [local]" : "";
          return `- ${a.name} (${a._id})${local}: ${status}, archetypes: [${archetypes}], url: ${a.url}`;
        });

        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult(
          "Failed to list agents: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  );

  // ─── assign_task ───
  const assignTaskTool = tool(
    "assign_task",
    `Assign a task to a remote agent. The agent will work on it autonomously. You will be notified automatically when the task completes — do NOT poll with check_status or get_result. Simply acknowledge the assignment and move on.

Before assigning, use list_agents to find an appropriate online agent. Choose an agent whose archetypes match the task type (e.g. "developer" for coding tasks, "researcher" for research).`,
    {
      agent_id: z.string().describe("ID of the registered agent (from list_agents)"),
      task: z.string().describe("Detailed description of what the agent should do"),
      cwd: z.string().optional().describe("Working directory on the remote machine"),
      max_turns: z.number().optional().describe("Turn limit (default: 50)"),
      max_budget_usd: z.number().optional().describe("Cost limit in USD (default: 5.00)"),
      resume_session: z.string().optional().describe("Session ID to resume a previous task"),
    },
    async (args) => {
      try {
        await connectDB();
        const agent = await Agent.findById(args.agent_id).lean() as Record<string, unknown> | null;
        if (!agent) {
          return errorResult(`Agent not found: ${args.agent_id}. Use list_agents to see available agents.`);
        }

        if (!agent.isOnline) {
          return errorResult(`Agent "${agent.name}" is offline. Choose an online agent.`);
        }

        const agentUrl = agent.url as string;
        if (!agentUrl || agentUrl === "http://pending") {
          return errorResult(`Agent "${agent.name}" doesn't have a valid URL configured yet.`);
        }

        // Load archetype for system prompt construction
        const archetypeId = (agent.preferredArchetype as string) || (agent.archetypes as string[])?.[0];
        let systemPrompt: string | undefined;
        if (archetypeId) {
          const archetype = await Archetype.findById(archetypeId).lean() as Record<string, unknown> | null;
          if (archetype?.systemPrompt) {
            systemPrompt = archetype.systemPrompt as string;
          }
        }

        // Guard: prevent duplicate running tasks for the same agent
        const existingRunning = await Task.findOne({
          agentId: args.agent_id,
          status: "running",
        }).lean();
        if (existingRunning) {
          return errorResult(
            `Agent "${agent.name}" already has a running task (${(existingRunning as Record<string, unknown>)._id}). Wait for it to finish or cancel it first.`
          );
        }

        // Build request to the agent server
        const taskBody: Record<string, unknown> = {
          prompt: args.task,
          maxTurns: args.max_turns ?? 50,
          maxBudgetUsd: args.max_budget_usd ?? 5.0,
        };
        if (systemPrompt) taskBody.systemPrompt = systemPrompt;
        if (args.cwd) taskBody.cwd = args.cwd;
        else if (agent.defaultCwd) taskBody.cwd = agent.defaultCwd;
        if (args.resume_session) taskBody.sessionId = args.resume_session;

        const res = await agentFetch(`${agentUrl}/tasks`, agent.apiKey as string, {
          method: "POST",
          body: JSON.stringify(taskBody),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Unknown error" }));
          if (res.status === 409) {
            return errorResult(
              `Agent "${agent.name}" is already working on a task (${(body as Record<string, unknown>).currentTaskId}). Wait for it to finish or cancel it first.`
            );
          }
          return errorResult(
            `Failed to assign task to "${agent.name}": ${(body as Record<string, unknown>).error ?? res.statusText}`
          );
        }

        const data = (await res.json()) as Record<string, unknown>;

        // Save TARS-side task doc for tracking + webhook updates
        const summary = (args.task.length > 120 ? args.task.slice(0, 117) + "..." : args.task);
        try {
          const tarsTask = await Task.create({
            remoteTaskId: data.taskId,
            agentId: args.agent_id,
            agentName: agent.name as string,
            conversationId,
            prompt: args.task,
            summary,
            status: "running",
          });

          // Create a "running" agent-activity message so the client can show a live card
          const msg = await Message.create({
            conversationId,
            role: "agent-activity",
            agentActivity: {
              agentId: args.agent_id,
              agentName: agent.name as string,
              taskId: tarsTask._id.toString(),
              taskSummary: summary,
              status: "running",
              steps: [],
              startedAt: new Date(),
            },
          });

          await Conversation.findByIdAndUpdate(conversationId, {
            $inc: { messageCount: 1 },
            $set: { lastMessageAt: msg.timestamp },
          });
        } catch (err) {
          // Log but don't fail the assignment — the task is already running on the agent
          console.error("[assign_task] Failed to save TARS task doc:", err);
        }

        return textResult(
          `Task assigned to "${agent.name}".\n` +
          `Task ID: ${data.taskId}\n` +
          `Status: ${data.status}\n` +
          `You will be notified automatically when this task completes. No need to poll.`
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return errorResult(`Agent "${args.agent_id}" did not respond within 30 seconds. It may be overloaded or frozen. The user should check the agent server.`);
        }
        if (isConnectionRefused(err)) {
          return errorResult(`Agent "${args.agent_id}" is not running. The connection was refused. The user needs to start the agent server.`);
        }
        return errorResult(
          "Failed to assign task: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  );

  // ─── check_status ───
  const checkStatusTool = tool(
    "check_status",
    `Check the current status of a task running on a remote agent. Returns status, progress, and cost info.`,
    {
      agent_id: z.string().describe("Agent ID"),
      task_id: z.string().describe("Task ID from assign_task"),
    },
    async (args) => {
      try {
        await connectDB();
        const agent = await Agent.findById(args.agent_id).lean() as Record<string, unknown> | null;
        if (!agent) return errorResult(`Agent not found: ${args.agent_id}`);

        const res = await agentFetch(
          `${agent.url}/tasks/${args.task_id}`,
          agent.apiKey as string
        );

        if (!res.ok) {
          if (res.status === 404) return errorResult(`Task ${args.task_id} not found on agent "${agent.name}".`);
          return errorResult(`Failed to check status: ${res.statusText}`);
        }

        const data = (await res.json()) as Record<string, unknown>;
        const lines = [
          `Agent: ${agent.name}`,
          `Task: ${data.taskId}`,
          `Status: ${data.status}`,
          `Turns: ${data.turnsCompleted ?? 0}`,
          `Cost: $${((data.costUsd as number) ?? 0).toFixed(4)}`,
        ];
        if (data.lastActivity) lines.push(`Last activity: ${data.lastActivity}`);
        if (data.result) lines.push(`\nResult:\n${data.result}`);
        if (data.error) lines.push(`\nError: ${data.error}`);

        return textResult(lines.join("\n"));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return errorResult(`Agent "${args.agent_id}" did not respond within 30 seconds. It may be overloaded or frozen.`);
        }
        if (isConnectionRefused(err)) {
          return errorResult(`Agent "${args.agent_id}" is not running. The connection was refused. The user needs to start the agent server.`);
        }
        return errorResult(
          "Failed to check status: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  );

  // ─── get_result ───
  const getResultTool = tool(
    "get_result",
    `Get the final result of a completed task. If the task is still running, you'll be told to wait and check back later.`,
    {
      agent_id: z.string().describe("Agent ID"),
      task_id: z.string().describe("Task ID from assign_task"),
    },
    async (args) => {
      try {
        await connectDB();
        const agent = await Agent.findById(args.agent_id).lean() as Record<string, unknown> | null;
        if (!agent) return errorResult(`Agent not found: ${args.agent_id}`);

        const res = await agentFetch(
          `${agent.url}/tasks/${args.task_id}`,
          agent.apiKey as string
        );

        if (!res.ok) {
          if (res.status === 404) return errorResult(`Task ${args.task_id} not found on agent "${agent.name}".`);
          return errorResult(`Failed to get result: ${res.statusText}`);
        }

        const data = (await res.json()) as Record<string, unknown>;

        if (data.status === "running") {
          return textResult(
            `Task is still running on "${agent.name}".\n` +
            `Turns completed: ${data.turnsCompleted ?? 0}\n` +
            `Cost so far: $${((data.costUsd as number) ?? 0).toFixed(4)}\n` +
            `Last activity: ${data.lastActivity ?? "unknown"}\n\n` +
            `Use check_status to poll again, or wait and call get_result later.`
          );
        }

        const lines = [
          `Agent: ${agent.name}`,
          `Task: ${data.taskId}`,
          `Status: ${data.status}`,
          `Turns: ${data.turnsCompleted ?? 0}`,
          `Cost: $${((data.costUsd as number) ?? 0).toFixed(4)}`,
        ];
        if (data.stopReason) lines.push(`Stop reason: ${data.stopReason}`);
        if (data.filesModified && (data.filesModified as string[]).length > 0) {
          lines.push(`\nFiles modified:\n${(data.filesModified as string[]).map((f) => `  - ${f}`).join("\n")}`);
        }
        if (data.result) lines.push(`\nResult:\n${data.result}`);
        if (data.error) lines.push(`\nError:\n${data.error}`);

        return textResult(lines.join("\n"));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return errorResult(`Agent "${args.agent_id}" did not respond within 30 seconds. It may be overloaded or frozen.`);
        }
        if (isConnectionRefused(err)) {
          return errorResult(`Agent "${args.agent_id}" is not running. The connection was refused. The user needs to start the agent server.`);
        }
        return errorResult(
          "Failed to get result: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  );

  // ─── cancel_task ───
  const cancelTaskTool = tool(
    "cancel_task",
    `Cancel a running task on a remote agent. The agent will stop working and the task will be marked as cancelled.`,
    {
      agent_id: z.string().describe("Agent ID"),
      task_id: z.string().describe("Task ID to cancel"),
    },
    async (args) => {
      try {
        await connectDB();
        const agent = await Agent.findById(args.agent_id).lean() as Record<string, unknown> | null;
        if (!agent) return errorResult(`Agent not found: ${args.agent_id}`);

        const res = await agentFetch(
          `${agent.url}/tasks/${args.task_id}/cancel`,
          agent.apiKey as string,
          { method: "POST" }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Unknown error" }));
          if (res.status === 409) {
            return textResult(`Task is already ${(body as Record<string, unknown>).status ?? "finished"}.`);
          }
          if (res.status === 404) return errorResult(`Task ${args.task_id} not found.`);
          return errorResult(`Failed to cancel: ${(body as Record<string, unknown>).error ?? res.statusText}`);
        }

        const data = (await res.json()) as Record<string, unknown>;
        return textResult(`Task ${data.taskId} cancelled on "${agent.name}".`);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return errorResult(`Agent "${args.agent_id}" did not respond within 30 seconds. It may be overloaded or frozen.`);
        }
        if (isConnectionRefused(err)) {
          return errorResult(`Agent "${args.agent_id}" is not running. The connection was refused. The user needs to start the agent server.`);
        }
        return errorResult(
          "Failed to cancel task: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  );

  return createSdkMcpServer({
    name: "tars-agents",
    tools: [listAgentsTool, assignTaskTool, checkStatusTool, getResultTool, cancelTaskTool],
  });
}
