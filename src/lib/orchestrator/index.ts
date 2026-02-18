import { query } from "@anthropic-ai/claude-agent-sdk";
import { TARS_SYSTEM_PROMPT } from "./system-prompt";
import { createMemoryMcpServer } from "@/lib/memory/server";
import { connectDB, Memory } from "@/lib/db";

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "refusal"
  | "tool_use"
  | null;

export interface UserQuestionData {
  questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
}

export interface Citation {
  url: string;
  title: string;
  citedText?: string;
}

export type OrchestratorEvent =
  | { type: "init"; sessionId: string }
  | { type: "content_delta"; text: string }
  | { type: "user_question_loading" }
  | { type: "tool_activity_start"; toolName: string; detail?: string; completed?: boolean }
  | { type: "tool_activity_end"; toolName: string }
  | { type: "citations"; citations: Citation[] }
  | {
      type: "done";
      stopReason: StopReason;
      durationMs?: number;
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      type: "error";
      message: string;
      errorType: string;
      stopReason: StopReason;
    };

const DEFAULT_MODEL = "claude-sonnet-4-6";

// Tracked tools: maps any SDK name variant → [canonical, display]
const TRACKED_TOOLS: Record<string, [canonical: string, display: string]> = {
  WebSearch:  ["WebSearch", "web_search"],
  web_search: ["WebSearch", "web_search"],
  WebFetch:   ["WebFetch", "web_fetch"],
  web_fetch:  ["WebFetch", "web_fetch"],
  "mcp__tars-memory__memory": ["mcp__tars-memory__memory", "memory"],
};

function resolveToolName(raw: string): { canonical: string; display: string } | null {
  const entry = TRACKED_TOOLS[raw];
  return entry ? { canonical: entry[0], display: entry[1] } : null;
}

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Turn a memory path into a friendly name: "/memories/user-preferences.md" → "user preferences" */
function friendlyMemoryName(path?: string): string | null {
  if (!path) return null;
  const name = path
    .replace(/^\/memories\/?/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return name || null;
}

function tryParseToolDetail(canonical: string, jsonStr: string): string | undefined {
  try {
    const parsed = JSON.parse(jsonStr);

    if (canonical === "WebSearch" && parsed.query) return parsed.query;

    if (canonical === "WebFetch" && parsed.url) {
      const host = extractHostname(parsed.url);
      return host ? `Fetching from ${host}` : parsed.url;
    }

    if (canonical === "mcp__tars-memory__memory" && parsed.command) {
      const cmd = parsed.command as string;
      const name = friendlyMemoryName(parsed.path);
      if (cmd === "view") return name ? `Reading ${name}` : "Reading memories";
      if (cmd === "create") return name ? `Saving ${name}` : "Saving to memory";
      if (cmd === "str_replace" || cmd === "insert")
        return name ? `Updating ${name}` : "Updating memory";
      if (cmd === "delete") return name ? `Removing ${name}` : "Removing memory";
      if (cmd === "rename") return "Organizing memories";
      return "Using memory";
    }
  } catch {
    // JSON not yet complete — expected during streaming
  }
  return undefined;
}

/** Parse search results from SDK's tool_use_result into completed timeline steps. */
function* parseSearchResults(
  toolResult: Record<string, unknown>,
  display: string
): Generator<OrchestratorEvent> {
  if (!("query" in toolResult) || !Array.isArray(toolResult.results)) return;

  const searchQuery = toolResult.query as string;
  yield {
    type: "tool_activity_start",
    toolName: display,
    detail: `Searched for "${searchQuery}"`,
    completed: true,
  };

  // Find the results object containing the content array
  const resultsObj = (toolResult.results as Array<unknown>).find(
    (r) => r && typeof r === "object" && "content" in (r as Record<string, unknown>)
  ) as Record<string, unknown> | undefined;

  if (!resultsObj || !Array.isArray(resultsObj.content)) return;

  const results = resultsObj.content as Array<{ title?: string; url?: string }>;
  const domains = results
    .map((r) => extractHostname(r.url ?? ""))
    .filter((d): d is string => d !== null)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);

  const count = results.length;
  const suffix = domains.length ? ` from ${domains.join(", ")}` : "";
  yield {
    type: "tool_activity_start",
    toolName: display,
    detail: `Found ${count} result${count === 1 ? "" : "s"}${suffix}`,
    completed: true,
  };
}

