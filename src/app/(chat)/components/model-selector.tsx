"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Fast and capable",
  },
  {
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    description: "Most intelligent",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    description: "Fastest responses",
  },
];

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = MODELS.find((m) => m.id === value) ?? MODELS[0];

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div ref={containerRef} className="relative">
      {/* Drop-up menu */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg border bg-popover p-1 shadow-md">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {model.id === value && (
                  <Check className="h-3.5 w-3.5 text-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{model.label}</div>
                <div className="text-xs text-muted-foreground">
                  {model.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {selected.label}
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}
