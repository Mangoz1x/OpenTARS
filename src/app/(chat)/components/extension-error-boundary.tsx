"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface ExtensionErrorProps {
  error: string | null;
  extensionId: string;
  displayName?: string;
}

export function ExtensionError({ error, extensionId, displayName }: ExtensionErrorProps) {
  return (
    <div className="flex flex-col items-center gap-2 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-medium">
        {displayName || extensionId} failed to render
      </p>
      {error && (
        <pre className="max-w-full overflow-auto rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {error}
        </pre>
      )}
    </div>
  );
}

interface ErrorBoundaryProps {
  extensionId: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: string | null;
}

export class ExtensionErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    // Report error to backend (fire-and-forget)
    fetch(
      `/api/extensions/${encodeURIComponent(this.props.extensionId)}/error`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ error: error.message, stack: error.stack }),
      }
    ).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <ExtensionError
          error={this.state.error}
          extensionId={this.props.extensionId}
        />
      );
    }
    return this.props.children;
  }
}