/** Parse fetch results from SDK's tool_use_result into a completed timeline step. */
function* parseFetchResults(
  toolResult: Record<string, unknown>,
  display: string
): Generator<OrchestratorEvent> {
  if (!("url" in toolResult) || typeof toolResult.url !== "string") return;
  const host = extractHostname(toolResult.url);
  if (!host) return;

  yield {
    type: "tool_activity_start",
    toolName: display,
    detail: `Read ${host}`,
    completed: true,
  };
}

async function loadMemoryContext(): Promise<string> {
  try {
    await connectDB();
    const docs = await Memory.find({}, { path: 1, content: 1 })
      .sort({ path: 1 })
      .lean();

    if (!docs.length) return "";

    const files = (docs as Array<{ path: string; content: string }>)
      .map((d) => `<file path="${d.path}">\n${d.content}\n</file>`)
      .join("\n");

    return `\n\n<memories>\n${files}\n</memories>`;
  } catch {
    return "";
  }
}

export async function* runOrchestrator({
  message,
  sessionId,
  model,
  abortController,
  onQuestion,
}: {
  message: string;
  sessionId?: string;
  model?: string;
  abortController: AbortController;
  onQuestion: (data: UserQuestionData) => Promise<Record<string, string>>;
}): AsyncGenerator<OrchestratorEvent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield {
      type: "error",
      message:
        "ANTHROPIC_API_KEY is not configured. Add it to your .env.local file to enable TARS.",
      errorType: "api_key_missing",
      stopReason: null,
    };
    return;
  }

  try {
    const memoryContext = await loadMemoryContext();

    const stream = query({
      prompt: message,
      options: {
        resume: sessionId,
        systemPrompt: TARS_SYSTEM_PROMPT + memoryContext,
        model: model || DEFAULT_MODEL,
        tools: ["AskUserQuestion", "WebSearch", "WebFetch"],
        allowedTools: ["AskUserQuestion", "WebSearch", "WebFetch"],
        mcpServers: { "tars-memory": createMemoryMcpServer() },
        includePartialMessages: true,
        abortController,
        maxTurns: 10,
        canUseTool: async (toolName, input) => {
          if (toolName === "AskUserQuestion") {
            const answers = await onQuestion(input as unknown as UserQuestionData);
            return {
              behavior: "allow" as const,
              updatedInput: { ...input, answers },
            };
          }
          return { behavior: "allow" as const, updatedInput: input };
        },
      },
    });

    let initEmitted = false;
    let lastStopReason: StopReason = null;

    // Active tool use block being streamed
    let activeToolBlock: { name: string; display: string; inputJson: string } | null = null;

    // Tools whose content blocks are done but execution is still pending
    let pendingToolEndNames: string[] = [];

    const flushPendingToolEnds = function* (): Generator<OrchestratorEvent> {
      for (const name of pendingToolEndNames) {
        yield { type: "tool_activity_end", toolName: name };
      }
      pendingToolEndNames = [];
    };

    for await (const msg of stream) {
      // --- Session init ---
      if (msg.type === "system" && msg.subtype === "init") {
        initEmitted = true;
        yield { type: "init", sessionId: msg.session_id };
      }

      // --- Raw API stream events ---
      if (msg.type === "stream_event") {
        const event = msg.event;

        // Text content
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "content_delta", text: event.delta.text };
        }

        // --- Tool use detection ---
        if (event.type === "content_block_start" && "content_block" in event) {
          const block = event.content_block as { type: string; name?: string };

          if (block.type === "tool_use" && block.name === "AskUserQuestion") {
            yield { type: "user_question_loading" };
          }

          if (block.type === "tool_use" || block.type === "server_tool_use") {
            const resolved = resolveToolName(block.name ?? "");
            if (resolved) {
              activeToolBlock = { name: resolved.canonical, display: resolved.display, inputJson: "" };
              yield { type: "tool_activity_start", toolName: resolved.display };
            }
          }
        }

        // Accumulate tool input JSON for detail extraction
        if (event.type === "content_block_delta" && activeToolBlock) {
          const delta = event.delta as { type: string; partial_json?: string };
          if (delta.type === "input_json_delta" && delta.partial_json) {
            activeToolBlock.inputJson += delta.partial_json;
            const detail = tryParseToolDetail(activeToolBlock.name, activeToolBlock.inputJson);
            if (detail) {
              yield { type: "tool_activity_start", toolName: activeToolBlock.display, detail };
            }
          }
        }

        // Tool content block finished — don't emit end yet, execution is pending
        if (event.type === "content_block_stop" && activeToolBlock) {
          pendingToolEndNames.push(activeToolBlock.display);
          activeToolBlock = null;
        }

        // New model turn → SDK has executed pending tools
        if (event.type === "message_start" && pendingToolEndNames.length > 0) {
          yield* flushPendingToolEnds();
        }

        // Capture stop_reason; flush pending tools on end_turn
        if (event.type === "message_delta" && "delta" in event) {
          const delta = event.delta as { stop_reason?: string };
          if (delta.stop_reason) {
            lastStopReason = delta.stop_reason as StopReason;
            if (delta.stop_reason === "end_turn" && pendingToolEndNames.length > 0) {
              yield* flushPendingToolEnds();
            }
          }
        }
      }

      // --- Tool results from SDK (search/fetch completed) ---
      if (msg.type === "user") {
        const toolResult = (msg as Record<string, unknown>).tool_use_result as
          | Record<string, unknown>
          | undefined;

        if (toolResult) {
          yield* parseSearchResults(toolResult, "web_search");
          yield* parseFetchResults(toolResult, "web_fetch");
        }
      }

      // --- Extract citations from assistant messages ---
      if (msg.type === "assistant") {
        const content = (msg as { message?: { content?: Array<{
          type: string;
          citations?: Array<{ url?: string; title?: string; cited_text?: string }>;
        }> } }).message?.content;

        if (content) {
          const citationMap = new Map<string, Citation>();
          for (const block of content) {
            if (block.type === "text" && block.citations) {
              for (const c of block.citations) {
                if (c.url && c.title) {
                  citationMap.set(c.url, { url: c.url, title: c.title, citedText: c.cited_text });
                }
              }
            }
          }
          if (citationMap.size > 0) {
            yield { type: "citations", citations: [...citationMap.values()] };
          }
        }
      }

      // --- Final result ---
      if (msg.type === "result") {
        const resultAny = msg as Record<string, unknown>;
        const resultStopReason =
          (resultAny.stop_reason as StopReason) ?? lastStopReason;

        if (msg.subtype === "success") {
          if (!initEmitted) {
            yield { type: "init", sessionId: msg.session_id };
          }
          yield {
            type: "done",
            stopReason: resultStopReason,
            durationMs: msg.duration_ms,
            costUsd: msg.total_cost_usd,
            inputTokens: msg.usage.input_tokens ?? undefined,
            outputTokens: msg.usage.output_tokens ?? undefined,
          };
        } else {
          const errors =
            "errors" in msg && msg.errors?.length
              ? msg.errors.join("; ")
              : `Query ended with status: ${msg.subtype}`;
          yield { type: "error", message: errors, errorType: msg.subtype, stopReason: resultStopReason };
        }
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred.";
    yield { type: "error", message, errorType: "error_during_execution", stopReason: null };
  }
}
