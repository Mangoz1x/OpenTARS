import { useEffect, useRef, useCallback } from "react";

export interface TaskProgress {
  status: string;
  turnsCompleted: number;
  lastActivity: string;
  costUsd: number;
  result: string | null;
  error: string | null;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "max_turns", "max_budget"]);

interface UseTaskPollingOptions {
  taskId: string | undefined;
  enabled: boolean;
  intervalMs?: number;
  onProgress?: (data: TaskProgress) => void;
  onTerminal?: (data: TaskProgress) => void;
}

/**
 * Polls /api/tasks/:id/progress every `intervalMs` using setTimeout chains
 * (each poll waits for the previous to finish). Stops on terminal status.
 */
export function useTaskPolling({
  taskId,
  enabled,
  intervalMs = 3000,
  onProgress,
  onTerminal,
}: UseTaskPollingOptions) {
  const onProgressRef = useRef(onProgress);
  const onTerminalRef = useRef(onTerminal);
  onProgressRef.current = onProgress;
  onTerminalRef.current = onTerminal;

  const poll = useCallback(async () => {
    if (!taskId) return null;
    try {
      const res = await fetch(`/api/tasks/${taskId}/progress`);
      if (!res.ok) return null;
      return (await res.json()) as TaskProgress;
    } catch {
      return null;
    }
  }, [taskId]);

  useEffect(() => {
    if (!enabled || !taskId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      if (cancelled) return;

      const data = await poll();
      if (cancelled) return;

      if (data) {
        onProgressRef.current?.(data);

        if (TERMINAL_STATUSES.has(data.status)) {
          onTerminalRef.current?.(data);
          return; // stop polling
        }
      }

      timer = setTimeout(loop, intervalMs);
    };

    // Start first poll immediately
    loop();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, taskId, intervalMs, poll]);
}
