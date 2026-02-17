"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleAlert,
  Clock,
  DollarSign,
  Info,
  RefreshCw,
  ShieldX,
  Zap,
} from "lucide-react";
import type { StatusInfo, StatusLevel } from "./types";

const levelStyles: Record<StatusLevel, { bg: string; border: string; icon: string; titleColor: string }> = {
  info: {
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    icon: "text-blue-500",
    titleColor: "text-blue-500",
  },
  success: {
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    icon: "text-emerald-500",
    titleColor: "text-emerald-500",
  },
  warning: {
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    icon: "text-amber-500",
    titleColor: "text-amber-500",
  },
  error: {
    bg: "bg-red-500/8",
    border: "border-red-500/20",
    icon: "text-red-400",
    titleColor: "text-red-400",
  },
};

function StatusIcon({ level, errorType }: { level: StatusLevel; errorType?: string }) {
  const className = `h-4 w-4 ${levelStyles[level].icon}`;

  if (errorType === "error_max_budget_usd") return <DollarSign className={className} />;
  if (errorType === "error_max_turns") return <RefreshCw className={className} />;
  if (errorType === "api_key_missing") return <ShieldX className={className} />;

  switch (level) {
    case "info":
      return <Info className={className} />;
    case "success":
      return <CheckCircle2 className={className} />;
    case "warning":
      return <AlertTriangle className={className} />;
    case "error":
      return <CircleAlert className={className} />;
  }
}

function StopReasonBadge({ reason }: { reason: string }) {
  const badges: Record<string, { label: string; icon: React.ReactNode }> = {
    max_tokens: { label: "Token limit", icon: <Zap className="h-3 w-3" /> },
    refusal: { label: "Declined", icon: <Ban className="h-3 w-3" /> },
    end_turn: { label: "Complete", icon: <CheckCircle2 className="h-3 w-3" /> },
    stop_sequence: { label: "Stop sequence", icon: <Clock className="h-3 w-3" /> },
    tool_use: { label: "Tool call", icon: <Zap className="h-3 w-3" /> },
  };

  const badge = badges[reason];
  if (!badge) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {badge.icon}
      {badge.label}
    </span>
  );
}

interface StatusMessageProps {
  status: StatusInfo;
}

export function StatusMessage({ status }: StatusMessageProps) {
  const styles = levelStyles[status.level];

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StatusIcon level={status.level} errorType={status.errorType} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${styles.titleColor}`}>
              {status.title}
            </p>
            {status.stopReason && status.stopReason !== "end_turn" && (
              <StopReasonBadge reason={status.stopReason} />
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
        </div>
      </div>
    </div>
  );
}
