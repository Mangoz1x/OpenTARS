"use client";

import { useState, useCallback } from "react";
import { Check, MessageCircleQuestion, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserQuestion, UserQuestionItem } from "./types";

interface SingleQuestionProps {
  item: UserQuestionItem;
  selected: string[];
  onToggle: (label: string) => void;
  disabled: boolean;
}

function SingleQuestion({ item, selected, onToggle, disabled }: SingleQuestionProps) {
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);

  const isSelected = (label: string) => selected.includes(label);

  const handleOptionClick = (label: string) => {
    if (disabled) return;
    setShowOther(false);
    onToggle(label);
  };

  const handleOtherClick = () => {
    if (disabled) return;
    setShowOther(true);
    // For single select, clear other selections
    if (!item.multiSelect) {
      selected.forEach((s) => onToggle(s));
    }
  };

  const handleOtherSubmit = () => {
    if (!otherText.trim()) return;
    onToggle(`Other: ${otherText.trim()}`);
    setShowOther(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {item.header}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.question}</p>

      <div className="space-y-2">
        {item.options.map((option) => {
          const active = isSelected(option.label);
          return (
            <button
              key={option.label}
              onClick={() => handleOptionClick(option.label)}
              disabled={disabled}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                active
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-background hover:border-border hover:bg-muted/50"
              } ${disabled ? "cursor-default opacity-70" : "cursor-pointer"}`}
            >
              <div
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                  item.multiSelect
                    ? active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                    : active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "rounded-full border-muted-foreground/40"
                } ${!item.multiSelect && !active ? "rounded-full" : ""}`}
              >
                {active && <Check className="h-3 w-3" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
              </div>
            </button>
          );
        })}

        {/* Other option */}
        {!showOther ? (
          <button
            onClick={handleOtherClick}
            disabled={disabled}
            className={`flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors ${
              disabled ? "cursor-default opacity-70" : "cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/30"
            }`}
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">Other...</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
            <input
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOtherSubmit();
              }}
              placeholder="Type your answer..."
              autoFocus
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={handleOtherSubmit}
              disabled={!otherText.trim()}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface UserQuestionCardProps {
  question: UserQuestion;
  onSubmit: (answers: Record<string, string>) => void;
}

export function UserQuestionCard({ question, onSubmit }: UserQuestionCardProps) {
  // Track selections per question (keyed by question text)
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const handleToggle = useCallback(
    (questionText: string, multiSelect: boolean, label: string) => {
      setSelections((prev) => {
        const current = prev[questionText] ?? [];

        if (multiSelect) {
          // Toggle the label in/out
          const next = current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label];
          return { ...prev, [questionText]: next };
        }

        // Single select — replace
        return { ...prev, [questionText]: [label] };
      });
    },
    []
  );

  const allAnswered = question.questions.every(
    (q) => (selections[q.question] ?? []).length > 0
  );

  const handleSubmit = useCallback(() => {
    const answers: Record<string, string> = {};
    for (const q of question.questions) {
      const selected = selections[q.question] ?? [];
      answers[q.question] = selected.join(", ");
    }
    onSubmit(answers);
  }, [question.questions, selections, onSubmit]);

  if (question.answered) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-medium">Answered</span>
        </div>
        {question.questions.map((q) => (
          <div key={q.question} className="space-y-1">
            <p className="text-sm text-muted-foreground">{q.question}</p>
            <p className="text-sm font-medium text-foreground">
              {question.answers?.[q.question] ?? "—"}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary">TARS needs your input</span>
      </div>

      <div className="space-y-6">
        {question.questions.map((q) => (
          <SingleQuestion
            key={q.question}
            item={q}
            selected={selections[q.question] ?? []}
            onToggle={(label) => handleToggle(q.question, q.multiSelect, label)}
            disabled={question.answered}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          disabled={!allAnswered}
          onClick={handleSubmit}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
