"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Database,
  Cloud,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldAlert,
  Key,
} from "lucide-react";

type Step = "choose-method" | "atlas-keys" | "manual-uri" | "api-key" | "password";

const ERROR_HINTS: Record<string, { title: string; steps: string[] }> = {
  CONNECTION_TIMEOUT: {
    title: "Could not reach the database",
    steps: [
      "If using Atlas, check that your cluster is active — free-tier clusters pause after 60 days of inactivity",
      "Go to Atlas → Network Access and make sure your IP (or 0.0.0.0/0) is on the access list",
      "Wait ~30 seconds after adding an IP for the change to propagate",
      "Verify the hostname in your URI is correct (Atlas → Connect → Drivers)",
    ],
  },
  AUTH_FAILED: {
    title: "Database authentication failed",
    steps: [
      "Go to your Atlas dashboard → Database Access",
      "Check that the username and password in your URI match a database user",
      "Make sure the user has read/write permissions on the target database",
    ],
  },
  HOST_NOT_FOUND: {
    title: "Could not resolve the database hostname",
    steps: [
      "Double-check the hostname in your connection URI",
      "Make sure you copied the full URI from Atlas (Connect → Drivers)",
      "Check your internet connection",
    ],
  },
  CONNECTION_REFUSED: {
    title: "Connection refused",
    steps: [
      "Make sure your MongoDB server is running",
      "Check that the port in your URI is correct (default: 27017)",
      "Verify no firewall is blocking the connection",
    ],
  },
  TLS_ERROR: {
    title: "TLS/SSL connection error",
    steps: [
      "Check your cluster's TLS settings in Atlas",
      "Make sure your URI includes the correct options (e.g. ?tls=true)",
      "Try using the connection string from Atlas → Connect → Drivers",
    ],
  },
};

interface SetupFormProps {
  initialStep?: "database" | "password";
  hasAnthropicKey?: boolean;
}

