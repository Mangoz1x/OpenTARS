# Agent Communication Architecture

How the TARS orchestrator communicates with remote agent instances across machines.

---

## Overview

TARS uses a **hub-and-spoke model**: one orchestrator (hub) communicates with many remote agents (spokes) over HTTP. Each remote agent is a fully independent Agent SDK instance running on its own machine. The orchestrator delegates tasks to them via custom MCP tools that make HTTP calls under the hood.

```
                          ┌─────────────────┐
                          │   User (Chat UI) │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │   Next.js App    │
                          │  (Frontend + API)│
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │   Orchestrator   │
                          │  (Agent SDK)     │
                          │                  │
                          │  MCP Tools:      │
                          │  - assign_task   │
                          │  - check_status  │
                          │  - get_result    │
                          │  - cancel_task   │
                          │  - list_agents   │
                          └──┬─────┬─────┬──┘
                             │     │     │
               HTTP ─────────┘     │     └───────── HTTP
                                   │
              ┌────────────┐  ┌────▼───────┐  ┌────────────┐
              │ Agent Server│  │Agent Server│  │Agent Server │
              │ (Home PC)   │  │ (VM-1)     │  │ (VM-2)     │
              │             │  │            │  │            │
              │ Agent SDK   │  │ Agent SDK  │  │ Agent SDK  │
              │ query()     │  │ query()    │  │ query()    │
              └─────────────┘  └────────────┘  └────────────┘
```

---

## Key Terminology

| Term | Meaning |
|---|---|
| **Orchestrator** | The main Agent SDK instance the user talks to. Runs inside or alongside the Next.js app. Has custom MCP tools to reach remote agents. |
| **Remote Agent** | An independent Agent SDK instance running on any machine. Exposes an HTTP API. Does NOT know about other agents. |
| **Agent Server** | The HTTP server wrapper around a remote Agent SDK instance. Handles task lifecycle, streaming, and auth. |
| **MCP Tools** | Custom tools registered on the orchestrator via `createSdkMcpServer()`. They translate Claude's tool calls into HTTP requests to remote agents. |

---

## Remote Agent Server — HTTP API

Each remote agent machine runs a lightweight Node.js HTTP server (Express or Fastify) wrapping the Agent SDK.

### Endpoints

#### `POST /tasks`
Start a new task on this agent.

**Request:**
```json
{
  "prompt": "Build the authentication system with JWT",
  "systemPrompt": "You are a senior backend developer...",
  "allowedTools": ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  "permissionMode": "acceptEdits",
  "cwd": "/home/user/projects/myapp",
  "maxTurns": 50,
  "maxBudgetUsd": 5.00,
  "sessionId": null
}
```

**Response:**
```json
{
  "taskId": "task_abc123",
  "sessionId": "session_xyz789",
  "status": "running",
  "createdAt": "2026-02-16T10:00:00Z"
}
```

**Notes:**
- `sessionId` in the request is optional. If provided, the agent resumes that session.
- `cwd` tells the agent which project directory to work in.
- `maxBudgetUsd` prevents runaway costs on a single task.
- `maxTurns` prevents infinite loops.

**Edge Cases:**
- If the agent is already running a task and doesn't support concurrency, return `409 Conflict` with the current task info.
- If `cwd` doesn't exist on the remote machine, return `400 Bad Request`.
- If `sessionId` is provided but doesn't exist or is expired, return `404 Not Found`.

---

#### `GET /tasks/:id`
Get the current status and result of a task.

**Response (running):**
```json
{
  "taskId": "task_abc123",
  "sessionId": "session_xyz789",
  "status": "running",
  "createdAt": "2026-02-16T10:00:00Z",
  "updatedAt": "2026-02-16T10:05:00Z",
  "turnsCompleted": 12,
  "costUsd": 0.42,
  "lastActivity": "Editing src/auth/middleware.ts"
}
```

**Response (completed):**
```json
{
  "taskId": "task_abc123",
  "sessionId": "session_xyz789",
  "status": "completed",
  "createdAt": "2026-02-16T10:00:00Z",
  "completedAt": "2026-02-16T10:12:00Z",
  "turnsCompleted": 28,
  "costUsd": 1.23,
  "result": "Successfully built JWT auth system with login, register, and middleware...",
  "stopReason": "end_turn",
  "filesModified": [
    "src/auth/middleware.ts",
    "src/auth/routes.ts",
    "src/models/User.ts"
  ]
}
```

**Possible `status` values:**

| Status | Meaning |
|---|---|
| `running` | Agent is actively working |
| `completed` | Agent finished successfully |
| `failed` | Agent hit an error |
| `cancelled` | Task was cancelled via `POST /tasks/:id/cancel` |
| `max_turns` | Agent hit the turn limit |
| `max_budget` | Agent hit the budget limit |

