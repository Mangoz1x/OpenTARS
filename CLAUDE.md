# TARS - Autonomous AI Agent

## Project Vision
Build an autonomous AI agent (TARS) that can do basically anything on the user's behalf. The goal is a general-purpose AI agent with broad capabilities.

## Core Architecture

### Orchestrator (Main Agent)
- The primary AI agent (Claude Agent SDK) the user interacts with through a **chat interface**.
- Acts as the **brain** — plans, delegates, and coordinates. **Never writes code itself.**
- Has **persistent memory** via Agent SDK session resume (`resume: sessionId` stored in MongoDB).
- Delegates ALL work to agents via **custom MCP tools** (`assign_task`, `check_status`, `get_result`, `cancel_task`, `list_agents`).
- Also has MCP tools for: `extensions` (list/render/delete), `scripts` (list/create/run/delete), `agent_data` (CRUD), `memory` (CRUD).
- Code: `src/lib/orchestrator/` (system prompt, streaming runner).

### Remote Agents (Fleet)
- Each is an **independent Agent SDK instance** running on its own machine (home PC, VM, cloud, etc.).
- Wrapped in a lightweight **HTTP server** (Agent Server, in `agent-server/`) that exposes a REST API for task management.
- Communicate with the orchestrator over **HTTP** (REST + SSE for streaming).
- Do NOT know about each other — only the orchestrator knows the full fleet.
- Registered in MongoDB via an **Agent Registry**.
- **Work on external projects** (e.g., JustPix on a VM) — they don't touch the TARS codebase.
- Can call TARS platform APIs (extensions, scripts, data stores) using **Bearer token auth** with their `apiKey`.

### Local Agent (`tars-local`)
- A dedicated Agent Server running **on the same machine** as the TARS app.
- Specializes in extending TARS — creates extensions and scripts by calling TARS REST APIs.
- The orchestrator treats it like any other agent — `assign_task` to `localhost:4001`.
- Auto-starts with the TARS app, auto-registers in the agent registry with the `extension-builder` archetype.
- Default working directory: `userdata/extensions/` (for scratch work only — extensions are served from MongoDB, not the filesystem).
- Code: `src/lib/agents/local-agent.ts`, archetype seed in `src/lib/agents/seed/extension-builder.ts`.

### Communication Flow
1. User talks to the **Orchestrator** via chat UI.
2. Orchestrator calls MCP tool (e.g., `assign_task`) → HTTP POST to remote Agent Server.
3. Remote agent runs autonomously via Agent SDK `query()`.
4. Orchestrator polls status or subscribes to **SSE stream** for real-time updates.
5. On completion, orchestrator relays results to the user.

### Agent Archetypes
- Remote agents are instructed via **archetypes** — reusable definitions of role, system prompt, tools, and constraints.
- Built-in archetypes: `extension-builder` (local agent). More planned: `developer`, `researcher`, etc.
- Custom archetypes can be created via the UI or by the orchestrator itself. Stored in MongoDB.
- All prompts follow a strict standard: specific role, TARS context, output format, failure protocol, guardrails.

### Self-Extension System
Everything stored in **MongoDB** — no filesystem involvement for production serving.

**Extensions** — TSX components rendered in sandboxed iframes inside the chat.
- Stored in the `Extension` model: `componentSource` (raw TSX) + `compiledBundle` (cached JS).
- Compiled lazily via **esbuild** on first render (TSX → IIFE JS), cached in MongoDB.
- Rendered via `/api/extensions/[name]/render` (HTML shell with React 18 UMD + Tailwind CDN) + `/api/extensions/[name]/bundle` (compiled JS).
- Components use the `TarsSDK` global: `TarsSDK.scripts.run(name, params)` for backend calls, `TarsSDK.dataStore.query(store)` for data.
- Created via `POST /api/extensions` (REST) or the `extensions` MCP tool.

**Scripts** — Reusable server-side JavaScript functions stored in MongoDB.
- Stored in the `Script` model: `code` (JS string) + `params` schema.
- Executed via `new Function()` with injected context: `params`, `dataStore` (full CRUD), `fetch`.
- 10-second execution timeout.
- Called from extensions via `TarsSDK.scripts.run()`, from orchestrator via MCP tool, or via `POST /api/scripts/[name]/run`.
- Created via `POST /api/scripts` (REST) or the `scripts` MCP tool.

