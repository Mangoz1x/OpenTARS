import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-muted text-xs font-mono">
          T
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-1 pt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}
