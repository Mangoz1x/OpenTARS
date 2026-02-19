import { AgentActivityCard } from "./agent-activity-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { Sources } from "./source-card";
import { StatusMessage } from "./status-message";
import { ActivityCard, CompletedToolUse } from "./tool-activity";
import { UserQuestionCard } from "./user-question-card";
import { UserQuestionSkeleton } from "./user-question-skeleton";
import type { ChatMessage } from "./types";

function renderPlainContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/);

  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const newlineIndex = inner.indexOf("\n");
      const code = newlineIndex === -1 ? inner : inner.slice(newlineIndex + 1);

      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg bg-primary-foreground/10 p-3 font-mono text-xs"
        >
          <code>{code}</code>
        </pre>
      );
    }

    return part.split("\n\n").map((paragraph, j) => (
      <p key={`${i}-${j}`} className={j > 0 ? "mt-2" : ""}>
        {paragraph}
      </p>
    ));
  });
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onQuestionSubmit?: (messageId: string, answers: Record<string, string>) => void;
  onRetry?: (errorMessageId: string) => void;
  onTaskComplete?: (taskId: string, data: { status: string; result: string | null; error: string | null }) => void;
}

export function MessageBubble({ message, isStreaming, onQuestionSubmit, onRetry, onTaskComplete }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {renderPlainContent(message.content)}
        </div>
      </div>
    );
  }

  if (message.role === "agent-activity" && message.agentActivity) {
    return (
      <div className="max-w-[85%]">
        <AgentActivityCard activity={message.agentActivity} onTaskComplete={onTaskComplete} />
      </div>
    );
  }

  if (message.role === "status" && message.statusInfo) {
    return (
      <div className="max-w-[85%]">
        <StatusMessage
          status={message.statusInfo}
          onRetry={onRetry ? () => onRetry(message.id) : undefined}
        />
      </div>
    );
  }

  if (message.role === "tool-activity" && message.toolSteps?.length) {
    return (
      <div className="max-w-[85%]">
        <ActivityCard steps={message.toolSteps} />
      </div>
    );
  }

  if (message.role === "tool-use" && message.toolUse) {
    return (
      <div className="max-w-[85%]">
        <CompletedToolUse toolUse={message.toolUse} />
      </div>
    );
  }

  if (message.role === "user-question") {
    return (
      <div className="max-w-[85%]">
        {message.userQuestion ? (
          <UserQuestionCard
            question={message.userQuestion}
            onSubmit={(answers) => onQuestionSubmit?.(message.id, answers)}
          />
        ) : (
          <UserQuestionSkeleton />
        )}
      </div>
    );
  }

  // Assistant — always rendered through MarkdownRenderer.
  // .streaming class scopes CSS @starting-style fade-in + cursor to active streaming.
  return (
    <div className={`max-w-[85%] text-sm text-foreground ${isStreaming ? "streaming" : ""}`}>
      <MarkdownRenderer content={message.content} />
      {message.citations && message.citations.length > 0 && (
        <Sources citations={message.citations} />
      )}
    </div>
  );
}
