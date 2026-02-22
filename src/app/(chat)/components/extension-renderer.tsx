"use client";

import React, { useEffect, useState } from "react";
import { Blocks, Loader2 } from "lucide-react";
import {
  ExtensionError,
  ExtensionErrorBoundary,
} from "./extension-error-boundary";

// Declare TarsSDK on window for TypeScript
declare global {
  interface Window {
    TarsSDK: {
      _capturedComponent: React.FC | null;
      render: (Component: React.FC) => void;
      scripts: {
        run: (
          name: string,
          params?: Record<string, unknown>
        ) => Promise<unknown>;
      };
      dataStore: {
        query: (
          store: string,
          options?: { key?: string; limit?: number }
        ) => Promise<unknown[]>;
        get: (store: string, key: string) => Promise<unknown>;
      };
    };
  }
}

// Set up globals once — React, ReactDOM, and TarsSDK
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).React = React;

  // Set ReactDOM global for legacy extensions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — @types/react-dom not installed
  import("react-dom").then((mod: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    (window as any).ReactDOM = mod; // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  window.TarsSDK = {
    _capturedComponent: null,

    render(Component: React.FC) {
      window.TarsSDK._capturedComponent = Component;
    },

    scripts: {
      run(name: string, params?: Record<string, unknown>) {
        return fetch(`/api/scripts/${encodeURIComponent(name)}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ params: params || {} }),
        })
          .then((r) => r.json())
          .then((d) => d.result);
      },
    },

    dataStore: {
      query(store: string, options?: { key?: string; limit?: number }) {
        const params = new URLSearchParams({ store });
        if (options?.key) params.set("key", options.key);
        if (options?.limit) params.set("limit", String(options.limit));
        return fetch(
          `/api/agent-data/${encodeURIComponent(store)}?${params}`,
          { credentials: "include" }
        )
          .then((r) => r.json())
          .then((d) => d.docs || []);
      },

      get(store: string, key: string) {
        return fetch(
          `/api/agent-data/${encodeURIComponent(store)}/${encodeURIComponent(key)}`,
          { credentials: "include" }
        )
          .then((r) => r.json())
          .then((d) => d.doc || null);
      },
    },
  };
}

function ExtensionSkeleton({ displayName }: { displayName: string }) {
  return (
    <div className="my-2 max-w-[85%] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Blocks className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {displayName}
        </span>
      </div>
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

interface ExtensionRendererProps {
  extensionId: string;
  displayName?: string;
}

export function ExtensionRenderer({
  extensionId,
  displayName,
}: ExtensionRendererProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/extensions/${encodeURIComponent(extensionId)}/bundle`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load extension (${r.status})`);
        return r.text();
      })
      .then((code) => {
        if (cancelled) return;

        // Reset capture for legacy TarsSDK.render() pattern
        window.TarsSDK._capturedComponent = null;

        // Execute the compiled IIFE — returns __tarsExt if using export default
        const fn = new Function(
          code +
            "\nreturn typeof __tarsExt !== 'undefined' ? __tarsExt : undefined;"
        );
        const exports = fn();

        // Resolve component: export default (new) or TarsSDK.render() (legacy)
        const Comp = exports?.default || window.TarsSDK._capturedComponent;

        if (!Comp) throw new Error("Extension did not export a component");

        setComponent(() => Comp);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  if (loading)
    return <ExtensionSkeleton displayName={displayName || extensionId} />;

  if (error)
    return (
      <div className="my-2 max-w-[85%] overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Blocks className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {displayName || extensionId}
          </span>
        </div>
        <ExtensionError
          error={error}
          extensionId={extensionId}
          displayName={displayName}
        />
      </div>
    );

  return (
    <div className="my-2 max-w-[85%] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Blocks className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {displayName || extensionId}
        </span>
      </div>
      <div className="extension-container">
        <ExtensionErrorBoundary extensionId={extensionId}>
          {Component && <Component />}
        </ExtensionErrorBoundary>
      </div>
    </div>
  );
}
