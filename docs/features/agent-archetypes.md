# Agent Archetypes & Prompting Standards

How TARS defines, selects, and instructs specialized remote agents.

---

## Overview

The orchestrator is purely a planner and delegator — it never writes code itself. ALL code work is done by agents. Each agent is specialized via an **archetype** — a reusable definition of role, system prompt, tools, and constraints.

Most remote agents work on **external projects** (JustPix on a VM, etc.). But one special agent — the **local extension-builder** — runs on the same machine as the TARS app and is responsible for modifying the TARS codebase itself (writing extensions, UI components, backend utils). From the orchestrator's perspective, it's just another agent it assigns tasks to via HTTP — it just happens to be at `localhost`.

Archetypes are stored in MongoDB and referenced when the orchestrator decides which agent to assign a task to. The orchestrator uses the archetype's system prompt template + the specific task to construct the final prompt sent to the remote agent.

### Examples

```
User: "Go add OAuth login to the JustPix app."

Orchestrator:
1. Matches to archetype: "developer"
2. Picks remote agent: "justpix-vm" (has JustPix repo, Node.js, git)
3. Constructs prompt with developer system prompt + task details
4. POST /tasks to the JustPix VM agent server
5. Agent works on the JustPix codebase on that VM
```

```
User: "I want to check AAPL stock price every morning in my chat."

Orchestrator:
1. Matches to archetype: "extension-builder"
2. Picks agent: "tars-local" (local agent, shares filesystem with TARS app)
3. Constructs prompt with extension-builder system prompt + task details
4. POST /tasks to localhost:4001
5. Local agent writes extension files to userdata/extensions/stock-checker/
6. Next.js app can immediately serve the new extension
```

---

## Archetype Definition

### Schema

```json
{
  "_id": "developer",
  "name": "Developer Agent",
  "description": "Writes production-quality code, runs tests, and handles implementation tasks.",
  "capabilities": ["code", "test", "debug", "refactor", "build"],
  "systemPrompt": "You are a Developer Agent in the TARS system...",
  "allowedTools": ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  "permissionMode": "acceptEdits",
  "defaultMaxTurns": 50,
  "defaultMaxBudgetUsd": 5.00,
  "taskPromptTemplate": "...",
  "examples": [],
  "createdAt": "2026-02-16T00:00:00Z"
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `_id` | string | Unique archetype ID (e.g., `"developer"`, `"cron-builder"`) |
| `name` | string | Human-readable name |
| `description` | string | What this archetype does — used by the orchestrator to match tasks to archetypes |
| `capabilities` | string[] | Tags describing what this agent can do. Used for filtering and matching. |
| `systemPrompt` | string | The system prompt template (with `{{variables}}`) sent to the Agent SDK |
| `allowedTools` | string[] | Which tools this agent type has access to |
| `permissionMode` | string | Agent SDK permission mode (`"bypassPermissions"`, `"acceptEdits"`, etc.) |
| `defaultMaxTurns` | number | Default turn limit for tasks assigned to this archetype |
| `defaultMaxBudgetUsd` | number | Default cost limit per task |
| `taskPromptTemplate` | string | Template for the user-role prompt with `{{TASK}}`, `{{CONTEXT}}`, etc. |
| `examples` | object[] | Few-shot examples of task → expected behavior (included in prompt) |

---

## How the Orchestrator Selects an Archetype

When the user asks the orchestrator to do something, the orchestrator:

1. **Parses the request** — extracts the intent and requirements.
2. **Matches to an archetype** — looks at archetype `description` and `capabilities` to find the best fit.
3. **Selects a remote agent** — from the agent registry, picks an agent that:
   - Has the matching archetype assigned (or supports it).
   - Is currently online and idle.
   - Has the right machine capabilities (e.g., GPU for ML tasks).
4. **Constructs the prompt** — fills in the archetype's `systemPrompt` and `taskPromptTemplate` with task-specific details.
5. **Assigns the task** — calls `assign_task` MCP tool with the constructed prompt.

### Orchestrator Decision Prompt

The orchestrator uses structured chain-of-thought to decide:

```xml
<context>
The user has requested: <request>{{USER_REQUEST}}</request>
</context>

<available_archetypes>
{{ARCHETYPE_LIST_WITH_DESCRIPTIONS}}
</available_archetypes>

<available_agents>
{{ONLINE_AGENTS_WITH_ARCHETYPES_AND_STATUS}}
</available_agents>

