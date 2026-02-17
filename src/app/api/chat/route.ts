import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";
import { runOrchestrator } from "@/lib/orchestrator";
import type { UserQuestionData } from "@/lib/orchestrator";
import { buildStopReasonStatus, buildErrorStatus } from "@/lib/status-builders";
import {
  setPendingAnswer,
  clearPendingAnswer,
} from "@/lib/orchestrator/pending-answers";

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
    clearPendingAnswer(conversationId);
    abortController.abort();
  });

  // Tracks content segments between tool calls.
  // Each segment becomes a separate assistant message so ordering stays correct
  // when the model outputs: text -> question -> more text.
  let currentSegment = "";
  const savedAssistantIds: string[] = [];

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
          });
          savedAssistantIds.push(id);
          currentSegment = "";
          return id;
        } catch (err) {
          console.error("[route] failed to save assistant segment:", err);
          currentSegment = "";
          return undefined;
        }
      };

      // Called by canUseTool when the model invokes AskUserQuestion.
      // Flushes pre-question text, saves the question to DB, sends SSE events,
      // then blocks until the user submits answers via the /answer endpoint.
      const onQuestion = async (
        data: UserQuestionData
      ): Promise<Record<string, string>> => {
        const assistantId = await flushSegment();

        // Skeleton was already sent via the stream_event content_block_start
        // detection, so we go straight to saving and sending the real question.

        let questionId: string | undefined;
        try {
          questionId = await saveMessage({
            role: "user-question",
            userQuestion: {
              questions: data.questions,
              answered: false,
            },
          });
        } catch (err) {
          console.error("[route] failed to save user_question:", err);
        }

        send({
          type: "user_question",
          messageId: questionId,
          assistantMessageId: assistantId,
          data,
        });

        // Signal client to start a new assistant message for post-question text
        send({ type: "segment_break" });

        return new Promise<Record<string, string>>((resolve) => {
          setPendingAnswer(conversationId, resolve);
        });
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
              clearPendingAnswer(conversationId);

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
        clearPendingAnswer(conversationId);

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
      clearPendingAnswer(conversationId);
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
