"use client";

import { Button } from "@/components/ui/button";

const suggestions = [
  "Build me a stock price checker",
  "Research the latest AI papers",
  "Set up a cron job to back up my DB",
  "Review my last pull request",
];

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="flex flex-col items-center gap-3">
        <h1 className="font-mono text-4xl tracking-[0.3em] text-muted-foreground/60">
          TARS
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask me to build, research, deploy, or automate anything.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="h-auto px-3 py-1.5 text-xs"
            onClick={() => onSuggestionClick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