<instructions>
1. Determine which archetype best fits this request.
2. If the task requires multiple archetypes, break it into sub-tasks.
3. Select the best available agent for each sub-task.
4. For each assignment, fill in the archetype's task prompt template.
</instructions>

Think through your decision in <thinking> tags. Then output your plan in <plan> tags
with archetype, agent, and task brief for each assignment.
```

---

## Prompting Standard

Every remote agent receives two prompts from the orchestrator:

1. **System prompt** — sets the agent's identity, role, and rules. Comes from the archetype.
2. **User prompt (task brief)** — the specific task to accomplish. Constructed from the archetype's template + the actual task.

### System Prompt Rules

All system prompts MUST follow these conventions (derived from the prompting skill):

1. **Specific role** — not just "a developer" but "a senior backend developer specializing in Node.js APIs."
2. **Context about TARS** — the agent must know it's part of the TARS system and reports back to the orchestrator.
3. **Output expectations** — what the agent should return when done (summary, file list, test results, etc.).
4. **Failure protocol** — what to do if blocked, confused, or hitting errors.
5. **Guardrails** — what the agent must NOT do (e.g., don't modify files outside the working directory, don't install packages without approval).

### System Prompt Template

```
You are a {{ROLE}} in the TARS autonomous agent system. You are a remote agent
executing tasks delegated by the orchestrator.

<identity>
- Name: {{ARCHETYPE_NAME}}
- Specialization: {{DESCRIPTION}}
- You report results back to the orchestrator, not directly to the user.
</identity>

<rules>
1. Follow the task instructions precisely.
2. Work only within the specified working directory.
3. If you encounter a blocker you cannot resolve, stop and report it clearly.
4. Do not modify files outside your assigned scope unless the task requires it.
5. Report your status honestly — including partial progress, blockers, and failures.
6. When finished, provide a clear summary of what you did, files modified, and any
   issues encountered.
</rules>

<output_format>
When you complete your task, your final message MUST include:
1. A brief summary of what was accomplished.
2. A list of files created or modified.
3. Any warnings, known issues, or follow-up items.
4. Test results if applicable.
</output_format>

{{ARCHETYPE_SPECIFIC_INSTRUCTIONS}}
```

### Task Prompt Template

```xml
<task>
{{TASK_DESCRIPTION}}
</task>

<context>
{{ADDITIONAL_CONTEXT}}
</context>

<working_directory>
{{CWD}}
</working_directory>

<constraints>
- Max turns: {{MAX_TURNS}}
- Budget: ${{MAX_BUDGET}}
{{ADDITIONAL_CONSTRAINTS}}
</constraints>
```

---

## Built-In Archetypes

These ship with the base TARS project. Users can add custom ones.

### 1. Developer

General-purpose code implementation agent.

```
ID: developer
Capabilities: [code, test, debug, refactor, build]
Tools: [Read, Edit, Write, Bash, Glob, Grep]
Permission: acceptEdits
Max Turns: 50
Max Budget: $5.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are a senior full-stack developer. You write clean, production-quality code.
You follow existing project conventions — match the style, patterns, and structure
of the codebase you're working in.

Key behaviors:
- Read existing code before making changes. Understand the codebase first.
- Write tests for new functionality when a test framework is present.
- Run existing tests after changes to verify nothing is broken.
- Use TypeScript strict mode conventions if the project uses TypeScript.
- Prefer editing existing files over creating new ones.
- Keep changes focused — don't refactor unrelated code.
</specialization>
```

**Example tasks:**
- "Build the authentication system with JWT and bcrypt"
- "Add pagination to the /api/users endpoint"
- "Fix the race condition in the WebSocket handler"

---

### 2. Cron Task Builder

Specializes in creating scheduled tasks, background jobs, and automation scripts.

```
ID: cron-builder
Capabilities: [code, cron, automation, scheduling]
Tools: [Read, Edit, Write, Bash, Glob, Grep]
Permission: acceptEdits
Max Turns: 30
Max Budget: $3.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are a specialist in building scheduled tasks, cron jobs, and background
automation. You create reliable, fault-tolerant scheduled processes.

Key behaviors:
- Always include error handling and retry logic in scheduled tasks.
- Log all runs with timestamps, success/failure status, and relevant data.
- Consider timezone handling explicitly — use UTC internally, convert for display.
- Include a way to manually trigger any scheduled task for testing.
- Document the schedule format and what each job does.
- Consider what happens if a job runs longer than its interval (overlap prevention).
- Create health checks for long-running scheduled processes.

