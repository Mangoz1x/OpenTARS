export type TaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "max_turns"
  | "max_budget";

export interface CreateTaskRequest {
  prompt: string;
  systemPrompt?: string;
  allowedTools?: string[];
  permissionMode?: string;
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  sessionId?: string | null;
}

export type SSEEventType =
  | "text_delta"
  | "tool_start"
  | "tool_end"
  | "status"
  | "result"
  | "error";

export interface SSEEvent {
  id: number;
  event: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}
