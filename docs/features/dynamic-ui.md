# Dynamic UI & Self-Extension System

The orchestrator can extend itself by writing **full-stack extensions** — backend utility scripts, API routes, and frontend components — that become permanent capabilities. These extensions render inside the chat and can be invoked on demand.

This is the core of what makes TARS different: everyone starts with a base project, but the agent grows its own capabilities over time based on what the user needs.

---

## The Self-Extension Concept

The base TARS project ships with common integrations (Google Auth, etc.). But when a user wants something custom — checking a stock every morning, reading Amazon product data, sending emails via their Gmail — the orchestrator **writes the code itself**:

1. **Backend:** Writes a utility/script in a sandboxed extensions directory (e.g., `extensions/stock-checker/server.ts`).
2. **Frontend:** Writes a React component that renders inside the chat (e.g., `extensions/stock-checker/component.tsx`).
3. **Registration:** Registers the extension so it can be invoked later by name.
4. **Invocation:** The orchestrator can render the component in the chat at any time and see its output.

### Example: Stock Checker

```
User: "I want TARS to check AAPL stock price every morning and show me."

Orchestrator:
1. Writes extensions/stock-checker/server.ts
   - Fetches AAPL price from a free API
   - Exports a function: getStockPrice(symbol: string) → { price, change, ... }
2. Writes extensions/stock-checker/component.tsx
   - Calls /api/extensions/stock-checker?symbol=AAPL
   - Renders a card with price, change, sparkline
3. Registers: { name: "stock-checker", schedule: "0 9 * * *" }
4. Every morning at 9am, the agent runs it and shows the result in chat.
```

### Example: Gmail Integration

```
User: "Connect my Gmail so you can send emails for me."

Orchestrator:
1. Emits an OAuth block (Tier 1 predefined) for Google auth.
2. User authorizes.
3. Writes extensions/gmail/server.ts
   - Uses googleapis SDK with the user's OAuth tokens
   - Exports: sendEmail(), readInbox(), searchEmails()
4. Writes extensions/gmail/component.tsx
   - Compose email form, inbox viewer, etc.
5. Registers as a permanent extension.
6. Now the orchestrator can say: "I'll send that email for you"
   and invoke the gmail extension.
```

---

## Overview

The chat is not just text. The orchestrator can emit **blocks** — structured units that the chat UI renders as interactive components. Some blocks are predefined (forms, OAuth buttons), others are fully custom components the agent writes on the fly.

