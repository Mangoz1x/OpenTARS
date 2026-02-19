"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Bot } from "lucide-react";
import type { AgentData, ArchetypeData } from "../settings-page";
import { AgentCard } from "./agent-card";
import { AgentSetupWizard } from "./agent-setup-wizard";

interface AgentListProps {
  agents: AgentData[];
  setAgents: React.Dispatch<React.SetStateAction<AgentData[]>>;
  archetypes: ArchetypeData[];
}

const POLL_INTERVAL = 30_000;

export function AgentList({ agents, setAgents, archetypes }: AgentListProps) {
  const [showWizard, setShowWizard] = useState(false);

  const pollHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/health-poll", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      const results = data.results as { agentId: string; isOnline: boolean; lastHeartbeat: string | null }[];

      setAgents((prev) =>
        prev.map((agent) => {
          const result = results.find((r) => r.agentId === agent._id);
          if (!result) return agent;
          return {
            ...agent,
            isOnline: result.isOnline,
            ...(result.lastHeartbeat ? { lastHeartbeat: result.lastHeartbeat } : {}),
          };
        })
      );
    } catch {
      // silently fail
    }
  }, [setAgents]);

  // Poll health on mount and at interval
  useEffect(() => {
    pollHealth();
    const interval = setInterval(pollHealth, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pollHealth]);

  function handleUpdate(updated: AgentData) {
    setAgents((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
  }

  function handleDelete(id: string) {
    setAgents((prev) => prev.filter((a) => a._id !== id));
  }

  function handleAgentAdded(agent: AgentData) {
    setAgents((prev) => [...prev, agent]);
    setShowWizard(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage your fleet of remote AI agents.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Agent
        </Button>
      </div>

      {/* Agent grid */}
      {agents.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent._id}
              agent={agent}
              archetypes={archetypes}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="rounded-full bg-muted p-4">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-medium">No agents registered</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add an agent to start delegating tasks. Each agent runs on its own machine
            and connects to TARS over the network.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setShowWizard(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Agent
          </Button>
        </div>
      )}

      {/* Setup wizard */}
      <AgentSetupWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        archetypes={archetypes}
        onAgentAdded={handleAgentAdded}
      />
    </div>
  );
}
