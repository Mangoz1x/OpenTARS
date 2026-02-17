"use client";

import { MessageCircleQuestion } from "lucide-react";

export function UserQuestionSkeleton() {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary">
          TARS is preparing a question...
        </span>
      </div>

      <div className="space-y-3 animate-pulse">
        {/* Header chip skeleton */}
        <div className="h-5 w-16 rounded-md bg-muted" />

        {/* Question text skeleton */}
        <div className="space-y-1.5">
          <div className="h-4 w-3/4 rounded bg-muted" />
        </div>

        {/* Option skeletons */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
