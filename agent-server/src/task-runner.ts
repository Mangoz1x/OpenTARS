import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMemoryMcpServer } from "./memory/server.js";
import type { TaskManager, ManagedTask } from "./task-manager.js";
import type { CreateTaskRequest } from "./types.js";
import type { AgentServerConfig } from "./config.js";

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

  let turnsCompleted = 0;
  const filesModified = new Set<string>();

  // Track active tool block for file path extraction
  let activeToolBlock: { name: string; inputJson: string } | null = null;
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
            activeToolBlock = { name: block.name, inputJson: "" };
            eventBus.emit("tool_start", { tool: block.name });
            await taskManager.updateTask(taskId, {
              lastActivity: `Using ${block.name}`,
            });
          }
        }

        // Accumulate tool input JSON for file path extraction
        if (event.type === "content_block_delta" && activeToolBlock) {
          const delta = event.delta as { type: string; partial_json?: string };
          if (delta.type === "input_json_delta" && delta.partial_json) {
            activeToolBlock.inputJson += delta.partial_json;

            // Try to extract file path from Edit/Write tools
            if (activeToolBlock.name === "Edit" || activeToolBlock.name === "Write") {
              try {
                const parsed = JSON.parse(activeToolBlock.inputJson);
                if (parsed.file_path) {
                  filesModified.add(parsed.file_path);
                  await taskManager.updateTask(taskId, {
                    lastActivity: `Editing ${parsed.file_path}`,
                  });
                }
              } catch {
                // JSON not complete yet
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

          eventBus.emit("error", { message: errors });
          await taskManager.failTask(taskId, errors);
        }
      }
    }
  } catch (err) {
    // Check if this is an abort (cancellation)
    if (err instanceof Error && err.name === "AbortError") {
      eventBus.emit("result", { status: "cancelled" });
      // cancelTask already updated DB
      eventBus.close();
      return;
    }

    const message = err instanceof Error ? err.message : "An unknown error occurred.";
    eventBus.emit("error", { message });
    await taskManager.failTask(taskId, message);
  }
}
