export type MessageRole = "user" | "assistant" | "agent-activity";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  agentActivity?: AgentActivity;
}

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