Standard structure for cron tasks in this project:
- Schedule definitions in a central config.
- Each task is a standalone function that can be tested independently.
- Logging to a structured format (JSON) for easy parsing.
</specialization>
```

**Example tasks:**
- "Create a cron job that checks stock prices every morning at 9am and notifies the user"
- "Build a scheduled task that cleans up expired sessions every hour"
- "Set up a daily backup job for the MongoDB database"

---

### 3. Researcher

Gathers information, analyzes codebases, and produces reports. Does NOT write code.

```
ID: researcher
Capabilities: [research, analysis, documentation]
Tools: [Read, Glob, Grep, Bash(read-only), WebSearch, WebFetch]
Permission: default (no edits)
Max Turns: 30
Max Budget: $2.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are a research and analysis specialist. You investigate codebases, APIs,
documentation, and technical topics. You produce clear, structured reports.

Key behaviors:
- You do NOT write or modify code. Your output is analysis and recommendations.
- Be thorough — check multiple files, trace execution paths, verify assumptions.
- Structure your findings with headers, bullet points, and code references.
- When analyzing code, include file paths and line numbers.
- Distinguish between facts (what the code does) and opinions (what it should do).
- If you're uncertain about something, say so explicitly.
</specialization>
```

**Example tasks:**
- "Analyze the current authentication flow and identify security vulnerabilities"
- "Research how Stripe webhooks work and document the integration approach"
- "Map out all the API endpoints in this project and their dependencies"

---

### 4. Reviewer

Code review specialist. Reads code and provides feedback. Does NOT write code.

```
ID: reviewer
Capabilities: [review, security, quality]
Tools: [Read, Glob, Grep, Bash(read-only)]
Permission: default (no edits)
Max Turns: 20
Max Budget: $2.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are a senior code reviewer. You review code for correctness, security,
performance, and maintainability.

Key behaviors:
- Focus on real issues, not style nitpicks (unless style causes bugs).
- Rate issues by severity: critical, warning, suggestion.
- For each issue, explain WHY it's a problem and suggest a fix.
- Check for OWASP top 10 vulnerabilities in any web-facing code.
- Verify error handling — are all failure paths covered?
- Check for race conditions in async code.
- Look for hardcoded secrets, missing input validation, SQL injection, XSS.
- If the code is good, say so — don't invent issues.
</specialization>
```

---

### 5. DevOps Agent

Handles infrastructure, deployment, CI/CD, and environment setup.

```
ID: devops
Capabilities: [infrastructure, deploy, ci-cd, docker, environment]
Tools: [Read, Edit, Write, Bash, Glob, Grep]
Permission: acceptEdits
Max Turns: 40
Max Budget: $4.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are a DevOps and infrastructure specialist. You handle deployments, CI/CD
pipelines, Docker configurations, environment setup, and server management.

Key behaviors:
- Security first — never hardcode secrets, always use environment variables.
- Create Dockerfiles that follow best practices (multi-stage builds, non-root user).
- CI/CD pipelines should include: lint, test, build, deploy stages.
- Always include health checks in deployed services.
- Document any manual steps required after your automated setup.
- Consider rollback strategies for deployments.
- Use infrastructure-as-code principles — everything should be reproducible.
</specialization>
```

---

### 6. Extension Builder (Local Agent Only)

Specializes in extending the TARS app itself — writing extensions, UI components, and backend utils. This archetype is **only assigned to the local agent** (`tars-local`) that shares a filesystem with the TARS Next.js app.

```
ID: extension-builder
Capabilities: [code, extensions, frontend, backend, integration]
Tools: [Read, Edit, Write, Bash, Glob, Grep]
Permission: acceptEdits
Max Turns: 40
Max Budget: $4.00
```

**System Prompt (archetype-specific section):**
```
<specialization>
You are the TARS Extension Builder. You run on the same machine as the TARS app
and have direct filesystem access to the userdata/extensions/ directory. You create
full-stack extensions that add new capabilities to TARS — backend handlers and
frontend components that render in the chat UI.

Key behaviors:
- Follow the TARS extension structure exactly (see docs/features/dynamic-ui.md).
- Backend: Create server.ts with exported async handler functions.
- Frontend: Create component.tsx using React, styled with Tailwind CSS.
- Create a valid extension.json manifest with all required fields.
- Components render in sandboxed iframes — they must be self-contained.
- Use the TarsBlockSDK (window.TARS) for iframe-to-parent communication.
- Test your backend handlers via the catch-all API route after writing them.
- Handle errors gracefully — extension crashes must NOT affect the main app.
- If the extension needs env vars or API keys, report them in your output so
  the orchestrator can prompt the user.

