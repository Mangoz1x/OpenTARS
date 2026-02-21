import { compose } from "@/lib/middleware/compose";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";

const handler = compose(withDatabase);

/**
 * GET /api/extensions/[name]/render
 * Serve a self-contained HTML page that renders the extension in an iframe.
 * Includes React 18 UMD, Tailwind CSS CDN, and the TarsSDK global.
 */
export const GET = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const extension = await Extension.findById(name).lean();
  if (!extension) {
    return new Response("Extension not found", { status: 404 });
  }

  const ext = extension as { _id: string; displayName: string };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ext.displayName)}</title>

  <!-- React 18 UMD -->
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>

  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            background: "var(--background)",
            foreground: "var(--foreground)",
            card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
            popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
            primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
            secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
            muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
            accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
            destructive: { DEFAULT: "var(--destructive)" },
            border: "var(--border)",
            input: "var(--input)",
            ring: "var(--ring)",
          },
          borderRadius: {
            lg: "var(--radius)",
            md: "calc(var(--radius) - 2px)",
            sm: "calc(var(--radius) - 4px)",
          },
        },
      },
    };
  </script>

  <style>
    :root {
      --radius: 0.625rem;
      --background: oklch(1 0 0);
      --foreground: oklch(0.141 0.005 285.823);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.141 0.005 285.823);
      --popover: oklch(1 0 0);
      --popover-foreground: oklch(0.141 0.005 285.823);
      --primary: oklch(0.21 0.006 285.885);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.967 0.001 286.375);
      --secondary-foreground: oklch(0.21 0.006 285.885);
      --muted: oklch(0.967 0.001 286.375);
      --muted-foreground: oklch(0.552 0.016 285.938);
      --accent: oklch(0.967 0.001 286.375);
      --accent-foreground: oklch(0.21 0.006 285.885);
      --destructive: oklch(0.577 0.245 27.325);
      --border: oklch(0.92 0.004 286.32);
      --input: oklch(0.92 0.004 286.32);
      --ring: oklch(0.705 0.015 286.067);
    }

    .dark {
      --background: oklch(0.141 0.005 285.823);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.21 0.006 285.885);
      --card-foreground: oklch(0.985 0 0);
      --popover: oklch(0.21 0.006 285.885);
      --popover-foreground: oklch(0.985 0 0);
      --primary: oklch(0.92 0.004 286.32);
      --primary-foreground: oklch(0.21 0.006 285.885);
      --secondary: oklch(0.274 0.006 286.033);
      --secondary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.274 0.006 286.033);
      --muted-foreground: oklch(0.705 0.015 286.067);
      --accent: oklch(0.274 0.006 286.033);
      --accent-foreground: oklch(0.985 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(1 0 0 / 10%);
      --input: oklch(1 0 0 / 15%);
      --ring: oklch(0.552 0.016 285.938);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--background);
      color: var(--foreground);
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    // TarsSDK — global helpers for extensions
    window.TarsSDK = {
      render: function(Component) {
        var root = ReactDOM.createRoot(document.getElementById("root"));
        root.render(React.createElement(Component));
      },

      dataStore: {
        query: function(store, options) {
          var params = new URLSearchParams({ store: store });
          if (options && options.key) params.set("key", options.key);
          if (options && options.limit) params.set("limit", String(options.limit));
          return fetch("/api/agent-data/" + encodeURIComponent(store) + "?" + params.toString())
            .then(function(r) { return r.json(); })
            .then(function(d) { return d.docs || []; });
        },
        get: function(store, key) {
          return fetch("/api/agent-data/" + encodeURIComponent(store) + "/" + encodeURIComponent(key))
            .then(function(r) { return r.json(); })
            .then(function(d) { return d.doc || null; });
        },
      },

      scripts: {
        run: function(name, params) {
          return fetch("/api/scripts/" + encodeURIComponent(name) + "/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params: params || {} }),
          })
            .then(function(r) { return r.json(); })
            .then(function(d) { return d.result; });
        },
      },
    };

    // Listen for theme messages from parent
    window.addEventListener("message", function(event) {
      if (event.data && event.data.type === "theme") {
        document.documentElement.classList.toggle("dark", event.data.theme === "dark");
      }
    });

    // Auto-resize: observe content height and notify parent
    new ResizeObserver(function() {
      var height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "tars-ext-resize", height: height }, "*");
    }).observe(document.getElementById("root"));
  </script>

  <!-- Extension bundle -->
  <script src="/api/extensions/${encodeURIComponent(ext._id)}/bundle"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
