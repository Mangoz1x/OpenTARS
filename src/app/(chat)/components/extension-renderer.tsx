"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Blocks } from "lucide-react";

interface ExtensionRendererProps {
  extensionId: string;
  displayName?: string;
}

export function ExtensionRenderer({ extensionId, displayName }: ExtensionRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (
      event.data?.type === "tars-ext-resize" &&
      typeof event.data.height === "number" &&
      event.source === iframeRef.current?.contentWindow
    ) {
      setHeight(event.data.height);
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function sendTheme() {
      const isDark = document.documentElement.classList.contains("dark");
      iframe!.contentWindow?.postMessage(
        { type: "theme", theme: isDark ? "dark" : "light" },
        "*"
      );
    }

    // Send theme once iframe loads
    iframe.addEventListener("load", sendTheme);

    // Watch for theme changes on the parent
    const observer = new MutationObserver(() => sendTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Listen for resize messages from iframe
    window.addEventListener("message", handleMessage);

    return () => {
      iframe.removeEventListener("load", sendTheme);
      observer.disconnect();
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  return (
    <div className="max-w-[85%] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Blocks className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {displayName || extensionId}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src={`/api/extensions/${encodeURIComponent(extensionId)}/render`}
        sandbox="allow-scripts allow-same-origin"
        className="w-full border-0"
        scrolling="no"
        style={{ height, overflow: "hidden" }}
        title={displayName || extensionId}
      />
    </div>
  );
}