**Edge Cases:**
- Task ID not found → `404 Not Found`
- Task was garbage collected (old) → `410 Gone`

---

#### `GET /tasks/:id/stream`
SSE (Server-Sent Events) stream of real-time progress.

**Event types:**

```
event: text_delta
data: {"text": "Now I'll create the user model..."}

event: tool_start
data: {"tool": "Edit", "file": "src/models/User.ts"}

event: tool_end
data: {"tool": "Edit", "file": "src/models/User.ts", "success": true}

event: status
data: {"turnsCompleted": 15, "costUsd": 0.67}

event: result
data: {"status": "completed", "result": "Successfully built...", "costUsd": 1.23}

event: error
data: {"message": "Agent crashed: out of memory", "recoverable": false}
```

**Edge Cases:**
- Client disconnects mid-stream → server cleans up the SSE connection, agent keeps running.
- Task completes before client connects → immediately send the `result` event and close.
- Network interruption → client reconnects, server replays missed events since last `Last-Event-ID`.

---

#### `POST /tasks/:id/cancel`
Cancel a running task.

**Response:**
```json
{
  "taskId": "task_abc123",
  "status": "cancelled",
  "message": "Task cancelled by orchestrator"
}
```

**Edge Cases:**
- Task already completed → `409 Conflict` with `{"message": "Task already completed"}`
- Task not found → `404`
- Agent is mid-tool-execution (e.g., running a bash command) → the server uses the SDK's `abortController` to interrupt cleanly. The agent may leave partial changes.

---

#### `GET /agent/info`
Returns metadata about this agent instance.

**Response:**
```json
{
  "agentId": "home-pc-01",
  "name": "Home PC Developer Agent",
  "capabilities": ["code", "test", "debug", "build"],
  "status": "idle",
  "currentTask": null,
  "machine": {
    "hostname": "johns-desktop",
    "os": "windows",
    "cpus": 16,
    "memoryGb": 32
  },
  "sdk": {
    "version": "1.2.0",
    "model": "claude-sonnet-4-5-20250929"
  },
  "registeredAt": "2026-02-15T08:00:00Z",
  "lastHeartbeat": "2026-02-16T10:00:00Z"
}
```

