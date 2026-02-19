"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { AgentData, ArchetypeData } from "../settings-page";

type Step = "setup" | "instructions" | "verify";

interface AgentSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archetypes: ArchetypeData[];
  onAgentAdded: (agent: AgentData) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

export function AgentSetupWizard({ open, onOpenChange, archetypes, onAgentAdded }: AgentSetupWizardProps) {
  const [step, setStep] = useState<Step>("setup");

  // Step 1: Setup
  const [name, setName] = useState("");
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>(["developer"]);
  const [token, setToken] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Step 3: Verify
  const [agentUrl, setAgentUrl] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"success" | "error" | null>(null);
  const [registeredAgent, setRegisteredAgent] = useState<AgentData | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tarsUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("setup");
        setName("");
        setSelectedArchetypes(["developer"]);
        setToken("");
        setError("");
        setAgentUrl("");
        setVerifying(false);
        setVerifyResult(null);
        setRegisteredAgent(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll for agent registration
  const startPolling = useCallback((tkn: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/by-token/${tkn}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.registered && data.agent) {
          if (pollRef.current) clearInterval(pollRef.current);
          setRegisteredAgent(data.agent);
          setAgentUrl(data.agent.url || "");
          setStep("verify");
        }
      } catch {
        // silently retry next interval
      }
    }, 3000);
  }, []);

  function toggleArchetype(id: string) {
    setSelectedArchetypes((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleGenerateToken() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/agents/setup-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: name.trim(),
          archetypes: selectedArchetypes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate token");
        return;
      }
      const data = await res.json();
      setToken(data.token);
      setStep("instructions");
      startPolling(data.token);
    } catch {
      setError("Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function handleVerify() {
    setError("");
    setVerifying(true);
    setVerifyResult(null);

    const url = agentUrl.trim().replace(/\/$/, "");
    if (!url) {
      setError("Agent URL is required");
      setVerifying(false);
      return;
    }

    try {
      if (registeredAgent) {
        await fetch(`/api/agents/${registeredAgent._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        const healthRes = await fetch(`/api/agents/${registeredAgent._id}/health`);
        const healthData = await healthRes.json();

        if (healthData.isOnline) {
          setVerifyResult("success");
          const agentRes = await fetch(`/api/agents/${registeredAgent._id}`);
          const agentData = await agentRes.json();
          setRegisteredAgent(agentData.agent);
        } else {
          setVerifyResult("error");
          setError("Could not reach the agent. Make sure it's running and the URL is correct.");
        }
      } else {
        setVerifyResult("error");
        setError("Agent hasn't registered yet. Make sure the agent server is running with the correct token.");
      }
    } catch {
      setVerifyResult("error");
      setError("Verification failed. Check the URL and try again.");
    } finally {
      setVerifying(false);
    }
  }

  function handleDone() {
    if (registeredAgent) {
      onAgentAdded(registeredAgent);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "setup" && "Add Agent"}
            {step === "instructions" && "Setup Instructions"}
            {step === "verify" && "Verify Connection"}
          </DialogTitle>
          <DialogDescription>
            {step === "setup" && "Configure the agent, then generate a setup token."}
            {step === "instructions" && "Follow these steps on the agent machine."}
            {step === "verify" && "Confirm the agent can communicate with TARS."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Setup — name, archetypes, generate token */}
        {step === "setup" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dev VM, Cloud Worker"
                autoFocus
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
                {archetypes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No archetypes defined yet. The agent will use default settings.
                  </p>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleGenerateToken} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Token"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Instructions */}
        {step === "instructions" && (
          <div className="space-y-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  1
                </span>
                <span>Download or clone the agent server onto the target machine.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <span>Set the environment variables:</span>
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-2 rounded-md bg-muted p-2 min-w-0">
                      <code className="min-w-0 flex-1 break-all text-xs">TARS_SETUP_TOKEN={token}</code>
                      <CopyButton text={`TARS_SETUP_TOKEN=${token}`} />
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-muted p-2 min-w-0">
                      <code className="min-w-0 flex-1 break-all text-xs">TARS_URL={tarsUrl}</code>
                      <CopyButton text={`TARS_URL=${tarsUrl}`} />
                    </div>
                  </div>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  3
                </span>
                <div className="flex-1">
                  <span>
                    Run <code className="rounded bg-muted px-1 text-xs">npm run dev</code>
                  </span>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  4
                </span>
                <span>The agent will automatically register with TARS.</span>
              </li>
            </ol>

            <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Waiting for agent to register...
              </span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("setup")}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => setStep("verify")}>
                Skip to Verify
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Verify */}
        {step === "verify" && (
          <div className="space-y-4">
            {registeredAgent && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  Agent &ldquo;{registeredAgent.name}&rdquo; registered successfully!
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="agent-url">Agent URL</Label>
              <Input
                id="agent-url"
                value={agentUrl}
                onChange={(e) => {
                  setAgentUrl(e.target.value);
                  setVerifyResult(null);
                  setError("");
                }}
                placeholder="e.g. http://192.168.1.100:4001"
                autoFocus
              />
            </div>

            {verifyResult === "success" && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  Connection verified! Agent is online.
                </span>
              </div>
            )}

            {verifyResult === "error" && error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("instructions")}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              {verifyResult === "success" ? (
                <Button onClick={handleDone}>Done</Button>
              ) : (
                <Button onClick={handleVerify} disabled={verifying}>
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Connection"
                  )}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
