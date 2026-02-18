"use client";

import { useEffect, useRef, useMemo } from "react";
import { MessageBubble } from "./message-bubble";
import { ErrorGroup } from "./error-group";
import { TypingIndicator } from "./typing-indicator";
import type { ChatMessage } from "./types";

type RenderItem =
  | { kind: "message"; message: ChatMessage }
  | { kind: "error-group"; messages: ChatMessage[]; key: string };

function groupMessages(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let errorBuffer: ChatMessage[] = [];

  const flushErrors = () => {
    if (errorBuffer.length === 0) return;
    if (errorBuffer.length === 1) {
      items.push({ kind: "message", message: errorBuffer[0] });
    } else {
      items.push({
        kind: "error-group",
        messages: [...errorBuffer],
        key: `errors-${errorBuffer[0].id}`,
      });
    }
    errorBuffer = [];
  };

  for (const msg of messages) {
    if (msg.role === "status" && msg.statusInfo?.level === "error") {
      errorBuffer.push(msg);
    } else {
      flushErrors();
      items.push({ kind: "message", message: msg });
    }
  }
  flushErrors();

  return items;
}

/** Don't show the typing indicator when another loading state is already visible */
function hasVisibleLoader(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  // Assistant message is actively streaming
  if (last.role === "assistant") return true;
  // Question skeleton is showing
  if (last.role === "user-question" && !last.userQuestion) return true;
  // Tool activity with active steps is its own loader
  if (last.role === "tool-activity" && last.toolSteps?.some((s) => s.status === "active")) return true;
  return false;
}

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onQuestionSubmit?: (messageId: string, answers: Record<string, string>) => void;
  onRetry?: (errorMessageId: string) => void;
}

export function MessageList({ messages, isLoading, onQuestionSubmit, onRetry }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const renderItems = useMemo(() => groupMessages(messages), [messages]);

  // The streaming message is the last assistant message while loading
  const lastMsg = messages[messages.length - 1];
  const streamingId = isLoading && lastMsg?.role === "assistant" ? lastMsg.id : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-40">
        {renderItems.map((item) => {
          if (item.kind === "error-group") {
            return (
              <ErrorGroup
                key={item.key}
                errors={item.messages}
                onRetry={onRetry}
              />
            );
          }
          return (
            <MessageBubble
              key={item.message.id}
              message={item.message}
              isStreaming={item.message.id === streamingId}
              onQuestionSubmit={onQuestionSubmit}
              onRetry={onRetry}
            />
          );
        })}
        {isLoading && !hasVisibleLoader(messages) && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