**Edge Cases:**
- Agent is busy → `status: "busy"`, `currentTask` populated with task summary.
- Agent is unhealthy (e.g., can't reach Anthropic API) → `status: "unhealthy"`, include error details.

---

#### `GET /agent/health`
Simple health check for monitoring.

**Response:**
```json
{
  "healthy": true,
  "uptime": 86400,
  "apiKeyValid": true,
  "diskFreeGb": 42.5
}
```

---

## Orchestrator — MCP Tools

The orchestrator's Agent SDK instance has an in-process MCP server with tools that Claude calls to interact with remote agents.

### Tool Definitions

#### `assign_task`
Sends a task to a remote agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string | yes | ID of the registered agent (e.g., `"home-pc-01"`) |
| `task` | string | yes | Description of what the agent should do |
| `cwd` | string | no | Working directory on the remote machine |
| `max_turns` | number | no | Turn limit (default: 50) |
| `max_budget_usd` | number | no | Cost limit (default: 5.00) |
| `resume_session` | string | no | Session ID to resume |

**Behavior:**
1. Look up the agent's URL from the agent registry (DB).
2. `POST /tasks` to the remote agent.
3. Return the `taskId` and `sessionId` so the orchestrator can reference them later.

#### `check_status`
Gets the current status of a task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string | yes | Agent ID |
| `task_id` | string | yes | Task ID from `assign_task` |

**Behavior:** `GET /tasks/:id` on the remote agent, return the status.

#### `get_result`
Gets the final result of a completed task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string | yes | Agent ID |
| `task_id` | string | yes | Task ID |

**Behavior:** `GET /tasks/:id`, but only returns when the task is complete. If still running, returns a message telling the orchestrator to wait or check back later.

#### `cancel_task`
Cancels a running task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string | yes | Agent ID |
| `task_id` | string | yes | Task ID |

**Behavior:** `POST /tasks/:id/cancel` on the remote agent.

#### `list_agents`
Returns all registered agents and their current status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| (none) | | | |

**Behavior:** Reads from the agent registry (DB), optionally pings each agent's `/agent/info` endpoint for live status.

---

## Agent Registry

The orchestrator needs to know about all available agents. This is stored in MongoDB.

### Agent Document

```json
{
  "_id": "home-pc-01",
  "name": "Home PC Developer Agent",
  "url": "http://192.168.1.100:4001",
  "apiKey": "agent-secret-key-123",
  "capabilities": ["code", "test", "debug"],
  "defaultCwd": "/home/user/projects",
  "defaultModel": "claude-sonnet-4-5-20250929",
  "isOnline": true,
  "lastHeartbeat": "2026-02-16T10:00:00Z",
  "createdAt": "2026-02-15T08:00:00Z"
}
```

### Registration Flow

1. User sets up Agent Server on a machine.
2. User registers it in the TARS app (provides URL, name, API key).
3. The app pings `/agent/health` to verify connectivity.
4. The agent is saved to the registry and becomes available to the orchestrator.

### Heartbeat

- Each Agent Server sends a heartbeat to the orchestrator every 30 seconds (or the orchestrator polls `/agent/health`).
- If no heartbeat for 2 minutes, mark as `isOnline: false`.
- The orchestrator should NOT assign tasks to offline agents.

---

## Authentication & Security

Every request between orchestrator and remote agents must be authenticated.

### API Key Auth (Simple)

- Each agent has a shared secret (`apiKey`) stored in the registry.
- The orchestrator sends it as a `Bearer` token in the `Authorization` header.
- The Agent Server validates it before processing any request.

```
Authorization: Bearer agent-secret-key-123
```

### Edge Cases

- **Key rotation:** Support updating the key in the registry and on the agent without downtime.
- **Network exposure:** Agent Servers should ideally be on a private network or VPN. If exposed to the internet, use HTTPS + strong API keys.
- **Rate limiting:** Agent Servers should rate-limit requests to prevent abuse if an API key leaks.

---

## Error Handling & Recovery

### Agent Goes Offline Mid-Task

1. The orchestrator calls `check_status` and gets a connection error.
2. Mark the agent as offline in the registry.
3. Notify the user: "Agent [home-pc-01] went offline while working on [task]. The task may be partially complete."
4. When the agent comes back online, the orchestrator can query the task status — it may have completed, or the session can be resumed.

### Agent SDK Crashes

- The Agent Server wraps `query()` in try/catch.
- On crash, the task status is set to `failed` with the error message.
- The session ID is preserved — the orchestrator can resume it later.

### Network Timeout

- HTTP requests from orchestrator → agent should have a timeout (e.g., 10s for status checks, 30s for task creation).
- SSE streams should use `Last-Event-ID` for reconnection.
- If a task creation times out, the orchestrator should check `/tasks` on the agent to see if it was created.

### Concurrent Task Limits

- By default, each Agent Server handles one task at a time (Agent SDK is CPU/memory intensive).
- If a second task is assigned while one is running:
  - Option A: Queue it (agent has an internal queue).
  - Option B: Reject with `409 Conflict`.
  - The orchestrator should check agent status before assigning.

---

## Real-Time Streaming to the User

When a remote agent is working, the user should see progress in the chat UI.

### Flow

1. Orchestrator assigns a task via `assign_task` MCP tool.
2. The Next.js backend opens an SSE connection to the remote agent's `/tasks/:id/stream`.
3. As events come in, they are forwarded to the chat UI via the existing Next.js → client streaming mechanism.
4. The orchestrator is notified when the task completes (via polling or a callback).

### What the User Sees

```
TARS: I'm assigning the auth system to your Home PC agent.

[Home PC Agent - Working]
> Reading the project structure...
> Creating src/auth/middleware.ts
> Editing src/models/User.ts
> Running tests... all pass
> Done! (28 turns, $1.23)

TARS: The Home PC agent finished building the auth system.
      It created 3 files and all tests pass. Here's a summary: ...
```

---

## Open Questions / Future Considerations

### Multi-Agent Collaboration
- Two agents working on the same project at the same time (e.g., one on backend, one on frontend).
- Risk: file conflicts if both edit the same file.
- Mitigation: Assign non-overlapping directories, or use git branches per agent.

### Agent-to-Agent Communication
- Currently agents only talk to the orchestrator, not to each other.
- Future: An agent could request info from another agent via the orchestrator as a relay.

### File Transfer
- If the agent is on a different machine, how does the orchestrator see the files it created?
- Options: shared filesystem (NFS/SMB), git push/pull, file sync, or the agent sends file contents in the result.

### Session Persistence Across Restarts
- Agent Server restarts should preserve session state.
- The Agent SDK stores sessions on disk — as long as the disk persists, sessions survive restarts.

### Cost Tracking
- Each task reports its cost (`costUsd`).
- The orchestrator aggregates costs across all agents and reports to the user.
- Budget limits can be set per-task, per-agent, or globally.
