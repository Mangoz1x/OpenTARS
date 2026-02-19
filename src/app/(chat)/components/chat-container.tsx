"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { PanelLeft, Settings } from "lucide-react";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { ChatMessage } from "./types";

interface ChatContainerProps {
  onToggleSidebar: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onQuestionSubmit?: (messageId: string, answers: Record<string, string>) => void;
  onRetry?: (errorMessageId: string) => void;
  onTaskComplete?: (taskId: string, data: { status: string; result: string | null; error: string | null }) => void;
  model: string;
  onModelChange: (modelId: string) => void;
}

export function ChatContainer({ onToggleSidebar, messages, isLoading, onSendMessage, onQuestionSubmit, onRetry, onTaskComplete, model, onModelChange }: ChatContainerProps) {
  const [input, setInput] = useState("");

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  }, [input, onSendMessage]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <TooltipProvider>
      <div className="relative h-full overflow-hidden">
        {/* Sidebar toggle */}
        <div className="absolute left-3 top-3 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggleSidebar}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Settings link */}
        <div className="absolute right-3 top-3 z-10">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Body */}
        {hasMessages ? (
          <MessageList messages={messages} isLoading={isLoading} onQuestionSubmit={onQuestionSubmit} onRetry={onRetry} onTaskComplete={onTaskComplete} />
        ) : (
          <EmptyState onSuggestionClick={handleSuggestionClick} />
        )}

        {/* Floating input */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <div className="bg-gradient-to-t from-background from-60% to-transparent pb-0 pt-8">
            <div className="pointer-events-auto">
              <MessageInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                disabled={isLoading}
                model={model}
                onModelChange={onModelChange}
              />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
