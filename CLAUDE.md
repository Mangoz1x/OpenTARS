# TARS - Autonomous AI Agent

## Project Vision
Build an autonomous AI agent (TARS) that can do basically anything on the user's behalf. The goal is a general-purpose AI agent with broad capabilities.

## Core Architecture

### Orchestrator (Main Agent)
- The primary AI agent (Claude Agent SDK) the user interacts with through a **chat interface**.
- Acts as the **brain** — plans, delegates, and coordinates. **Never writes code itself.**
- Has **persistent memory** via Agent SDK session resume (`resume: sessionId` stored in MongoDB).
- Delegates ALL work to agents via **custom MCP tools** (`assign_task`, `check_status`, `get_result`, `cancel_task`, `list_agents`).

### Remote Agents (Fleet)
- Each is an **independent Agent SDK instance** running on its own machine (home PC, VM, cloud, etc.).
- Wrapped in a lightweight **HTTP server** (Agent Server) that exposes a REST API for task management.
- Communicate with the orchestrator over **HTTP** (REST + SSE for streaming).
- Do NOT know about each other — only the orchestrator knows the full fleet.
- Registered in MongoDB via an **Agent Registry**.
- **Work on external projects** (e.g., JustPix on a VM) — they don't touch the TARS codebase.

### Local Agent (`tars-local`)
- A dedicated Agent Server running **on the same machine** as the TARS app.
- Specializes in extending TARS itself — writes extensions, UI components, backend utils.
- Shares a filesystem with the Next.js app → writes to `userdata/extensions/`, app serves immediately.
- The orchestrator treats it like any other agent — `assign_task` to `localhost:4001`.
- Auto-starts with the TARS app, auto-registers in the agent registry.

**Full details:** `docs/features/agent-archetypes.md` (local agent section)

### Communication Flow
1. User talks to the **Orchestrator** via chat UI.
2. Orchestrator calls MCP tool (e.g., `assign_task`) → HTTP POST to remote Agent Server.
3. Remote agent runs autonomously via Agent SDK `query()`.
4. Orchestrator polls status or subscribes to **SSE stream** for real-time updates.
5. On completion, orchestrator relays results to the user.

**Full details:** `docs/features/agent-communication.md`

### Agent Archetypes
- Remote agents are instructed via **archetypes** — reusable definitions of role, system prompt, tools, and constraints.
- Built-in archetypes: `developer`, `cron-builder`, `researcher`, `reviewer`, `devops`, `extension-builder` (local agent only).
- Custom archetypes can be created via the UI or by the orchestrator itself. Stored in MongoDB.
- All prompts follow a strict standard: specific role, TARS context, output format, failure protocol, guardrails.

**Full details:** `docs/features/agent-archetypes.md`

### Self-Extension System
- The orchestrator can write **extensions** — full-stack features (backend `server.ts` + frontend `component.tsx`) that become permanent capabilities.
- Extensions render inside the chat via sandboxed iframes.
- Predefined Tier 1 blocks (forms, OAuth, env inputs) ship with the base project.
- Custom Tier 2 blocks are written by the agent at runtime.

**Full details:** `docs/features/dynamic-ui.md`

### Base Project vs. User Data
- The git-committed base project (`src/`, `docs/`, etc.) ships to everyone.
- User-personalized content lives in `userdata/` (gitignored): extensions, memory, env vars, config.
- Extensions are loaded dynamically at runtime — not part of the Next.js build.
- A single catch-all API route (`src/app/api/extensions/[...slug]/route.ts`) serves all extensions.
- `TARS_USERDATA_DIR` env var configures the userdata location.

## Tech Stack
- **Next.js** — full-stack app (frontend chat UI + backend API in one project)
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — runtime for both orchestrator and remote agents
- **Agent Server** — lightweight HTTP server wrapping Agent SDK on each remote machine
- **MCP Tools** — in-process MCP server on orchestrator for remote agent communication
- **SSE** — real-time streaming from remote agents to orchestrator/UI
- **MongoDB** — agent registry, session IDs, user data, task history, archetypes

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

### `docs/learning/`
- Knowledge base for external tools, APIs, and libraries learned from their official docs.
- Examples: how to use the Anthropic Claude API, third-party integrations, etc.
- Referenced when building features that depend on these external systems.

## Development Principles

### Chat State = DB State
All chat state must be persisted to MongoDB. Every message type (user, assistant, status, user-question), every field (answers, statusInfo, agentActivity), and every state change (question answered, etc.) must save to the DB. If it's visible in the UI, it must survive a page reload.

### Bug Fixing Philosophy
When encountering a bug, **first understand the root cause**. Then redesign around it — don't just patch symptoms. Adding code is not always the solution. Sometimes the implementation was flawed from the beginning and needs to be rethought. Prefer clean rewrites of broken designs over layering workarounds on top.

## Skills (`.claude/skills/`)
Custom Claude Code skills for this project. Invocable via `/skill-name` or auto-loaded when relevant.
- `prompting` — Claude API prompting best practices (roles, XML tags, CoT, chaining, examples, templates). **Consult this before writing any prompt that will be sent to the Claude API.**
