"use client";

import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface ConversationItem {
  _id: string;
  title: string | null;
  lastMessageAt: string;
}

interface SidebarProps {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, onSelect, onNewChat, onDelete }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-muted/50">
      <div className="flex h-12 shrink-0 items-center px-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 text-xs"
          onClick={onNewChat}
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length > 0 && (
          <>
            <p className="px-2 pb-2 pt-4 font-mono text-xs text-muted-foreground/60">
              Recent
            </p>
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv._id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    conv._id === activeId
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onClick={() => onSelect(conv._id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{conv.title || "New conversation"}</span>
                  </button>
                  <button
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv._id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </nav>
    </div>
  );
}
