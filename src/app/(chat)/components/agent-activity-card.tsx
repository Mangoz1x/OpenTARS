import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Circle, X } from "lucide-react";
import type { AgentActivity, AgentStep } from "./types";

function formatElapsed(start: Date, end?: Date): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  switch (status) {
    case "completed":
      return <Check className="h-3.5 w-3.5 text-chart-2" />;
    case "in_progress":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-chart-1" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-destructive" />;
    case "pending":
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
  }
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

interface AgentActivityCardProps {
  activity: AgentActivity;
}

export function AgentActivityCard({ activity }: AgentActivityCardProps) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {activity.agentName}
            </span>
            <Badge
              variant={statusVariant(activity.status)}
              className={
                activity.status === "running"
                  ? "border-chart-1 text-chart-1"
                  : activity.status === "completed"
                    ? "border-chart-2 text-chart-2"
                    : ""
              }
            >
              {statusLabel(activity.status)}
            </Badge>
          </div>
          <span className="font-mono text-xs text-muted-foreground/60">
            {formatElapsed(activity.startedAt, activity.completedAt)}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          {activity.taskSummary}
        </p>

        <div className="flex flex-col gap-1.5">
          {activity.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <StepIcon status={step.status} />
              <span className="font-mono text-xs text-muted-foreground">
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
