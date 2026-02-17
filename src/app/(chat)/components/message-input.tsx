"use client";

import { useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUp } from "lucide-react";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    // leading-5 = 20px per line, 5 lines max
    const maxHeight = 20 * 5;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim()) onSend();
      }
    },
    [value, onSend]
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-4">
      <div className="flex items-end rounded-xl border bg-background p-1 pl-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message TARS..."
          disabled={disabled}
          rows={1}
          className="block min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50 scrollbar-hidden"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg"
              disabled={!value.trim() || disabled}
              onClick={onSend}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="font-mono text-xs">Enter</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
