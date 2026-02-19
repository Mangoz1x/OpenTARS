"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { AgentData, ArchetypeData } from "../settings-page";

interface AgentEditDialogProps {
  agent: AgentData;
  archetypes: ArchetypeData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: AgentData) => void;
}

export function AgentEditDialog({ agent, archetypes, open, onOpenChange, onSave }: AgentEditDialogProps) {
  const [name, setName] = useState(agent.name);
  const [url, setUrl] = useState(agent.url);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>(agent.archetypes);
  const [defaultCwd, setDefaultCwd] = useState(agent.defaultCwd || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync form when agent prop changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(agent.name);
      setUrl(agent.url);
      setSelectedArchetypes(agent.archetypes);
      setDefaultCwd(agent.defaultCwd || "");
      setError("");
    }
  }, [open, agent]);

  function toggleArchetype(id: string) {
    setSelectedArchetypes((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!url.trim()) {
      setError("URL is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim().replace(/\/$/, ""),
          archetypes: selectedArchetypes,
          defaultCwd: defaultCwd.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update agent");
        return;
      }

      const data = await res.json();
      onSave(data.agent);
      onOpenChange(false);
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>Update the agent&apos;s configuration.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-url">URL</Label>
            <Input
              id="edit-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:4001"
            />
          </div>

          <div className="space-y-2">
            <Label>Archetypes</Label>
            <div className="flex flex-wrap gap-1.5">
              {archetypes.map((a) => (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => toggleArchetype(a._id)}
                  className="transition-colors"
                >
                  <Badge
                    variant={selectedArchetypes.includes(a._id) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                  >
                    {a.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-cwd">Default Working Directory</Label>
            <Input
              id="edit-cwd"
              value={defaultCwd}
              onChange={(e) => setDefaultCwd(e.target.value)}
              placeholder="/home/user/project (optional)"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
