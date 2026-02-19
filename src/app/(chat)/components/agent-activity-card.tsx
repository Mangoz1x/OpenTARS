"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { useTaskPolling, type TaskProgress } from "../hooks/use-task-polling";
import type { AgentActivity } from "./types";

function formatElapsed(start: Date | string, end?: Date | string): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = end ? (typeof end === "string" ? new Date(end) : end) : new Date();
  const ms = e.getTime() - s.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function statusVariant(status: AgentActivity["status"]) {
  switch (status) {
    case "running":
      return "outline" as const;
    case "completed":
      return "outline" as const;
    case "failed":
      return "destructive" as const;
  }
}

function statusLabel(status: AgentActivity["status"]) {
  switch (status) {
    case "running":
      return "RUNNING";
    case "completed":
      return "DONE";
    case "failed":
      return "FAILED";
  }
}

function StatusIcon({ status }: { status: AgentActivity["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-chart-1" />;
    case "completed":
      return <Check className="h-3.5 w-3.5 text-chart-2" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-destructive" />;
  }
}

interface TaskTerminalData {
  status: string;
  result: string | null;
  error: string | null;
}

interface AgentActivityCardProps {
  activity: AgentActivity;
  onTaskComplete?: (taskId: string, data: TaskTerminalData) => void;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "max_turns", "max_budget"]);

export function AgentActivityCard({ activity, onTaskComplete }: AgentActivityCardProps) {
  const taskId = activity.taskId;

  // Live data from polling, merged over static activity data
  const [liveData, setLiveData] = useState<Partial<TaskProgress>>({});

  // Derive running state from merged status (not just the original prop)
  const mergedStatus = (liveData.status ?? activity.status) as string;
  const stillRunning = !TERMINAL_STATUSES.has(mergedStatus);

  // Ticking elapsed timer (updates every second while running)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!stillRunning) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [stillRunning]);

  const handleProgress = useCallback((data: TaskProgress) => {
    setLiveData(data);
  }, []);

  const handleTerminal = useCallback(
    (data: TaskProgress) => {
      setLiveData(data);
      if (taskId && onTaskComplete) {
        onTaskComplete(taskId, {
          status: data.status,
          result: data.result,
          error: data.error,
        });
      }
    },
    [taskId, onTaskComplete]
  );

  useTaskPolling({
    taskId,
    enabled: stillRunning && !!taskId,
    onProgress: handleProgress,
    onTerminal: handleTerminal,
  });

  // Merge: live polling data takes priority over static activity fields
  const turnsCompleted = liveData.turnsCompleted ?? activity.turnsCompleted ?? 0;
  const lastActivity = liveData.lastActivity ?? activity.lastActivity ?? "";
  const costUsd = liveData.costUsd ?? activity.costUsd ?? 0;

  const displayStatus: AgentActivity["status"] = !stillRunning
    ? (mergedStatus === "completed" ? "completed" : "failed")
    : "running";

  const completedAt = !stillRunning
    ? activity.completedAt ?? new Date()
    : undefined;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="flex flex-col gap-1.5 px-3 py-2.5">
        {/* Header row: agent name, status badge, elapsed time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusIcon status={displayStatus} />
            <span className="font-mono text-xs text-muted-foreground">
              {activity.agentName}
            </span>
            <Badge
              variant={statusVariant(displayStatus)}
              className={
                displayStatus === "running"
                  ? "border-chart-1 text-chart-1"
                  : displayStatus === "completed"
                    ? "border-chart-2 text-chart-2"
                    : ""
              }
            >
              {statusLabel(displayStatus)}
            </Badge>
          </div>
          <span className="font-mono text-xs text-muted-foreground/60">
            {formatElapsed(activity.startedAt, completedAt)}
          </span>
        </div>

        {/* Task summary */}
        <p className="text-sm text-muted-foreground">
          {activity.taskSummary}
        </p>

        {/* Live progress line */}
        {(turnsCompleted > 0 || lastActivity) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
            {turnsCompleted > 0 && (
              <span className="font-mono">
                {turnsCompleted} turn{turnsCompleted !== 1 ? "s" : ""}
              </span>
            )}
            {costUsd > 0 && (
              <span className="font-mono">${costUsd.toFixed(4)}</span>
            )}
            {lastActivity && (
              <span className="truncate">{lastActivity}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
