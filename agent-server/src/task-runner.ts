import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMemoryMcpServer } from "./memory/server.js";
import type { TaskManager, ManagedTask } from "./task-manager.js";
import type { CreateTaskRequest } from "./types.js";
import type { AgentServerConfig } from "./config.js";
import { log } from "./logger.js";

/** Extract a human-readable activity label from a tool's parsed input JSON. */
function extractActivity(toolName: string, inputJson: string): string | null {
  try {
    const parsed = JSON.parse(inputJson);
    switch (toolName) {
      case "Bash": {
        const cmd = parsed.command as string | undefined;
        if (cmd) {
          const truncated = cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd;
          return `Running: ${truncated}`;
        }
        break;
      }
      case "Edit": {
        const fp = parsed.file_path as string | undefined;
        if (fp) return `Editing ${path.basename(fp)}`;
        break;
      }
      case "Write": {
        const fp = parsed.file_path as string | undefined;
        if (fp) return `Writing ${path.basename(fp)}`;
        break;
      }
      case "Read": {
        const fp = parsed.file_path as string | undefined;
        if (fp) return `Reading ${path.basename(fp)}`;
        break;
      }
      case "Glob": {
        const pattern = parsed.pattern as string | undefined;
        if (pattern) return `Searching for ${pattern}`;
        break;
      }
      case "Grep": {
        const pat = parsed.pattern as string | undefined;
        if (pat) {
          const truncated = pat.length > 80 ? pat.slice(0, 77) + "..." : pat;
          return `Searching for ${truncated}`;
        }
        break;
      }
    }
  } catch {
    // JSON not valid
  }
  return null;
}

/**
 * Runs a task using the Claude Agent SDK. This function is fire-and-forget —
 * it updates the DB and emits SSE events as the SDK streams results.
 */
