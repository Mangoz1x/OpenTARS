export type MessageRole = "user" | "assistant" | "agent-activity" | "status" | "user-question";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  agentActivity?: AgentActivity;
  statusInfo?: StatusInfo;
  userQuestion?: UserQuestion;
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