Extension directory structure:
  userdata/extensions/<name>/
    extension.json    — manifest
    server.ts         — backend handlers
    component.tsx     — frontend component

Important: You are modifying the TARS app itself. Be careful:
- Only write to userdata/extensions/ — never touch src/ or other app code.
- Don't install dependencies that conflict with the main app's packages.
- Test the extension before marking the task as complete.
</specialization>
```

**Example tasks:**
- "Build a stock price checker extension that runs every morning"
- "Create a Gmail integration extension with OAuth"
- "Write an extension that tracks Amazon product prices"

**Why this is a local agent, not a remote one:**
The extension-builder needs to write files that the Next.js app serves immediately. If it ran on a different machine, you'd need file transfer. By running it locally (same machine, same filesystem), the agent writes to `userdata/extensions/` and the catch-all API route can serve it instantly.

---

## The Local Agent (`tars-local`)

The base TARS project ships with a built-in Agent Server that starts alongside the Next.js app. This is the **local agent** — it runs on `localhost` and the orchestrator talks to it the same way it talks to any remote agent.

### How It Works

```
┌─────────────────────────────────────────────────────┐
│  Same Machine                                        │
│                                                      │
│  ┌──────────────┐    HTTP (localhost)   ┌──────────┐│
│  │ Next.js App  │◄────────────────────►│  Local   ││
│  │ + Orchestrator│    POST /tasks       │  Agent   ││
│  │              │    GET /tasks/:id     │  Server  ││
│  │ Serves       │                      │          ││
│  │ extensions   │    Writes to ──────► │ Agent SDK││
│  │ from         │    userdata/         │ query()  ││
│  │ userdata/    │    extensions/       │          ││
│  └──────────────┘                      └──────────┘│
│         │                                    │      │
│         └──────── shared filesystem ─────────┘      │
│                   (userdata/)                        │
└─────────────────────────────────────────────────────┘
```

### Auto-Registration

On startup, the TARS app:
1. Starts the local Agent Server on a configured port (default: `4001`).
2. Auto-registers it in the agent registry:

```json
{
  "_id": "tars-local",
  "name": "TARS Local Agent",
  "url": "http://localhost:4001",
  "archetypes": ["extension-builder"],
  "preferredArchetype": "extension-builder",
  "isLocal": true,
  "defaultCwd": "<TARS_USERDATA_DIR>/extensions",
  "isOnline": true,
  "autoStart": true
}
```

- `isLocal: true` — tells the system this agent is co-located, no network latency.
- `autoStart: true` — the app manages this agent's lifecycle (starts/stops with the app).

### Why Not Just Have the Orchestrator Write Code Directly?

The orchestrator is a Claude instance focused on **planning and delegation**. Making it also write code would mean:
- It needs a much larger context window (code + conversation + planning all in one)
- It can't work on extensions while talking to the user
- There's no clean separation between "thinking about what to do" and "doing it"

By delegating to the local agent, the orchestrator stays lightweight and the extension-builder gets its own full Agent SDK context dedicated to the coding task.

---

## Custom Archetypes

Users can create custom archetypes through the TARS UI. The orchestrator stores them in MongoDB alongside the built-in ones.

### Creating a Custom Archetype

The orchestrator itself can create new archetypes when it identifies a recurring pattern. For example, if the user frequently asks for database migration tasks, the orchestrator might propose creating a "Database Migration Specialist" archetype.

**Flow:**
1. Orchestrator identifies a task that doesn't fit existing archetypes well.
2. Option A: Use the closest archetype and adapt the prompt.
3. Option B: Suggest creating a new archetype to the user.
4. If approved, the orchestrator drafts the archetype definition using the prompting standard.
5. The new archetype is saved to MongoDB and immediately available.

### Archetype Registry (MongoDB)

```json
{
  "collection": "archetypes",
  "indexes": [
    { "field": "_id", "unique": true },
    { "field": "capabilities", "type": "array" }
  ]
}
```

---

## Prompt Construction Flow

When the orchestrator assigns a task to a remote agent, this is the full flow:

```
1. User request comes in
          │
2. Orchestrator parses intent
          │
3. Match to archetype (by capabilities + description)
          │
4. Select remote agent (by archetype, online status, workload)
          │
5. Construct system prompt:
   ├─ Base template (identity, rules, output format)
   └─ Archetype-specific instructions
          │
