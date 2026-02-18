export type MessageRole = "user" | "assistant" | "agent-activity" | "status" | "user-question" | "tool-use" | "tool-activity";

export interface Citation {
  url: string;
  title: string;
  citedText?: string;
}

export interface ToolActivity {
  toolName: string;
  detail?: string;
}

export interface ToolStep {
  toolName: string;
  detail?: string;
  status: "active" | "completed";
}

export interface ToolUse {
  toolName: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  agentActivity?: AgentActivity;
  statusInfo?: StatusInfo;
  userQuestion?: UserQuestion;
  citations?: Citation[];
  toolUse?: ToolUse;
  toolSteps?: ToolStep[];
}

// --- Stop reasons & error result types ---

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "refusal"
  | "tool_use"
  | null;

export type ErrorType =
  | "error_max_turns"
  | "error_during_execution"
  | "error_max_budget_usd"
  | "error_max_structured_output_retries"
  | "api_key_missing"
  | "stream_interrupted"
  | "unknown";

export type StatusLevel = "info" | "warning" | "error" | "success";

export interface StatusInfo {
  level: StatusLevel;
  title: string;
  description?: string;
  stopReason?: StopReason;
  errorType?: ErrorType;
  details?: Record<string, string | number>;
  retryable?: boolean;
}

/** Retryable error types — used at render time as a fallback for old DB records
 *  that were saved before the `retryable` field existed. */
const RETRYABLE_ERROR_TYPES = new Set([
  "error_during_execution",
  "stream_interrupted",
  "error_max_turns",
  "unknown",
]);

export function isRetryable(status: StatusInfo): boolean {
  if (status.retryable !== undefined) return status.retryable;
  if (status.level !== "error") return false;
  return RETRYABLE_ERROR_TYPES.has(status.errorType ?? "");
}

// --- User questions (AskUserQuestion tool) ---

export interface UserQuestionOption {
  label: string;
  description: string;
}

export interface UserQuestionItem {
  header: string;
  question: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
}

export interface UserQuestion {
  questions: UserQuestionItem[];
  answered: boolean;
  answers?: Record<string, string>;
}

// --- Agent activity (existing) ---

export interface AgentActivity {
  agentName: string;
  taskSummary: string;
  status: "running" | "completed" | "failed";
  steps: AgentStep[];
  startedAt: Date;
  completedAt?: Date;
}

export interface AgentStep {
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}