```
┌─────────────────────────────────────────────────┐
│  Chat UI                                         │
│                                                  │
│  TARS: I'll connect your Slack workspace.        │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │  [OAuth Block]                           │     │
│  │                                          │     │
│  │  Connect to Slack                        │     │
│  │  Click below to authorize TARS.          │     │
│  │                                          │     │
│  │  [ Authorize with Slack ]                │     │
│  │                                          │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  TARS: Great, now I need your signing secret.    │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │  [Env Input Block]                       │     │
│  │                                          │     │
│  │  SLACK_SIGNING_SECRET                    │     │
│  │  ┌───────────────────────────────┐       │     │
│  │  │ ••••••••••••••••              │       │     │
│  │  └───────────────────────────────┘       │     │
│  │  [ Save to .env ]                        │     │
│  │                                          │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  TARS: All set. Here's your Slack integration    │
│  status:                                         │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │  [Custom Component - Agent Written]      │     │
│  │                                          │     │
│  │  Slack Integration Status                │     │
│  │  ✓ Connected  ✓ Bot installed            │     │
│  │  Channels: #general, #dev                │     │
│  │                                          │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Two-Tier Architecture

### Tier 1: Predefined Blocks (Safe, Fast, Recommended)

A library of pre-built React components the agent can invoke via structured JSON. No code generation needed — the agent just describes what it wants.

**Why this tier exists:**
- Instant — no compilation step.
- Safe — no arbitrary code execution.
- Consistent — follows the app's design system.
- Covers 90% of use cases.

### Tier 2: Custom Blocks (Sandboxed, Agent-Written)

The agent writes actual React component code. It gets compiled, sandboxed in an iframe, and rendered inside the chat. For when predefined blocks aren't enough.

**Why this tier exists:**
- Unlimited flexibility — the agent can build anything.
- Self-extending — the agent creates UIs that don't exist yet.
- Useful for one-off, project-specific interfaces.

---

## Tier 1: Predefined Blocks

### Block Schema

Every block the agent emits follows this structure:

```typescript
interface ChatBlock {
  id: string;                    // Unique block ID
  type: string;                  // Block type (e.g., "form", "oauth", "env-input")
  props: Record<string, any>;    // Type-specific configuration
  callbackUrl?: string;          // API route to POST results back to
}
```

The agent emits blocks as part of its response. The chat UI sees the `type`, looks up the corresponding React component, and renders it with `props`.

### Predefined Block Types

#### `form` — Generic Form
Renders a form with configurable fields. Results are POSTed back to the agent.

```json
{
  "id": "block_001",
  "type": "form",
  "props": {
    "title": "Configure Database",
    "description": "Enter your MongoDB connection details.",
    "fields": [
      {
        "name": "mongoUri",
        "label": "MongoDB URI",
        "type": "text",
        "placeholder": "mongodb+srv://...",
        "required": true,
        "sensitive": true
      },
      {
        "name": "dbName",
        "label": "Database Name",
        "type": "text",
        "placeholder": "tars_db",
        "required": true
      }
    ],
    "submitLabel": "Save Configuration"
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

**Field types:** `text`, `password`, `number`, `select`, `multiselect`, `toggle`, `textarea`, `file`

#### `oauth` — OAuth Flow
Initiates an OAuth authorization flow.

```json
{
  "id": "block_002",
  "type": "oauth",
  "props": {
    "provider": "slack",
    "title": "Connect to Slack",
    "description": "Authorize TARS to access your Slack workspace.",
    "authUrl": "/api/auth/slack/authorize",
    "scopes": ["chat:write", "channels:read"],
    "icon": "slack"
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

**Flow:**
1. User clicks "Authorize".
2. Opens OAuth popup/redirect to `authUrl`.
3. OAuth completes → callback saves tokens.
4. Block updates to show "Connected" state.
5. Result POSTed to `callbackUrl` so the agent knows.

#### `env-input` — Environment Variable Input
Asks the user for a secret/env variable and saves it.

```json
{
  "id": "block_003",
  "type": "env-input",
  "props": {
    "variables": [
      {
        "name": "SLACK_SIGNING_SECRET",
        "label": "Slack Signing Secret",
        "description": "Found in your Slack app settings under 'Basic Information'.",
        "required": true
      },
      {
        "name": "SLACK_BOT_TOKEN",
        "label": "Slack Bot Token",
        "description": "Starts with xoxb-...",
        "required": true
      }
    ],
    "targetFile": ".env.local",
    "instructions": [
      "Go to https://api.slack.com/apps",
      "Select your app",
      "Copy the Signing Secret from Basic Information"
    ]
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

**Security:** Values are masked in the UI. Saved server-side only. Never sent back to the LLM.

#### `confirm` — Confirmation Dialog
Asks the user to approve an action.

```json
{
  "id": "block_004",
  "type": "confirm",
  "props": {
    "title": "Deploy to Production?",
    "description": "This will deploy the current build to production. This action cannot be undone.",
    "severity": "warning",
    "confirmLabel": "Deploy",
    "cancelLabel": "Cancel"
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

#### `progress` — Progress Tracker
Shows multi-step progress for long-running operations.

```json
{
  "id": "block_005",
  "type": "progress",
  "props": {
    "title": "Setting up Slack Integration",
    "steps": [
      { "label": "Create OAuth app", "status": "completed" },
      { "label": "Configure permissions", "status": "completed" },
      { "label": "Get signing secret", "status": "in_progress" },
      { "label": "Install bot to workspace", "status": "pending" },
      { "label": "Test connection", "status": "pending" }
    ]
  }
}
```

**Live updates:** The agent can update a block's props by emitting a new block with the same `id`. The UI replaces the old block.

#### `code` — Code Display with Actions
Shows code with copy/apply buttons.

```json
{
  "id": "block_006",
  "type": "code",
  "props": {
    "title": "Add to your .env file",
    "language": "bash",
    "code": "SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...",
    "actions": ["copy", "apply"]
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

#### `table` — Data Table
Renders structured data as a table.

#### `image` — Image Display
Renders an image (screenshot, diagram, etc.).

#### `file-upload` — File Upload
Asks the user to upload a file.

---

### Block Callback Flow

When a user interacts with a block (submits a form, completes OAuth, etc.), the result is POSTed to the `callbackUrl`:

```typescript
// POST /api/agent/block-callback
{
  "blockId": "block_001",
  "blockType": "form",
  "data": {
    "mongoUri": "mongodb+srv://...",
    "dbName": "tars_db"
  },
  "action": "submit"   // "submit", "cancel", "authorize", etc.
}
```

The API route:
1. Validates the data.
2. Performs side effects (save to .env, store in DB, etc.).
3. Feeds the result back to the orchestrator's conversation so it knows what happened.

---

## Tier 2: Custom Blocks (Agent-Written Components)

For anything the predefined blocks can't handle, the agent writes a React component.

### How It Works

1. **Agent writes code:** The orchestrator generates a self-contained React component as a string.
2. **Server compiles it:** The Next.js API route compiles the JSX using esbuild/SWC into a JavaScript bundle.
3. **Stored as a block:** The compiled bundle is saved with a unique ID.
4. **Rendered in iframe:** The chat UI renders it inside a sandboxed iframe with controlled communication via `postMessage`.

### Block Schema (Custom)

```json
{
  "id": "block_custom_001",
  "type": "custom",
  "props": {
    "title": "Slack Integration Status",
    "sourceCode": "... React component source ...",
    "bundleUrl": "/api/blocks/block_custom_001/bundle.js",
    "width": "full",
    "height": "auto",
    "maxHeight": 400
  },
  "callbackUrl": "/api/agent/block-callback"
}
```

### Compilation Pipeline

```
Agent writes JSX string
        │
        ▼
POST /api/blocks/compile
        │
        ▼
Server validates (no imports of fs, child_process, etc.)
        │
        ▼
esbuild/SWC compiles to JS bundle
        │
        ▼
Bundle stored in /tmp/blocks/{blockId}/bundle.js
        │
        ▼
Chat UI renders in sandboxed iframe
```

### Component Constraints

The agent-written component:
- **CAN** use: React, basic DOM APIs, CSS (inline or CSS-in-JS), `fetch` (to allowed origins only).
- **CANNOT** import: `fs`, `child_process`, `path`, Node.js APIs, or any server-side modules.
- **CANNOT** access: parent window DOM, cookies, localStorage of the parent app.
- **CAN** communicate with the app via: `window.parent.postMessage()` with a strict message schema.
- **Has access to** a provided SDK object injected into the iframe:

```typescript
// Available inside the iframe as window.TARS
interface TarsBlockSDK {
  // Send data back to the agent
  submitResult(data: Record<string, any>): void;

  // Request the agent to do something
  requestAction(action: string, params?: Record<string, any>): void;

  // Get the block's props (passed from the agent)
  getProps(): Record<string, any>;

  // Show a toast/notification in the parent UI
  notify(message: string, type: 'info' | 'success' | 'error'): void;

  // Close/collapse this block
  close(): void;
}
```

### Iframe Sandboxing

```html
<iframe
  src="/api/blocks/{blockId}/render"
  sandbox="allow-scripts allow-forms"
  referrerpolicy="no-referrer"
  csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  style="width: 100%; border: none;"
/>
```

**Sandbox attributes:**
- `allow-scripts` — needed for React to run.
- `allow-forms` — needed for form submissions within the block.
- NO `allow-same-origin` — prevents access to parent cookies/storage.
- NO `allow-top-navigation` — prevents redirecting the parent page.
- NO `allow-popups` — prevents opening new windows (except for OAuth, handled differently).

### Error Handling

- **Compilation error:** The block renders an error state with the compile error message. The agent is notified and can fix the code.
- **Runtime error:** An error boundary inside the iframe catches React errors and displays a fallback. The error is reported back to the agent via `postMessage`.
- **Infinite loop / heavy computation:** The iframe has a maximum CPU time. If exceeded, the iframe is killed and an error is shown.
- **Parent app is never affected:** Since everything runs in a sandboxed iframe, a crashing block cannot crash the chat UI.

---

## Block Lifecycle

```
1. Agent decides it needs a UI element
        │
        ▼
2. Agent emits a block (Tier 1 JSON or Tier 2 custom code)
        │
        ▼
3. Block is stored in the conversation/message
        │
        ▼
4. Chat UI renders the block (predefined component or iframe)
        │
        ▼
5. User interacts (fills form, clicks button, etc.)
        │
        ▼
6. Block POSTs result to callbackUrl
        │
        ▼
7. API route processes the result and feeds it back to the orchestrator
        │
        ▼
8. Orchestrator continues with the new information
        │
        ▼
9. Block can be updated (new props) or marked as completed/collapsed
```

### Block States

| State | Meaning |
|---|---|
| `active` | Block is interactive, waiting for user input |
| `completed` | User has interacted, block shows completion state (e.g., "Saved!") |
| `error` | Something went wrong, block shows error with retry option |
| `collapsed` | Block is minimized (user can expand it) |
| `expired` | Block is no longer valid (e.g., OAuth token expired) |

---

## How the Agent Emits Blocks

The orchestrator needs a way to output blocks as part of its response. Two approaches:

### Option A: Structured Output in the Response

The agent's response includes blocks inline with text using a delimiter or structured format:

```
I'll help you connect to Slack. First, let's authorize:

:::block
{"type": "oauth", "props": {"provider": "slack", ...}}
:::

Once you've authorized, I'll need your signing secret:

:::block
{"type": "env-input", "props": {"variables": [...]}}
:::
```

The chat UI parses these block markers and renders the components inline.

### Option B: Dedicated MCP Tool

The orchestrator has a tool like `emit_block` that creates blocks:

```typescript
// MCP tool on the orchestrator
tool("emit_block", "Render an interactive UI block in the chat", {
  type: z.string(),
  props: z.record(z.any()),
  callbackUrl: z.string().optional()
}, async (args) => {
  // Store the block, return the block ID
  const blockId = await storeBlock(args);
  return { content: [{ type: "text", text: `Block ${blockId} rendered.` }] };
});
```

**Recommendation:** Use **Option B** (MCP tool). It's cleaner — the agent explicitly decides when to emit a block, and the tool result confirms it was rendered. For Tier 2 custom blocks, the tool handles compilation before confirming.

---

## Saving Agent-Written Components for Reuse

When the agent writes a custom component that works well, it can be promoted to a reusable block:

1. Agent writes a custom block for "Slack Integration Status".
2. It works well → agent (or user) saves it as a **template**.
3. Templates are stored in `src/components/blocks/templates/` or in the DB.
4. Next time the agent needs a similar block, it uses the template instead of writing from scratch.

This is how the agent **extends itself** over time — building up a library of custom UI components.

---

## Security Considerations

### Tier 1 (Predefined Blocks)
- Safe by design — no arbitrary code.
- Validate all props on the server before rendering.
- Sanitize any user-provided content (XSS prevention).
- Sensitive fields (passwords, tokens) are never echoed back.

### Tier 2 (Custom Blocks)
- **Compilation validation:** Reject code that imports dangerous modules.
- **Iframe sandboxing:** No access to parent DOM, cookies, or storage.
- **CSP headers:** Restrict what the iframe can load.
- **Network restrictions:** Custom blocks can only fetch from allowed origins (the TARS API).
- **Size limits:** Max bundle size (e.g., 500KB). Max iframe height. Max execution time.
- **Rate limiting:** Max N custom blocks per conversation to prevent abuse.

### Env Variables & Secrets
- Env values entered via `env-input` blocks are saved server-side directly to the `.env` file.
- They are NEVER included in the LLM conversation context.
- The agent is told "the user saved SLACK_SIGNING_SECRET" but never sees the value.

---

## Edge Cases

### Block references old conversation state
- Each block has a unique ID tied to the conversation.
- If the conversation is compacted/cleared, orphaned blocks are garbage collected.

### User ignores a block
- Blocks should have a timeout or the agent should handle the case where no response comes.
- The orchestrator can re-prompt: "I notice you haven't completed the Slack authorization. Would you like to skip this step?"

### Multiple blocks waiting for input simultaneously
- Supported — each block has its own callback. The agent processes responses as they come in.
- The UI renders them in order. The user can interact with any of them.

### Custom block tries to access parent window
- Blocked by iframe sandbox (no `allow-same-origin`).
- The only communication channel is `postMessage` with validated message schemas.

### Agent writes broken component code
- Compilation error → error state rendered, agent notified, agent can retry.
- Runtime error → iframe error boundary catches it, fallback UI shown, agent notified.
- The parent app is never affected.

### Block needs to trigger a page reload or navigation
- Not allowed from iframe.
- If the agent needs to redirect (e.g., after OAuth), it uses the `requestAction("navigate", { url })` SDK method, which the parent app handles.

---

## Extensions System (Full-Stack Self-Extension)

Extensions go beyond chat blocks — they are **permanent full-stack capabilities** the agent writes for itself. An extension has a backend (server-side logic) and optionally a frontend (chat component).

**Important:** Extensions are built by the **local agent** (`tars-local`) — a dedicated Agent Server running on the same machine as the TARS app. The orchestrator delegates extension tasks to it like any other agent (`assign_task` via HTTP to `localhost:4001`). Because the local agent shares a filesystem with the Next.js app, it can write directly to `userdata/extensions/` and the app serves them immediately. Remote sub-agents work on external projects (JustPix, etc.) — they never touch the TARS codebase. See `docs/features/agent-archetypes.md` for the `extension-builder` archetype and the local agent architecture.

### Extension Directory Structure

```
extensions/
├── manifest.json                    # Registry of all installed extensions
├── stock-checker/
│   ├── extension.json               # Extension metadata
│   ├── server.ts                    # Backend logic (runs in Node.js)
│   ├── component.tsx                # Frontend component (renders in chat)
│   └── README.md                    # Agent-written docs for itself
├── gmail/
│   ├── extension.json
│   ├── server.ts                    # Uses googleapis, sends/reads emails
│   ├── component.tsx                # Compose form, inbox viewer
│   └── credentials.enc              # Encrypted OAuth tokens
├── amazon-price-tracker/
│   ├── extension.json
│   ├── server.ts                    # Scrapes/API fetches product prices
│   ├── component.tsx                # Price card with history chart
│   └── products.json                # Tracked products list
└── ...
```

### Extension Manifest (`extension.json`)

```json
{
  "name": "stock-checker",
  "displayName": "Stock Price Checker",
  "description": "Fetches real-time stock prices and displays them in chat.",
  "version": "1.0.0",
  "createdAt": "2026-02-16T10:00:00Z",
  "createdBy": "orchestrator",
  "status": "active",

  "server": {
    "entrypoint": "server.ts",
    "exports": ["getStockPrice", "getStockHistory"],
    "dependencies": [],
    "envVars": []
  },

  "component": {
    "entrypoint": "component.tsx",
    "props": {
      "symbol": { "type": "string", "required": true },
      "period": { "type": "string", "default": "1d" }
    }
  },

  "schedule": {
    "enabled": true,
    "cron": "0 9 * * 1-5",
    "action": "getStockPrice",
    "params": { "symbol": "AAPL" },
    "notify": true
  },

  "permissions": {
    "network": ["https://api.polygon.io/*"],
    "envVars": ["POLYGON_API_KEY"],
    "fileAccess": []
  }
}
```

### How the Agent Creates an Extension

1. **User requests:** "I want to track AAPL stock price every morning."

2. **Agent plans the extension:**
   - What backend functions are needed?
   - What frontend component to show?
   - What API/service does it need?
   - Does it need env vars or credentials?

3. **Agent writes the server code:**
   The agent uses its own tools (Write, Edit) to create the files:

   ```typescript
   // extensions/stock-checker/server.ts
   import { TarsExtension } from "@/lib/extensions/types";

   export const getStockPrice: TarsExtension["handler"] = async ({ symbol }) => {
     const apiKey = process.env.POLYGON_API_KEY;
     const res = await fetch(
       `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apiKey=${apiKey}`
     );
     const data = await res.json();
     const result = data.results?.[0];

     return {
       symbol,
       price: result?.c,
       change: result?.c - result?.o,
       changePercent: ((result?.c - result?.o) / result?.o * 100).toFixed(2),
       volume: result?.v,
       timestamp: new Date().toISOString()
     };
   };
   ```

4. **Agent writes the frontend component:**

   ```tsx
   // extensions/stock-checker/component.tsx
   import { useExtensionData } from "@/lib/extensions/hooks";

   export default function StockChecker({ symbol, period }: { symbol: string; period?: string }) {
     const { data, loading, error } = useExtensionData("stock-checker", "getStockPrice", { symbol });

     if (loading) return <div className="animate-pulse">Loading {symbol}...</div>;
     if (error) return <div className="text-red-500">Failed to fetch {symbol}</div>;

     const isPositive = data.change >= 0;

     return (
       <div className="rounded-lg border p-4">
         <div className="flex justify-between items-center">
           <span className="font-bold text-lg">{data.symbol}</span>
           <span className="text-2xl font-mono">${data.price?.toFixed(2)}</span>
         </div>
         <div className={isPositive ? "text-green-500" : "text-red-500"}>
           {isPositive ? "+" : ""}{data.change?.toFixed(2)} ({data.changePercent}%)
         </div>
       </div>
     );
   }
   ```

5. **Agent checks for missing env vars:**
   If `POLYGON_API_KEY` is needed, the agent emits an `env-input` block to ask the user.

6. **Agent registers the extension:**
   Writes `extension.json` and updates `manifest.json`.

7. **Agent tests it:**
   Invokes the extension via the `invoke_extension` MCP tool, checks the output, fixes any errors.

8. **Extension is live:**
   The orchestrator can now render the stock checker in chat anytime, and it runs on schedule.

### Extension API Routes (Auto-Generated)

When an extension is registered, the system auto-generates API routes:

```
GET  /api/extensions/stock-checker/getStockPrice?symbol=AAPL
GET  /api/extensions/stock-checker/getStockHistory?symbol=AAPL&period=1m
POST /api/extensions/stock-checker/invoke    (generic invocation)
GET  /api/extensions/stock-checker/component  (serves the compiled component)
```

These are **Next.js dynamic routes** that:
1. Load the extension's `server.ts`.
2. Call the exported function with the query params.
3. Return the result as JSON.

The frontend component calls these routes via `useExtensionData()`.

### Extension Sandboxing

**Backend (server.ts):**
- Runs in the main Node.js process BUT with restrictions:
  - Only allowed network access to URLs listed in `permissions.network`.
  - Only allowed env vars listed in `permissions.envVars`.
  - No filesystem access outside the extension's own directory.
  - No `child_process`, `eval`, or dynamic imports outside the extension.
- Future: Run in a Worker thread or separate process for full isolation.

**Frontend (component.tsx):**
- Compiled and served as a bundle.
- For Tier 2 (custom) blocks: rendered in a sandboxed iframe.
- For trusted/promoted extensions: can be rendered directly in the React tree (Tier 1 treatment) behind an error boundary.

### Extension Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Created  │────▶│  Testing  │────▶│  Active   │────▶│ Archived │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                       │                │
                       │                ▼
                       │          ┌──────────┐
                       └─────────▶│  Failed   │
                                  └──────────┘
```

| Status | Meaning |
|---|---|
| `created` | Agent wrote the files, not yet tested |
| `testing` | Agent is running the extension to verify it works |
| `active` | Extension works, available for use |
| `failed` | Extension has errors, agent can attempt to fix |
| `archived` | Extension disabled by user or agent, files preserved |

### Scheduled Extensions

Extensions can run on a schedule (cron):

```json
"schedule": {
  "enabled": true,
  "cron": "0 9 * * 1-5",
  "action": "getStockPrice",
  "params": { "symbol": "AAPL" },
  "notify": true
}
```

- A scheduler (e.g., node-cron or system cron) checks `manifest.json` for scheduled extensions.
- When triggered, it calls the extension's action and optionally notifies the user in chat.
- The orchestrator can also render the result as a block in the next conversation.

### Orchestrator MCP Tools for Extensions

```
create_extension(name, description)     → Scaffolds the extension directory
invoke_extension(name, action, params)  → Calls a backend function, returns result
render_extension(name, props)           → Emits the frontend component as a chat block
list_extensions()                       → Lists all installed extensions
update_extension(name)                  → Re-compiles after code changes
delete_extension(name)                  → Archives and disables
```

### Extension Dependencies

If an extension needs an npm package (e.g., `googleapis` for Gmail):

1. Agent adds it to a per-extension `package.json` or a shared `extensions/package.json`.
2. Agent runs `npm install` in the extensions directory.
3. The dependency is available to the extension's server code.
4. Dependencies are isolated from the main Next.js app's `node_modules` to prevent conflicts.

### Edge Cases

**Extension breaks after a dependency update:**
- Each extension pins its dependency versions.
- The agent can roll back by checking the extension's git history (extensions dir is committed).

**Two extensions conflict (same port, same env var name):**
- Env var names are namespaced: `EXT_STOCKCHECKER_API_KEY` not just `API_KEY`.
- Extensions don't bind ports — they're invoked via API routes.

**Extension becomes stale / API changes:**
- The agent can detect errors when invoking and auto-fix.
- User can ask: "Fix the stock checker, it's broken" → agent reads the error, updates the code.

**Extension needs OAuth tokens that expire:**
- Tokens stored encrypted in the extension directory or DB.
- The extension's server code handles refresh logic.
- If refresh fails, the agent emits an OAuth block to re-authorize.

**User wants to share an extension with others:**
- Extensions can be exported as a zip/tarball.
- Import on another TARS instance.
- Future: extension marketplace/registry.

---

## Base Project vs. User Data Separation

TARS ships as a base project that anyone can clone, deploy, and personalize. Custom extensions the agent builds for a specific user must NOT be committed to the main git repository. This is a hard requirement — the base project stays clean and shippable, while each user's personalized features live separately.

### Directory Strategy

```
tars-app/                           ← GIT-COMMITTED (base project)
├── src/                            ← Main app code
│   ├── app/                        ← Next.js app router
│   ├── components/
│   │   ├── chat/                   ← Chat UI
│   │   ├── blocks/                 ← Predefined Tier 1 block renderers
│   │   └── extensions/             ← Extension runtime (loader, iframe host, SDK)
│   ├── lib/
│   │   ├── extensions/
│   │   │   ├── runtime.ts          ← Extension loader, compiler, API route generator
│   │   │   ├── types.ts            ← TarsExtension, ExtensionManifest interfaces
│   │   │   ├── hooks.ts            ← useExtensionData, useExtensionComponent
│   │   │   ├── sandbox.ts          ← Iframe sandbox & postMessage handler
│   │   │   └── scheduler.ts        ← Cron scheduler for scheduled extensions
│   │   └── ...
│   └── ...
├── docs/                           ← Documentation
├── .claude/                        ← Claude Code config & skills
├── package.json
├── .gitignore                      ← Includes "userdata/" entry
└── ...

userdata/                           ← NOT GIT-COMMITTED (per-user)
├── extensions/                     ← Agent-written extensions
│   ├── manifest.json               ← Registry of installed extensions
│   ├── stock-checker/
│   │   ├── extension.json
│   │   ├── server.ts
│   │   ├── component.tsx
│   │   └── dist/                   ← Compiled bundles
│   │       └── bundle.js
│   ├── gmail/
│   │   ├── extension.json
│   │   ├── server.ts
│   │   ├── component.tsx
│   │   └── credentials.enc
│   └── ...
├── extensions-node_modules/        ← npm packages for extensions (isolated)
├── memory/                         ← Agent persistent memory / session data
├── .env.local                      ← User's environment variables
└── config.json                     ← User-specific TARS configuration
```

### .gitignore

The base project's `.gitignore` includes:

```
# User-personalized data — never committed
userdata/
```

This single entry keeps all personalized content out of git. When a user clones the repo, they get the base project only. The `userdata/` directory is created automatically on first run.

### How Extensions Are Loaded at Runtime

Extensions are NOT part of the Next.js build. They are loaded dynamically at runtime.

**Backend (server.ts):**
```typescript
// src/lib/extensions/runtime.ts — part of the base project

import path from "path";

const USERDATA_DIR = process.env.TARS_USERDATA_DIR || path.join(process.cwd(), "userdata");
const EXTENSIONS_DIR = path.join(USERDATA_DIR, "extensions");

export async function loadExtension(name: string) {
  const manifestPath = path.join(EXTENSIONS_DIR, name, "extension.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  // Dynamic import of the server module (NOT bundled with Next.js)
  const serverPath = path.join(EXTENSIONS_DIR, name, manifest.server.entrypoint);
  const serverModule = await import(serverPath);

  return { manifest, handlers: serverModule };
}

export async function invokeExtension(name: string, action: string, params: Record<string, any>) {
  const { manifest, handlers } = await loadExtension(name);

  if (!manifest.server.exports.includes(action)) {
    throw new Error(`Extension "${name}" does not export "${action}"`);
  }

  return handlers[action](params);
}
```

**Frontend (component.tsx):**
```typescript
// Compiled by the extension runtime when the extension is created/updated.
// The compiled bundle is stored in userdata/extensions/<name>/dist/bundle.js
// Served to the browser via a Next.js API route.

// GET /api/extensions/[name]/component
// → reads userdata/extensions/<name>/dist/bundle.js
// → serves it as application/javascript
// → the chat UI loads it into a sandboxed iframe
```

### Next.js Dynamic API Routes

A single catch-all API route in the base project handles all extensions:

```
src/app/api/extensions/[...slug]/route.ts    ← GIT-COMMITTED (base project)
```

This route:
1. Parses the extension name and action from the URL.
2. Loads the extension from `userdata/extensions/`.
3. Calls the handler and returns the result.

```typescript
// src/app/api/extensions/[...slug]/route.ts

import { invokeExtension, getExtensionComponent } from "@/lib/extensions/runtime";

export async function GET(req: Request, { params }: { params: { slug: string[] } }) {
  const [extensionName, action] = params.slug;

  if (action === "component") {
    // Serve the compiled frontend bundle
    return getExtensionComponent(extensionName);
  }

  // Invoke a backend handler
  const searchParams = Object.fromEntries(new URL(req.url).searchParams);
  const result = await invokeExtension(extensionName, action, searchParams);
  return Response.json(result);
}

export async function POST(req: Request, { params }: { params: { slug: string[] } }) {
  const [extensionName, action] = params.slug;
  const body = await req.json();
  const result = await invokeExtension(extensionName, action || "invoke", body);
  return Response.json(result);
}
```

### Frontend Dynamic Loading

The chat UI dynamically renders extension components without knowing about them at build time:

```typescript
// src/components/extensions/ExtensionRenderer.tsx — GIT-COMMITTED (base project)

"use client";

interface ExtensionRendererProps {
  extensionName: string;
  props: Record<string, any>;
}

export function ExtensionRenderer({ extensionName, props }: ExtensionRendererProps) {
  const iframeSrc = `/api/extensions/${extensionName}/component?props=${encodeURIComponent(JSON.stringify(props))}`;

  return (
    <iframe
      src={iframeSrc}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      className="w-full border-none rounded-lg"
      style={{ minHeight: 100 }}
    />
  );
}
```

The base project ships:
- `ExtensionRenderer` — knows how to render ANY extension in an iframe.
- `ExtensionRuntime` — knows how to load, compile, and invoke ANY extension.
- The catch-all API route — serves any extension's handlers and components.

The base project does NOT ship any actual extensions. Those are created by the agent per-user and stored in `userdata/`.

### First Run Setup

When a user clones the base project and runs it for the first time:

```typescript
// Part of the app startup sequence
import { initUserData } from "@/lib/extensions/runtime";

// Creates the userdata directory structure if it doesn't exist
await initUserData();
```

```typescript
export async function initUserData() {
  const dirs = [
    USERDATA_DIR,
    path.join(USERDATA_DIR, "extensions"),
    path.join(USERDATA_DIR, "memory"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Create empty manifest if it doesn't exist
  const manifestPath = path.join(USERDATA_DIR, "extensions", "manifest.json");
  if (!await fileExists(manifestPath)) {
    await fs.writeFile(manifestPath, JSON.stringify({ extensions: [] }, null, 2));
  }
}
```

### Environment Variable

The userdata directory location is configurable:

```bash
# .env.local (not committed)
TARS_USERDATA_DIR=/path/to/my/userdata

# Default: ./userdata (relative to project root)
```

This allows users to:
- Put userdata on a different disk (more storage).
- Share userdata across multiple TARS instances.
- Back up userdata independently from the codebase.

### What Goes Where — Summary

| Content | Location | Git-Committed? |
|---|---|---|
| Next.js app, components, API routes | `src/` | Yes |
| Extension runtime, loader, types | `src/lib/extensions/` | Yes |
| Predefined Tier 1 blocks | `src/components/blocks/` | Yes |
| Extension renderer (iframe host) | `src/components/extensions/` | Yes |
| Catch-all extension API route | `src/app/api/extensions/` | Yes |
| Documentation | `docs/` | Yes |
| Agent-written extensions | `userdata/extensions/` | No |
| Extension npm dependencies | `userdata/extensions-node_modules/` | No |
| Agent memory / sessions | `userdata/memory/` | No |
| User env variables | `userdata/.env.local` or `.env.local` | No |
| User-specific config | `userdata/config.json` | No |
| Custom archetypes (DB) | MongoDB | No (per-instance) |
| Agent registry (DB) | MongoDB | No (per-instance) |

### Deployment Considerations

**Self-hosted (typical):**
- Clone the repo → `npm install` → `npm run dev`
- `userdata/` created on first run, grows as the agent extends itself.
- `.gitignore` prevents accidental commits of personalized data.

**Docker:**
- Mount `userdata/` as a Docker volume for persistence.
- Base image contains the git-committed code only.
- `TARS_USERDATA_DIR=/data/userdata` in the container.

**Multiple instances (same user):**
- Point all instances to the same `userdata/` directory (NFS, shared volume).
- Or each instance has its own `userdata/` and they diverge independently.

**Updating the base project:**
- `git pull` updates the base code.
- `userdata/` is untouched — extensions continue working.
- If a base project update changes the extension runtime API, a migration script updates existing extensions.
