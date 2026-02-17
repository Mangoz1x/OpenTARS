"use client";

import { useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { StatusIcon, levelStyles } from "./status-message";
import { isRetryable } from "./types";
import type { ChatMessage } from "./types";

interface ErrorGroupProps {
  errors: ChatMessage[];
  onRetry?: (errorMessageId: string) => void;
}

export function ErrorGroup({ errors, onRetry }: ErrorGroupProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = errors[activeIndex];
  const status = current.statusInfo!;
  const styles = levelStyles[status.level];
  const total = errors.length;
  const hasNav = total > 1;

  // Check if ANY error in the group is retryable
  const anyRetryable = errors.some((e) => e.statusInfo && isRetryable(e.statusInfo));

  return (
    <div className="max-w-[85%]">
      <div className={`rounded-lg border ${styles.border} ${styles.bg} p-4`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <StatusIcon level={status.level} errorType={status.errorType} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Title row with optional navigation */}
            <div className="flex items-center gap-2">
              <p className={`text-sm font-medium ${styles.titleColor}`}>
                {status.title}
              </p>

              {hasNav && (
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => i - 1)}
                    disabled={activeIndex === 0}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[3ch] text-center text-[11px] tabular-nums text-muted-foreground">
                    {activeIndex + 1}/{total}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => i + 1)}
                    disabled={activeIndex === total - 1}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {status.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {status.description}
              </p>
            )}

            {status.details && Object.keys(status.details).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                {Object.entries(status.details).map(([key, value]) => (
                  <span key={key} className="text-xs text-muted-foreground">
                    <span className="font-medium text-muted-foreground/80">{key}:</span>{" "}
                    {value}
                  </span>
                ))}
              </div>
            )}

            {/* Footer: retry button or non-retryable indicator */}
            <div className="flex items-center gap-3 pt-0.5">
              {anyRetryable && onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(current.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/15"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {!isRetryable(status) && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Ban className="h-3 w-3" />
                  Not retryable
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
