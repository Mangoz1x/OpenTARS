import { AgentActivityCard } from "./agent-activity-card";
import type { ChatMessage } from "./types";

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/);

  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const newlineIndex = inner.indexOf("\n");
      const code = newlineIndex === -1 ? inner : inner.slice(newlineIndex + 1);

      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs"
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
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {renderContent(message.content)}
        </div>
      </div>
    );
  }

  if (message.role === "agent-activity" && message.agentActivity) {
    return (
      <div className="max-w-[85%]">
        <AgentActivityCard activity={message.agentActivity} />
      </div>
    );
  }

  // assistant
  return (
    <div className="max-w-[85%] text-sm text-foreground">
      {renderContent(message.content)}
    </div>
  );
}
