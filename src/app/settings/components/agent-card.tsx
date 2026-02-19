"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Monitor, Cpu, MemoryStick } from "lucide-react";
import type { AgentData, ArchetypeData } from "../settings-page";
import { AgentEditDialog } from "./agent-edit-dialog";

interface AgentCardProps {
  agent: AgentData;
  archetypes: ArchetypeData[];
  onUpdate: (updated: AgentData) => void;
  onDelete: (id: string) => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "Never";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AgentCard({ agent, archetypes, onUpdate, onDelete }: AgentCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agent._id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(agent._id);
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30">
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium">{agent.name}</h3>
              {agent.isLocal && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  Local
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.url}</p>
          </div>
          <Badge
            variant={agent.isOnline ? "default" : "secondary"}
            className={`shrink-0 text-[10px] ${
              agent.isOnline ? "bg-emerald-600 hover:bg-emerald-600" : ""
            }`}
          >
            <span
              className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                agent.isOnline ? "bg-emerald-200" : "bg-muted-foreground/50"
              }`}
            />
            {agent.isOnline ? "Online" : "Offline"}
          </Badge>
        </div>

        {/* Archetypes */}
        {agent.archetypes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {agent.archetypes.map((a) => (
              <Badge key={a} variant="outline" className="text-[10px] font-normal">
                {a}
              </Badge>
            ))}
          </div>
        )}

        {/* Machine info */}
        {agent.machine && (
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {agent.machine.hostname && (
              <span className="flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                {agent.machine.hostname}
              </span>
            )}
            {agent.machine.cpus && (
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {agent.machine.cpus} cores
              </span>
            )}
            {agent.machine.memoryGb && (
              <span className="flex items-center gap-1">
                <MemoryStick className="h-3 w-3" />
                {agent.machine.memoryGb} GB
              </span>
            )}
          </div>
        )}

        {/* Footer: last heartbeat + actions */}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-[11px] text-muted-foreground">
            Last seen: {timeAgo(agent.lastHeartbeat)}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowEdit(true)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {!agent.isLocal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <AgentEditDialog
        agent={agent}
        archetypes={archetypes}
        open={showEdit}
        onOpenChange={setShowEdit}
        onSave={onUpdate}
      />

      {/* Delete confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &ldquo;{agent.name}&rdquo; from the registry.
              The agent server will continue running but won&apos;t be managed by TARS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
