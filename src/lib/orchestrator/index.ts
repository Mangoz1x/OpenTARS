import { query } from "@anthropic-ai/claude-agent-sdk";
import { TARS_SYSTEM_PROMPT } from "./system-prompt";

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

export type OrchestratorEvent =
  | { type: "init"; sessionId: string }
  | { type: "content_delta"; text: string }
  | { type: "user_question_loading" }
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

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

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
    const stream = query({
      prompt: message,
      options: {
        resume: sessionId,
        systemPrompt: TARS_SYSTEM_PROMPT,
        model: model || DEFAULT_MODEL,
        tools: ["AskUserQuestion"],
        allowedTools: ["AskUserQuestion"],
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
          return { behavior: "allow" as const };
        },
      },
    });

    let initEmitted = false;
    let lastStopReason: StopReason = null;

    for await (const msg of stream) {
      // --- Session init ---
      if (msg.type === "system" && msg.subtype === "init") {
        initEmitted = true;
        yield { type: "init", sessionId: msg.session_id };
      }

      // --- Raw API stream events (text deltas, stop reason) ---
      if (msg.type === "stream_event") {
        const event = msg.event;

        // Text content
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "content_delta", text: event.delta.text };
        }

        // Early skeleton: fires as soon as the model starts generating the
        // AskUserQuestion tool call, well before canUseTool receives the
        // fully-parsed input. This gives the client an immediate visual
        // indicator while the tool input JSON is still streaming.
        if (event.type === "content_block_start" && "content_block" in event) {
          const block = event.content_block as { type: string; name?: string };
          if (block.type === "tool_use" && block.name === "AskUserQuestion") {
            yield { type: "user_question_loading" };
          }
        }

        // Capture stop_reason from message_delta
        if (event.type === "message_delta" && "delta" in event) {
          const delta = event.delta as { stop_reason?: string };
          if (delta.stop_reason) {
            lastStopReason = delta.stop_reason as StopReason;
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

          yield {
            type: "error",
            message: errors,
            errorType: msg.subtype,
            stopReason: resultStopReason,
          };
        }
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred.";
    yield {
      type: "error",
      message,
      errorType: "error_during_execution",
      stopReason: null,
    };
  }
}
