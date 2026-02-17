"use client";

import { useState, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { ChatMessage } from "./types";

const mockMessages: ChatMessage[] = [
  {
    id: "1",
    role: "user",
    content:
      "Build me a stock price checker extension. I want to type a ticker symbol and see the current price, daily change, and a small sparkline chart.",
    timestamp: new Date("2026-02-16T10:00:00"),
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Got it. I'll build a stock price checker extension with ticker lookup, current price, daily change percentage, and a sparkline chart. Let me delegate this to the local agent.",
    timestamp: new Date("2026-02-16T10:00:05"),
  },
  {
    id: "3",
    role: "agent-activity",
    content: "",
    timestamp: new Date("2026-02-16T10:00:06"),
    agentActivity: {
      agentName: "tars-local",
      taskSummary:
        "Build stock-checker extension with price display and sparkline chart",
      status: "completed",
      startedAt: new Date("2026-02-16T10:00:06"),
      completedAt: new Date("2026-02-16T10:02:34"),
      steps: [
        { label: "Scaffold extension structure", status: "completed" },
        { label: "Build server.ts with Yahoo Finance API", status: "completed" },
        { label: "Build component.tsx with sparkline", status: "completed" },
        { label: "Write manifest and register", status: "completed" },
      ],
    },
  },
  {
    id: "4",
    role: "assistant",
    content:
      'Done. The stock checker extension is live. It uses the Yahoo Finance API for real-time data and renders a 30-day sparkline using a lightweight SVG chart. Here\'s what the component looks like:\n\n```tsx\nexport default function StockChecker() {\n  const [ticker, setTicker] = useState("");\n  const [data, setData] = useState<StockData | null>(null);\n\n  return (\n    <div className="flex flex-col gap-4 p-4">\n      <Input\n        placeholder="Enter ticker (e.g. AAPL)"\n        value={ticker}\n        onChange={(e) => setTicker(e.target.value)}\n      />\n      {data && (\n        <div className="flex items-center gap-4">\n          <span className="text-2xl font-bold">${data.price}</span>\n          <Badge variant={data.change > 0 ? "default" : "destructive"}>\n            {data.change > 0 ? "+" : ""}{data.changePercent}%\n          </Badge>\n        </div>\n      )}\n    </div>\n  );\n}\n```\n\nYou can try it now — just type a ticker symbol in the extension panel.',
    timestamp: new Date("2026-02-16T10:02:35"),
  },
];

interface ChatContainerProps {
  onToggleSidebar: () => void;
}

export function ChatContainer({ onToggleSidebar }: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate a response after a short delay
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "I'm not connected to the orchestrator yet — this is a UI preview. Once the backend is wired up, I'll be able to process your requests.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  }, [input]);

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

        {/* Body */}
        {hasMessages ? (
          <MessageList messages={messages} isLoading={isLoading} />
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
              />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
