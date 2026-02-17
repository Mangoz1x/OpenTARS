---
name: prompting
description: Reference guide for crafting effective Claude API prompts. Use when writing or reviewing any prompt that will be sent to the Claude API from the TARS orchestrator or sub-agents.
user-invocable: true
---

# Prompting Skill — Claude API (for TARS)

Reference guide for crafting effective prompts when calling the Claude API from the orchestrator and sub-agents.

---

## 1. Be Clear and Direct

Claude is like a brilliant new employee with no context. Always provide:

- **What** the task is and **why** (what the output will be used for).
- **Who** the audience is.
- **Where** this task sits in a larger workflow.
- **What success looks like** — be explicit about the desired format and content.

Use numbered steps for multi-step instructions. If a colleague couldn't follow your prompt without asking questions, Claude can't either.

```
Bad:  "Summarize this data."
Good: "You are analyzing server logs for the TARS agent fleet.
       Summarize the following logs. Output only:
       1) Number of errors by type
       2) Most affected agent
       3) Recommended action
       Logs: {{LOGS}}"
```

---

## 2. Use XML Tags to Structure Prompts

XML tags prevent Claude from mixing up instructions, context, and data. Use them everywhere.

- Wrap dynamic data: `<task_description>`, `<code>`, `<context>`, `<agent_output>`
- Wrap instructions: `<instructions>`, `<rules>`
- Wrap desired output: `<output_format>`
- Nest when needed: `<examples><example>...</example></examples>`
- Be consistent — refer to tags by name in instructions ("Using the code in `<code>` tags...").

```xml
<instructions>
Analyze the agent's output and determine if the task is complete.
</instructions>

<agent_output>
{{SUB_AGENT_RESPONSE}}
</agent_output>

<rules>
- If complete, respond with: <status>complete</status>
- If incomplete, respond with: <status>in_progress</status> and <next_steps>...</next_steps>
</rules>
```

---

## 3. Use Examples (Multishot Prompting)

3-5 diverse examples dramatically improve accuracy, consistency, and format adherence. Essential when you need structured/predictable output from agents.

- Make examples **relevant** to the actual use case.
- Make examples **diverse** — cover edge cases and variations.
- Wrap in `<example>` tags.

```xml
Classify the sub-agent's status report.

<examples>
<example>
Input: "Finished building the login page. All tests pass. No blockers."
Classification: complete
Summary: Login page built and tested.
</example>
<example>
Input: "Hit a dependency issue with mongoose. Waiting on resolution."
Classification: blocked
Summary: Blocked on mongoose dependency.
</example>
</examples>

Now classify this: <report>{{AGENT_REPORT}}</report>
```

---

## 4. Let Claude Think (Chain of Thought)

For complex reasoning (planning, debugging, multi-factor decisions), instruct Claude to think step-by-step **and output its thinking**. No output = no thinking.

Three levels, use the minimum needed:

| Level | When to use | How |
|---|---|---|
| **Basic** | Simple reasoning | Add "Think step-by-step." |
| **Guided** | Domain-specific reasoning | Spell out the steps to think through. |
| **Structured** | Need to parse the answer separately | Use `<thinking>` and `<answer>` tags. |

**Structured is best for TARS** — the orchestrator can parse `<answer>` programmatically and discard `<thinking>`.

```xml
You are the TARS orchestrator deciding which sub-agent to assign a task to.

<available_agents>
{{AGENT_LIST}}
</available_agents>

<task>
{{USER_REQUEST}}
</task>

Think through your decision in <thinking> tags. Consider agent capabilities,
current workload, and task requirements. Then output your assignment in
<assignment> tags with the agent_id and a task brief.
```

---

## 5. Give Claude a Role (System Prompts)

Use the `system` parameter to set Claude's identity. This improves accuracy, tone, and focus. The more specific the role, the better.

**For the Orchestrator:**
```
system: "You are TARS, an autonomous AI orchestrator. You manage a fleet of
specialized sub-agents to accomplish tasks on behalf of the user. You plan,
delegate, monitor, and synthesize results. You are concise, strategic, and
always aware of your agents' capabilities and current status."
```

**For Sub-Agents:**
```
system: "You are a Developer Agent in the TARS system. You write production-
quality code, run tests, and report results back to the orchestrator. You
follow instructions precisely and report your status honestly — including
blockers and failures."
```

Tip: `"a senior backend engineer"` yields different (often better) results than just `"a developer"`. Be specific about the expertise level and domain.

---

## 6. Chain Complex Prompts

Don't cram everything into one massive prompt. Break multi-step workflows into sequential calls where each step gets Claude's full attention.

**When to chain:**
- Research → Plan → Execute → Review
- Parse input → Analyze → Decide → Format output
- Generate → Self-review → Refine

**How to chain:**
1. Each prompt has a single clear objective.
2. Pass outputs between prompts using XML tags.
3. Run independent sub-tasks in parallel for speed.

**TARS-specific chaining patterns:**

```
Orchestrator Flow:
  Prompt 1: Parse user request → extract intent + requirements
  Prompt 2: Plan execution → which agents, what order, what inputs
  Prompt 3: Generate task briefs for each sub-agent

Sub-Agent Self-Correction:
  Prompt 1: Execute task → produce output
  Prompt 2: Review own output for errors → list issues
  Prompt 3: Fix issues → produce final output
```

**Self-correction** is valuable for high-stakes tasks (code generation, data analysis). Have Claude review its own work in a second call.

---

## 7. Prompt Templates with Variables

Always use templates with `{{VARIABLES}}` for any prompt that will be reused. This is essential for TARS since the orchestrator and agents will be calling Claude programmatically.

- **Fixed content**: System prompt, instructions, output format, examples.
- **Variable content**: User input, agent responses, retrieved data, status info.

```
Template:
  system: "You are the TARS orchestrator..."
  user: "The user has requested: <request>{{USER_INPUT}}</request>
         Current agent status: <status>{{AGENT_STATUS}}</status>
         Available agents: <agents>{{AGENT_LIST}}</agents>
         Decide what to do next."
```

---

## Quick Reference: Combining Techniques

The most effective prompts for TARS will combine multiple techniques:

```
1. ROLE        → system parameter sets agent identity
2. XML TAGS    → structure the entire prompt
3. CLARITY     → specific instructions with numbered steps
4. EXAMPLES    → 2-3 examples of expected input/output
5. COT         → <thinking> + <answer> for decisions
6. TEMPLATES   → {{variables}} for all dynamic content
7. CHAINING    → multi-call workflows for complex tasks
```

**Example: Full orchestrator delegation prompt:**

```
system: "You are TARS, an autonomous AI orchestrator managing a fleet of
specialized sub-agents."

user:
<context>
The user wants to build a REST API for user authentication.
</context>

<available_agents>
{{AGENT_LIST_WITH_STATUS}}
</available_agents>

<instructions>
1. Analyze the request and break it into sub-tasks.
2. Assign each sub-task to the best available agent.
3. Define the execution order and any dependencies.
</instructions>

<examples>
<example>
Request: "Build a landing page"
Plan:
- Task 1: Design layout (designer-agent) → no dependencies
- Task 2: Implement HTML/CSS (dev-agent) → depends on Task 1
- Task 3: Review (review-agent) → depends on Task 2
</example>
</examples>

Think through your plan in <thinking> tags, then output the final plan in
<plan> tags as a structured list with agent assignments and dependencies.
```
