"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import type { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onQuestionSubmit?: (messageId: string, answers: Record<string, string>) => void;
}

export function MessageList({ messages, isLoading, onQuestionSubmit }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-40">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onQuestionSubmit={onQuestionSubmit}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
