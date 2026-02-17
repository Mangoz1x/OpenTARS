"use client";

import { Code, Search, Clock, GitPullRequest } from "lucide-react";
import type { ReactNode } from "react";

const suggestions: { icon: ReactNode; label: string; prompt: string }[] = [
  {
    icon: <Code className="h-4 w-4" />,
    label: "Build a stock price checker",
    prompt: "Build me a stock price checker",
  },
  {
    icon: <Search className="h-4 w-4" />,
    label: "Research the latest AI papers",
    prompt: "Research the latest AI papers",
  },
  {
    icon: <Clock className="h-4 w-4" />,
    label: "Schedule a database backup",
    prompt: "Set up a cron job to back up my DB",
  },
  {
    icon: <GitPullRequest className="h-4 w-4" />,
    label: "Review my last pull request",
    prompt: "Review my last pull request",
  },
];

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-end pb-44">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-4">
        {/* Greeting */}
        <p className="text-base text-muted-foreground">
          What can I help you with?
        </p>

        {/* Suggestion grid */}
        <div className="grid w-full grid-cols-2 gap-2">
          {suggestions.map((s) => (
            <button
              key={s.prompt}
              onClick={() => onSuggestionClick(s.prompt)}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent/50 hover:text-foreground"
            >
              <span className="shrink-0 text-muted-foreground/60">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