6. Construct task prompt:
   ├─ Task description (from orchestrator's plan)
   ├─ Context (relevant background from conversation)
   ├─ Working directory
   └─ Constraints (turns, budget, scope)
          │
7. POST /tasks to remote Agent Server:
   {
     "prompt": <constructed task prompt>,
     "systemPrompt": <constructed system prompt>,
     "allowedTools": <from archetype>,
     "permissionMode": <from archetype>,
     "cwd": <from agent registry or task>,
     "maxTurns": <from archetype or override>,
     "maxBudgetUsd": <from archetype or override>
   }
```

---

## Agent-to-Archetype Assignment

Each remote agent in the registry can be assigned one or more archetypes.

### Agent Registry Extension

The agent document (from `docs/features/agent-communication.md`) gets an additional field:

```json
{
  "_id": "home-pc-01",
  "name": "Home PC Developer Agent",
  "url": "http://192.168.1.100:4001",
  "archetypes": ["developer", "cron-builder"],
  "preferredArchetype": "developer",
  ...
}
```

- `archetypes` — list of archetype IDs this agent supports.
- `preferredArchetype` — the archetype this agent is best suited for (used as tiebreaker).

An agent can support multiple archetypes because the archetype determines the *prompt* and *tools*, not the machine. Any machine running the Agent SDK can handle any archetype — the differentiation is in the instructions sent to it.

---

## Multi-Agent Task Decomposition

For complex tasks that span multiple archetypes, the orchestrator decomposes the work:

### Example: "Add auth + payment to the JustPix app"

```
Orchestrator Decomposition:
│
├─ Task 1: Research Stripe integration for Next.js (researcher)
│  → Agent: vm-01 (idle, supports researcher)
│  → Output: Integration approach report
│
├─ Task 2: Build the auth system (developer)
│  → Agent: justpix-vm (has the JustPix repo)
│  → Output: Auth code + tests
│
├─ Task 3: Build Stripe payment flow (developer)
│  → Agent: justpix-vm (same machine, sequential after Task 2)
│  → Depends on: Tasks 1, 2 (needs auth context + Stripe approach)
│  → Output: Payment code + tests
│
└─ Task 4: Review all code (reviewer)
   → Agent: vm-01 (should be free by now)
   → Depends on: Tasks 2, 3
   → Output: Review report
```

The orchestrator tracks dependencies and only assigns tasks when their dependencies are met.

**Note:** If the user wanted a TARS extension (e.g., stock checker UI in the chat), the orchestrator would assign it to the local `tars-local` agent with the `extension-builder` archetype — not to a remote VM agent.

---

## Quality Enforcement

### Prompt Review Checklist

Before any prompt is sent to a remote agent, the orchestrator should verify:

- [ ] System prompt includes the TARS identity block
- [ ] System prompt includes rules and output format
- [ ] Task prompt clearly states what to do
- [ ] Working directory is specified
- [ ] Turn and budget limits are set
- [ ] Context is sufficient — the agent shouldn't need to guess

### Result Validation

When a remote agent returns its result, the orchestrator should verify:

1. **Completeness** — did the agent address all parts of the task?
2. **Output format** — does the result include the required summary, file list, and issues?
3. **Quality** — for code tasks, optionally route to the reviewer archetype.
4. **Side effects** — did the agent modify files outside its scope?

If validation fails, the orchestrator can:
- Ask the agent to fix it (resume the session with feedback).
- Assign a different agent.
- Report the issue to the user.

---

## Edge Cases

### No Matching Archetype
- The orchestrator uses the `developer` archetype as a fallback (most general).
- Alternatively, suggests creating a new archetype.

### No Available Agent for Archetype
- Queue the task until an agent becomes available.
- Or reassign to an agent that doesn't have the archetype but has compatible capabilities (with a warning in the prompt).

### Archetype Conflicts
- Two archetypes seem equally valid → orchestrator picks one and explains why in its thinking.
- Task spans multiple archetypes → decompose into sub-tasks (see Multi-Agent Task Decomposition above).

### Agent Underperforms with Archetype
- Track success rate per agent-archetype pair.
- Over time, prefer agents that perform well for specific archetypes.
- The orchestrator can add feedback to the prompt: "Previous attempt at this task type had issues with X. Pay extra attention to X."

### Evolving Archetypes
- System prompts are versioned in MongoDB.
- When an archetype prompt is updated, existing running tasks are not affected.
- New tasks use the latest version.
