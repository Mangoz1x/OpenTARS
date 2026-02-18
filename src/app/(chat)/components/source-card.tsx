"use client";

import { Globe } from "lucide-react";
import type { Citation } from "./types";

interface SourcesProps {
  citations: Citation[];
}

export function Sources({ citations }: SourcesProps) {
  const unique = [...new Map(citations.map((c) => [c.url, c])).values()];

  if (unique.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {unique.map((citation) => (
        <a
          key={citation.url}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <Globe className="h-3 w-3 shrink-0" />
          <span className="max-w-[200px] truncate">{citation.title}</span>
        </a>
      ))}
    </div>
  );
}