**Data Stores** — Namespaced key-value storage in MongoDB.
- Stored in the `DataStore` model: `store` (namespace) + `key` + `data` (arbitrary JSON).
- Bridges extensions and scripts — any agent, extension, or script can read/write the same data.
- REST API at `/api/agent-data/[store]`.

### Extension Creation Flow
1. Orchestrator delegates to the local agent (extension-builder archetype).
2. Agent creates backend **scripts** via `POST /api/scripts` (authenticated with Bearer token).
3. Agent tests scripts via `POST /api/scripts/[name]/run`.
4. Agent creates the **extension** via `POST /api/extensions` with `componentSource` that calls `TarsSDK.scripts.run()`.
5. Orchestrator renders the extension in the chat via the `extensions` MCP tool (`render` command).

### Auth
- Browser users: session cookie auth via `withAuth` middleware.
- Agents: `Authorization: Bearer <apiKey>` header, validated against `Agent.apiKey` in MongoDB.
- Both auth methods accepted on all protected API routes.

## Tech Stack
- **Next.js** — full-stack app (frontend chat UI + backend API in one project)
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — runtime for both orchestrator and remote agents
- **Agent Server** (`agent-server/`) — lightweight Express server wrapping Agent SDK on each remote machine
- **MCP Tools** — in-process MCP servers on orchestrator for agent management, extensions, scripts, data stores, memory
- **esbuild** — runtime TSX → JS compilation for extensions (no build step)
- **SSE** — real-time streaming from remote agents to orchestrator/UI
- **MongoDB** — all persistent state: agents, tasks, extensions, scripts, data stores, messages, sessions, archetypes, memory

## Key Directories
- `src/lib/orchestrator/` — orchestrator system prompt and streaming runner
- `src/lib/agents/` — agent MCP tools, local agent spawner, archetype seeds
- `src/lib/extensions/` — extension MCP tools, esbuild compilation
- `src/lib/scripts/` — script MCP tools, execution engine
- `src/lib/data-store/` — data store MCP tools
- `src/lib/db/models/` — all Mongoose models
- `src/app/api/extensions/` — extension REST API (CRUD, render, bundle)
- `src/app/api/scripts/` — script REST API (CRUD, run)
- `src/app/api/agent-data/` — data store REST API
- `agent-server/` — standalone agent server (separate from Next.js app)

## Documentation (`/docs`)
The `docs/` folder is the single source of truth for how the project is built. It is organized into distinct subfolders:

### `docs/features/`
- One markdown file per feature (e.g., `auth.md`, `agents.md`).
- Each file documents:
  - How the feature works end-to-end.
  - Mongoose models — every field, types, constraints, defaults, what they can/can't contain.
  - Data structures and schemas.
  - Edge cases and known gotchas.
  - Relevant API routes and server actions.

### `docs/anthropic/`
- Knowledge base for the Anthropic Claude API and prompting best practices.
- `docs/anthropic/prompting/` — prompt engineering guides (XML tags, CoT, roles, examples).
- `docs/anthropic/tools/` — tool use documentation (web search, code execution, etc.).
- Referenced when building features that use the Claude API.

## Development Principles

### Chat State = DB State
All chat state must be persisted to MongoDB. Every message type (user, assistant, status, user-question), every field (answers, statusInfo, agentActivity), and every state change (question answered, etc.) must save to the DB. If it's visible in the UI, it must survive a page reload.

### Bug Fixing Philosophy
When encountering a bug, **first understand the root cause**. Then redesign around it — don't just patch symptoms. Adding code is not always the solution. Sometimes the implementation was flawed from the beginning and needs to be rethought. Prefer clean rewrites of broken designs over layering workarounds on top.

### Agents Never Touch src/
Agents (especially the local agent) must NEVER create files in `src/`, `docs/`, or any git-tracked directory. All agent-created content (extensions, scripts, data) lives in MongoDB, managed through REST APIs. The `userdata/` directory exists for scratch work only — the app does not serve from it.

## Skills (`.claude/skills/`)
Custom Claude Code skills for this project. Invocable via `/skill-name` or auto-loaded when relevant.
- `prompting` — Claude API prompting best practices (roles, XML tags, CoT, chaining, examples, templates). **Consult this before writing any prompt that will be sent to the Claude API.**
