"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, X, RefreshCw, FileCode2, DollarSign, RotateCw } from "lucide-react";

interface TaskData {
  _id: string;
  remoteTaskId: string;
  agentId: string;
  agentName: string;
  prompt: string;
  summary: string;
  status: string;
  result: string | null;
  error: string | null;
  stopReason: string | null;
  costUsd: number;
  turnsCompleted: number;
  filesModified: string[];
  lastActivity: string;
  createdAt: string;
  completedAt: string | null;
}

type StatusFilter = "all" | "running" | "completed" | "failed";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  max_turns: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  max_budget: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  max_turns: "Max Turns",
  max_budget: "Max Budget",
};

function elapsed(createdAt: string, completedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function TaskListPanel() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [cancelTarget, setCancelTarget] = useState<TaskData | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/tasks" : `/api/tasks?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
    const interval = setInterval(fetchTasks, 15_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/tasks/${cancelTarget._id}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t._id === cancelTarget._id ? { ...t, status: "cancelled", completedAt: new Date().toISOString() } : t
          )
        );
      }
    } catch {
      // silently fail
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  const filters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "running", label: "Running" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Tasks assigned to remote agents
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchTasks} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted/50 p-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No tasks found
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">{task.agentName}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${STATUS_COLORS[task.status] ?? ""}`}
                    >
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {task.summary || task.prompt}
                  </p>
                </div>
                {task.status === "running" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setCancelTarget(task)}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Cancel
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <RotateCw className="h-3 w-3" />
                  {elapsed(task.createdAt, task.completedAt)}
                </span>
                {task.turnsCompleted > 0 && (
                  <span>{task.turnsCompleted} turns</span>
                )}
                {task.costUsd > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {task.costUsd.toFixed(4)}
                  </span>
                )}
                {task.filesModified.length > 0 && (
                  <span className="flex items-center gap-1">
                    <FileCode2 className="h-3 w-3" />
                    {task.filesModified.length} file{task.filesModified.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="ml-auto">{timeAgo(task.createdAt)}</span>
              </div>

              {task.error && (
                <div className="mt-2 rounded bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  {task.error}
                </div>
              )}

              {task.lastActivity && task.status === "running" && (
                <div className="mt-2 text-xs text-muted-foreground/70">
                  {task.lastActivity}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the task running on{" "}
              <span className="font-medium text-foreground">
                {cancelTarget?.agentName}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Running</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Cancel Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
