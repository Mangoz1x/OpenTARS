"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot } from "lucide-react";
import { AgentList } from "./components/agent-list";

export interface AgentData {
  _id: string;
  name: string;
  url: string;
  capabilities: string[];
  archetypes: string[];
  preferredArchetype?: string;
  defaultCwd?: string;
  defaultModel?: string;
  isLocal: boolean;
  autoStart: boolean;
  isOnline: boolean;
  lastHeartbeat?: string;
  machine?: {
    hostname?: string;
    os?: string;
    cpus?: number;
    memoryGb?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ArchetypeData {
  _id: string;
  name: string;
  description: string;
}

type Section = "agents";

interface SettingsPageProps {
  initialAgents: AgentData[];
  archetypes: ArchetypeData[];
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof Bot }[] = [
  { id: "agents", label: "Agents", icon: Bot },
];

export default function SettingsPage({ initialAgents, archetypes }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>("agents");
  const [agents, setAgents] = useState<AgentData[]>(initialAgents);

  return (
    <div className="flex h-dvh bg-background">
      {/* Left nav */}
      <div className="flex w-52 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex h-12 items-center px-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Chat
            </Button>
          </Link>
        </div>
        <nav className="flex-1 px-2 pt-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeSection === item.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          {activeSection === "agents" && (
            <AgentList agents={agents} setAgents={setAgents} archetypes={archetypes} />
          )}
        </div>
      </div>
    </div>
  );
}