export async function runTask(
  managed: ManagedTask,
  request: CreateTaskRequest,
  taskManager: TaskManager,
  config: AgentServerConfig
): Promise<void> {
  const { taskId, abortController, eventBus } = managed;

  log.debug(`[task] Starting ${taskId} | model=${config.defaultModel} turns=${request.maxTurns ?? config.maxTurns} budget=$${request.maxBudgetUsd ?? config.maxBudgetUsd}`);

  let turnsCompleted = 0;
  const filesModified = new Set<string>();

  // Track active tool block for activity extraction
  let activeToolBlock: { name: string; inputJson: string; activityPushed: boolean } | null = null;
  let pendingToolNames: string[] = [];

  try {
    const defaultTools = ["Read", "Edit", "Write", "Bash", "Glob", "Grep"];

    const stream = query({
      prompt: request.prompt,
      options: {
        systemPrompt: request.systemPrompt,
        model: config.defaultModel,
        tools: request.allowedTools ?? defaultTools,
        allowedTools: request.allowedTools ?? defaultTools,
        permissionMode: (request.permissionMode as "default" | "acceptEdits" | "bypassPermissions") ?? "acceptEdits",
        cwd: request.cwd,
        maxTurns: request.maxTurns ?? config.maxTurns,
        maxBudgetUsd: request.maxBudgetUsd ?? config.maxBudgetUsd,
        abortController,
        resume: request.sessionId ?? undefined,
        includePartialMessages: true,
        mcpServers: { "tars-memory": createMemoryMcpServer() },
      },
    });

    for await (const msg of stream) {
      // --- Session init ---
      if (msg.type === "system" && msg.subtype === "init") {
        log.debug(`[task] Session initialized: ${msg.session_id}`);
        await taskManager.updateTask(taskId, { sessionId: msg.session_id });
      }

      // --- Raw API stream events ---
      if (msg.type === "stream_event") {
        const event = msg.event;

        // Text content
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          eventBus.emit("text_delta", { text: event.delta.text });
        }

        // Tool use start
        if (event.type === "content_block_start" && "content_block" in event) {
          const block = event.content_block as { type: string; name?: string };
          if (block.type === "tool_use" && block.name) {
            log.debug(`[task] Tool start: ${block.name}`);
            activeToolBlock = { name: block.name, inputJson: "", activityPushed: false };
            eventBus.emit("tool_start", { tool: block.name });
          }
        }

        // Accumulate tool input JSON for activity extraction
        if (event.type === "content_block_delta" && activeToolBlock) {
          const delta = event.delta as { type: string; partial_json?: string };
          if (delta.type === "input_json_delta" && delta.partial_json) {
            activeToolBlock.inputJson += delta.partial_json;

            // Try to extract detail once JSON is parseable
            if (!activeToolBlock.activityPushed) {
              const activity = extractActivity(activeToolBlock.name, activeToolBlock.inputJson);
              if (activity) {
                log.debug(`[task] Activity: ${activity}`);
                activeToolBlock.activityPushed = true;
                await taskManager.pushActivity(taskId, activity);

                // Track modified files for Edit/Write
                if (activeToolBlock.name === "Edit" || activeToolBlock.name === "Write") {
                  try {
                    const parsed = JSON.parse(activeToolBlock.inputJson);
                    if (parsed.file_path) filesModified.add(parsed.file_path);
                  } catch { /* not yet complete */ }
                }
              }
            }
          }
        }

        // Tool content block finished
        if (event.type === "content_block_stop" && activeToolBlock) {
          pendingToolNames.push(activeToolBlock.name);
          activeToolBlock = null;
        }

        // New model turn — SDK executed pending tools
        if (event.type === "message_start" && pendingToolNames.length > 0) {
          for (const name of pendingToolNames) {
            eventBus.emit("tool_end", { tool: name, success: true });
          }
          pendingToolNames = [];
          turnsCompleted++;
          log.debug(`[task] Turn ${turnsCompleted} completed`);

          eventBus.emit("status", { turnsCompleted, costUsd: 0 });
          await taskManager.updateTask(taskId, { turnsCompleted });
        }
      }

      // --- Final result ---
      if (msg.type === "result") {
        // Flush any remaining pending tool ends
        for (const name of pendingToolNames) {
          eventBus.emit("tool_end", { tool: name, success: true });
        }
        pendingToolNames = [];

        const resultAny = msg as Record<string, unknown>;
        const filesArr = [...filesModified];

        if (msg.subtype === "success") {
          const costUsd = (resultAny.total_cost_usd as number) ?? 0;
          const stopReason = (resultAny.stop_reason as string) ?? "end_turn";
          const resultText = (resultAny.result as string) ?? "";

          log.debug(`[task] Result: completed | cost=$${costUsd.toFixed(2)} turns=${turnsCompleted} files=${filesArr.length}`);

          eventBus.emit("result", {
            status: "completed",
            result: resultText,
            stopReason,
            costUsd,
            turnsCompleted,
            filesModified: filesArr,
          });

          await taskManager.completeTask(
            taskId,
            "completed",
            resultText,
            stopReason,
            costUsd,
            turnsCompleted,
            filesArr
          );
        } else if (msg.subtype === "error_max_turns") {
          log.debug(`[task] Result: max_turns | turns=${turnsCompleted} files=${filesArr.length}`);
          eventBus.emit("result", {
            status: "max_turns",
            turnsCompleted,
            filesModified: filesArr,
          });

          await taskManager.completeTask(
            taskId,
            "max_turns",
            null,
            "max_turns",
            0,
            turnsCompleted,
            filesArr
          );
        } else if (msg.subtype === "error_max_budget_usd") {
          log.debug(`[task] Result: max_budget | turns=${turnsCompleted} files=${filesArr.length}`);
          eventBus.emit("result", {
            status: "max_budget",
            turnsCompleted,
            filesModified: filesArr,
          });

          await taskManager.completeTask(
            taskId,
            "max_budget",
            null,
            "max_budget",
            0,
            turnsCompleted,
            filesArr
          );
        } else {
          // error_during_execution or other errors
          const errors =
            "errors" in msg && Array.isArray(msg.errors) && msg.errors.length
              ? msg.errors.join("; ")
              : `Task ended with status: ${msg.subtype}`;

          log.debug(`[task] Error: ${errors}`);
          eventBus.emit("error", { message: errors });
          await taskManager.failTask(taskId, errors);
        }
      }
    }
  } catch (err) {
    // Check if this is an abort (cancellation)
    if (err instanceof Error && err.name === "AbortError") {
      log.debug(`[task] Cancelled`);
      eventBus.emit("result", { status: "cancelled" });
      // cancelTask already updated DB
      eventBus.close();
      return;
    }

    const message = err instanceof Error ? err.message : "An unknown error occurred.";
    log.debug(`[task] Error: ${message}`);
    eventBus.emit("error", { message });
    await taskManager.failTask(taskId, message);
  }
}
