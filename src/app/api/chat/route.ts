import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";
import { runOrchestrator } from "@/lib/orchestrator";
import type { UserQuestionData, Citation } from "@/lib/orchestrator";
import { buildStopReasonStatus, buildErrorStatus } from "@/lib/status-builders";

const POLL_INTERVAL_MS = 500;

const handler = compose(withAuth, withDatabase);

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const { conversationId, message, model } = body;

  if (!conversationId || !message) {
    return Response.json(
      { error: "conversationId and message are required" },
      { status: 400 }
    );
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return Response.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const sessionId = conversation.orchestratorSessionId as string | undefined;
  const abortController = new AbortController();

  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  // Tracks content segments between tool calls.
  // Each segment becomes a separate assistant message so ordering stays correct
  // when the model outputs: text -> question -> more text.
  let currentSegment = "";
  const savedAssistantIds: string[] = [];
  let pendingCitations: Citation[] | null = null;
  let lastToolDetail: { toolName: string; detail?: string } | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const saveMessage = async (doc: Record<string, unknown>) => {
        const msg = await Message.create({ conversationId, ...doc });
        await Conversation.findByIdAndUpdate(conversationId, {
          $inc: { messageCount: 1 },
          $set: { lastMessageAt: msg.timestamp },
        });
        return msg._id.toString() as string;
      };

      // Flush current text segment to DB and notify client
      const flushSegment = async (): Promise<string | undefined> => {
        if (!currentSegment) return undefined;
        try {
          const id = await saveMessage({
            role: "assistant",
            content: currentSegment,
            ...(pendingCitations?.length ? { citations: pendingCitations } : {}),
          });
          savedAssistantIds.push(id);
          currentSegment = "";
          pendingCitations = null;
          return id;
        } catch (err) {
          console.error("[route] failed to save assistant segment:", err);
          currentSegment = "";
          pendingCitations = null;
          return undefined;
        }
      };

      // Called by canUseTool when the model invokes AskUserQuestion.
      // Flushes pre-question text, saves the question to DB, sends SSE events,
      // then polls MongoDB until the user submits answers via the /answer endpoint.
      const onQuestion = async (
        data: UserQuestionData
      ): Promise<Record<string, string>> => {
        const assistantId = await flushSegment();

        // Skeleton was already sent via the stream_event content_block_start
        // detection, so we go straight to saving and sending the real question.

        const questionId = await saveMessage({
          role: "user-question",
          userQuestion: {
            questions: data.questions,
            answered: false,
          },
        });

        send({
          type: "user_question",
          messageId: questionId,
          assistantMessageId: assistantId,
          data,
        });

        // Signal client to start a new assistant message for post-question text
        send({ type: "segment_break" });

        // Poll MongoDB until the answer endpoint marks this question as answered.
        // The /answer endpoint sets userQuestion.answered = true and populates
        // userQuestion.answers. This is the single source of truth — no in-memory
        // state shared across route bundles.
        while (!abortController.signal.aborted) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const doc = await Message.findById(questionId).lean();
          const uq = doc?.userQuestion as
            | { answered?: boolean; answers?: Record<string, string> }
            | undefined;
          if (uq?.answered && uq.answers) {
            return uq.answers;
          }
        }

        throw new Error("Question cancelled");
      };

      try {
        for await (const event of runOrchestrator({
          message,
          sessionId,
          model,
          abortController,
          onQuestion,
        })) {
          switch (event.type) {
            case "init":
              await Conversation.findByIdAndUpdate(conversationId, {
                $set: { orchestratorSessionId: event.sessionId },
              });
              send({ type: "init", sessionId: event.sessionId });
              break;

            case "content_delta":
              currentSegment += event.text;
              send({ type: "content_delta", text: event.text });
              break;

            case "user_question_loading":
              send({ type: "user_question_loading" });
              break;

            case "tool_activity_start": {
              // Only flush pre-tool text for new active tool calls, not completed status updates
              let preToolId: string | undefined;
              if (!event.completed) {
                preToolId = await flushSegment();
              }
              lastToolDetail = { toolName: event.toolName, detail: event.detail };
              send({
                type: "tool_activity_start",
                toolName: event.toolName,
                detail: event.detail,
                completed: event.completed,
                flushedMessageId: preToolId,
              });
              break;
            }

            case "tool_activity_end": {
              // Save tool-use as its own message in the conversation timeline
              let toolUseMessageId: string | undefined;
              if (lastToolDetail) {
                toolUseMessageId = await saveMessage({
                  role: "tool-use",
                  toolUse: lastToolDetail,
                });
              }
              send({
                type: "tool_activity_end",
                toolName: event.toolName,
                toolUseMessageId,
                toolUse: lastToolDetail,
              });
              lastToolDetail = null;
              // Start new segment for post-tool text
              send({ type: "segment_break" });
              break;
            }

            case "citations":
              pendingCitations = event.citations;
              send({ type: "citations", citations: event.citations });
              break;

            case "done": {
              // Save any remaining text (post-question text, or entire response if no questions)
              const finalAssistantId = await flushSegment();

              // Build status info for non-normal stop reasons
              const statusInfo = buildStopReasonStatus(event.stopReason);
              let statusMessageId: string | undefined;

              if (statusInfo) {
                const details: Record<string, string | number> = {};
                if (event.durationMs)
                  details["Duration"] = `${(event.durationMs / 1000).toFixed(1)}s`;
                if (event.costUsd)
                  details["Cost"] = `$${event.costUsd.toFixed(4)}`;
                statusInfo.details = details;

                statusMessageId = await saveMessage({
                  role: "status",
                  statusInfo,
                });
              }

              send({
                type: "done",
                // The most recent assistant message ID (could be pre-question or post-question)
                messageId: finalAssistantId ?? savedAssistantIds[savedAssistantIds.length - 1],
                statusMessageId,
                statusInfo,
                stopReason: event.stopReason,
                durationMs: event.durationMs,
                costUsd: event.costUsd,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
              });
              controller.close();
              return;
            }

            case "error": {
              const errorStatusInfo = buildErrorStatus(
                event.message,
                event.errorType,
                event.stopReason
              );
              let errorMessageId: string | undefined;
              try {
                errorMessageId = await saveMessage({
                  role: "status",
                  statusInfo: errorStatusInfo,
                });
              } catch (err) {
                console.error("[route] failed to save error status:", err);
              }

              send({
                type: "error",
                messageId: errorMessageId,
                statusInfo: errorStatusInfo,
                message: event.message,
                errorType: event.errorType,
                stopReason: event.stopReason,
              });
              controller.close();
              return;
            }
          }
        }

        controller.close();
      } catch (err) {
        console.error("[route] stream error:", err);

        const errorStatusInfo = buildErrorStatus(
          "The response stream was interrupted. This can happen due to network issues. Try sending your message again.",
          "stream_interrupted",
          null
        );

        try {
          const errorMessageId = await saveMessage({
            role: "status",
            statusInfo: errorStatusInfo,
          });
          send({
            type: "error",
            messageId: errorMessageId,
            statusInfo: errorStatusInfo,
            message: "Stream interrupted.",
            errorType: "stream_interrupted",
            stopReason: null,
          });
        } catch {
          // DB save failed too — just close
        }
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
