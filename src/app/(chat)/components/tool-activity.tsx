"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Globe, Link, Brain, Check, Loader2 } from "lucide-react";
import type { ToolStep, ToolUse } from "./types";

function getToolIcon(toolName: string, active: boolean) {
  const className = active ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5";
  switch (toolName) {
    case "web_search":
      return <Globe className={className} />;
    case "WebFetch":
    case "web_fetch":
      return <Link className={className} />;
    case "memory":
      return <Brain className={className} />;
    default:
      return <Globe className={className} />;
  }
}

function getDefaultLabel(toolName: string) {
  switch (toolName) {
    case "web_search":
      return "Searching the web...";
    case "WebFetch":
    case "web_fetch":
      return "Fetching webpage...";
    case "memory":
      return "Using memory...";
    default:
      return "Working...";
  }
}

function getCompletedLabel(toolName: string) {
  switch (toolName) {
    case "web_search":
      return "Searched the web";
    case "WebFetch":
    case "web_fetch":
      return "Fetched webpage";
    case "memory":
      return "Used memory";
    default:
      return "Used tool";
  }
}

// --- Activity Card: shown during streaming with accumulated steps ---

interface ActivityCardProps {
  steps: ToolStep[];
}

export function ActivityCard({ steps }: ActivityCardProps) {
  if (!steps.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-[85%]"
    >
      <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
        <AnimatePresence initial={false}>
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const isActive = step.status === "active";
            const label = step.detail || (isActive ? getDefaultLabel(step.toolName) : getCompletedLabel(step.toolName));

            return (
              <motion.div
                key={`${i}-${step.toolName}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                {/* Step row: dot + content on same baseline */}
                <div className={`flex items-center gap-2.5 ${isActive ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                    ) : (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/15">
                        <Check className="h-2.5 w-2.5 text-green-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {getToolIcon(step.toolName, isActive)}
                    <span>{label}</span>
                  </div>
                </div>

                {/* Connector line between steps */}
                {!isLast && (
                  <div className="flex w-4 justify-center">
                    <div className="my-[3px] h-2 w-[1.5px] rounded-full bg-border/50" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Completed Tool Use: rendered inline in timeline from DB on reload ---

interface CompletedToolUseProps {
  toolUse: ToolUse;
}

export function CompletedToolUse({ toolUse }: CompletedToolUseProps) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground/70">
      {getToolIcon(toolUse.toolName, false)}
      <span>{toolUse.detail || getCompletedLabel(toolUse.toolName)}</span>
      <Check className="h-2.5 w-2.5 text-green-500/70" />
    </div>
  );
}
