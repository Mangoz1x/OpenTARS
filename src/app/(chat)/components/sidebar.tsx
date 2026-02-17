"use client";

import { Button } from "@/components/ui/button";
import { Plus, MessageSquare } from "lucide-react";

const mockConversations = [
  { id: "1", title: "Stock price checker extension", active: true },
  { id: "2", title: "Set up PostgreSQL backups", active: false },
  { id: "3", title: "Research LLM fine-tuning", active: false },
  { id: "4", title: "Review PR #47 on JustPix", active: false },
  { id: "5", title: "Deploy staging environment", active: false },
];

export function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-muted/50">
      <div className="flex h-12 shrink-0 items-center px-3">
        <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-2 pb-2 pt-4 font-mono text-xs text-muted-foreground/60">
          Recent
        </p>
        <div className="flex flex-col gap-0.5">
          {mockConversations.map((conv) => (
            <button
              key={conv.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                conv.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