export default function SetupForm({
  initialStep = "database",
  hasAnthropicKey = false,
}: SetupFormProps) {
  const router = useRouter();
  const needsApiKey = !hasAnthropicKey;

  function getFirstStep(): Step {
    if (initialStep === "password") return needsApiKey ? "api-key" : "password";
    return "choose-method";
  }

  const [step, setStep] = useState<Step>(getFirstStep);
  const [atlasPublicKey, setAtlasPublicKey] = useState("");
  const [atlasPrivateKey, setAtlasPrivateKey] = useState("");
  const [atlasGroupId, setAtlasGroupId] = useState("");
  const [mongodbUri, setMongodbUri] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [atlasLoading, setAtlasLoading] = useState(false);

  const canGoBack = initialStep !== "password" || needsApiKey;

  function clearError() {
    setError("");
    setErrorCode("");
  }

  async function handleAtlasSetup() {
    clearError();

    if (!atlasPublicKey.trim() || !atlasPrivateKey.trim()) {
      setError("Both API keys are required");
      return;
    }

    setAtlasLoading(true);

    try {
      const res = await fetch("/api/setup/atlas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: atlasPublicKey.trim(),
          privateKey: atlasPrivateKey.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Atlas setup failed");
        setErrorCode(data.code || "");
        return;
      }

      setMongodbUri(data.mongodbUri);
      setAtlasGroupId(data.groupId);
      setStep(needsApiKey ? "api-key" : "password");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAtlasLoading(false);
    }
  }

  function handleManualNext() {
    clearError();

    if (!mongodbUri.trim()) {
      setError("Connection URI is required");
      return;
    }

    if (
      !mongodbUri.trim().startsWith("mongodb://") &&
      !mongodbUri.trim().startsWith("mongodb+srv://")
    ) {
      setError("URI must start with mongodb:// or mongodb+srv://");
      return;
    }

    setStep(needsApiKey ? "api-key" : "password");
  }

  function handleApiKeyNext() {
    clearError();

    if (!anthropicApiKey.trim()) {
      setError("API key is required");
      return;
    }

    if (!anthropicApiKey.trim().startsWith("sk-ant-")) {
      setError("That doesn't look like a valid Anthropic API key");
      return;
    }

    setStep("password");
  }

  async function handleFinalSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, string> = { password };

      if (mongodbUri) body.mongodbUri = mongodbUri;
      if (atlasPublicKey) body.atlasPublicKey = atlasPublicKey;
      if (atlasPrivateKey) body.atlasPrivateKey = atlasPrivateKey;
      if (atlasGroupId) body.atlasGroupId = atlasGroupId;
      if (anthropicApiKey) body.anthropicApiKey = anthropicApiKey;

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Setup failed");
        setErrorCode(data.code || "");
        return;
      }

      if (data.existing) {
        // DB already has a TARS instance — go to login
        router.push("/login");
        router.refresh();
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    clearError();
    if (step === "atlas-keys" || step === "manual-uri") {
      setStep("choose-method");
    } else if (step === "api-key") {
      if (initialStep === "password") {
        // Came directly to api-key, nowhere to go back
        return;
      }
      if (mongodbUri && atlasGroupId) {
        setStep("atlas-keys");
      } else if (mongodbUri) {
        setStep("manual-uri");
      } else {
        setStep("choose-method");
      }
    } else if (step === "password" && canGoBack) {
      if (needsApiKey) {
        setStep("api-key");
      } else if (mongodbUri && atlasGroupId) {
        setStep("atlas-keys");
      } else if (mongodbUri) {
        setStep("manual-uri");
      } else {
        setStep("choose-method");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">TARS</CardTitle>
          <CardDescription>
            {step === "choose-method" && "How would you like to connect your database?"}
            {step === "atlas-keys" && "Enter your MongoDB Atlas API keys"}
            {step === "manual-uri" && "Enter your MongoDB connection URI"}
            {step === "api-key" && "Enter your Anthropic API key"}
            {step === "password" && "Create a password to secure your instance"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step: Choose Method */}
          {step === "choose-method" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setStep("atlas-keys");
                }}
                className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Set up with Atlas</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically create a free MongoDB cluster
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  clearError();
                  setStep("manual-uri");
                }}
                className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">I have a cluster</p>
                    <p className="text-xs text-muted-foreground">
                      Paste an existing MongoDB connection URI
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step: Atlas API Keys */}
          {step === "atlas-keys" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="atlas-public-key">Public Key</Label>
                <Input
                  id="atlas-public-key"
                  value={atlasPublicKey}
                  onChange={(e) => setAtlasPublicKey(e.target.value)}
                  placeholder="e.g. abcdefgh"
                  disabled={atlasLoading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="atlas-private-key">Private Key</Label>
                <Input
                  id="atlas-private-key"
                  type="password"
                  value={atlasPrivateKey}
                  onChange={(e) => setAtlasPrivateKey(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={atlasLoading}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Create an API key at{" "}
                <a
                  href="https://cloud.mongodb.com/v2#/org/access/apiKeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Atlas &rarr; Organization Access &rarr; API Keys
                </a>
                . The key needs the <strong>Organization Owner</strong> role.
              </p>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {ERROR_HINTS[errorCode]?.title ?? error}
                    </p>
                  </div>
                  {ERROR_HINTS[errorCode] && (
                    <ol className="text-xs text-muted-foreground space-y-1 ml-6 list-decimal">
                      {ERROR_HINTS[errorCode].steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={atlasLoading}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleAtlasSetup}
                  disabled={atlasLoading}
                  className="flex-1"
                >
                  {atlasLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating cluster...
                    </>
                  ) : (
                    "Create Cluster"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Manual URI */}
          {step === "manual-uri" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mongodb-uri">Connection URI</Label>
                <Input
                  id="mongodb-uri"
                  value={mongodbUri}
                  onChange={(e) => setMongodbUri(e.target.value)}
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net/tars"
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {ERROR_HINTS[errorCode]?.title ?? error}
                    </p>
                  </div>
                  {ERROR_HINTS[errorCode] && (
                    <ol className="text-xs text-muted-foreground space-y-1 ml-6 list-decimal">
                      {ERROR_HINTS[errorCode].steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={goBack}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleManualNext}
                  className="flex-1"
                >
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Anthropic API Key */}
          {step === "api-key" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anthropic-api-key">API Key</Label>
                <Input
                  id="anthropic-api-key"
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  autoFocus
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Get your key from{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  console.anthropic.com → API Keys
                </a>
                . TARS uses this to talk to Claude.
              </p>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {ERROR_HINTS[errorCode]?.title ?? error}
                    </p>
                  </div>
                  {ERROR_HINTS[errorCode] && (
                    <ol className="text-xs text-muted-foreground space-y-1 ml-6 list-decimal">
                      {ERROR_HINTS[errorCode].steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {initialStep !== "password" && (
                  <Button type="button" variant="outline" onClick={goBack}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleApiKeyNext}
                  className="flex-1"
                >
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Password */}
          {step === "password" && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {ERROR_HINTS[errorCode]?.title ?? error}
                    </p>
                  </div>
                  {ERROR_HINTS[errorCode] && (
                    <ol className="text-xs text-muted-foreground space-y-1 ml-6 list-decimal">
                      {ERROR_HINTS[errorCode].steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {canGoBack && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goBack}
                    disabled={loading}
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
