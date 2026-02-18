# Web Search & Web Fetch — Streaming Implementation

How Anthropic's server-side web tools work, how their streaming events map to TARS status updates, and the correct patterns for handling them with the Claude Agent SDK.

---

## 1. Tool Definitions

Both are **server-side tools** — Anthropic's API executes them, not our code. We just declare them.

### Web Search (`web_search_20250305`)

```ts
{
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,                          // optional cap
  allowed_domains: ["example.com"],     // optional whitelist
  blocked_domains: ["spam.com"],        // optional blacklist (cannot combine with allowed_domains)
  user_location: {                      // optional localization
    type: "approximate",
    city: "San Francisco",
    region: "California",
    country: "US",
    timezone: "America/Los_Angeles",
  },
}
```

- **$10 / 1,000 searches** on top of token costs.
- Citations are always enabled.
- Each search counts as one use regardless of result count.

### Web Fetch (`web_fetch_20250910`)

```ts
{
  type: "web_fetch_20250910",
  name: "web_fetch",
  max_uses: 5,                          // optional cap
  allowed_domains: ["docs.example.com"],
  blocked_domains: ["private.example.com"],
  citations: { enabled: true },         // optional (off by default, unlike search)
  max_content_tokens: 100000,           // optional token budget for fetched content
}
```

- **No extra charge** — only standard input token costs for fetched content.
- Can only fetch URLs that already appear in the conversation (user messages, prior search results, prior fetch results). Claude cannot construct URLs dynamically.
- Supports HTML (text) and PDF (base64). No JS-rendered pages.

### Dynamic Filtering (v2, Opus/Sonnet 4.6 only)

Tool versions `web_search_20260209` and `web_fetch_20260209` let Claude write code to filter results before they enter context. Requires:
- Beta header: `code-execution-web-tools-2026-02-09`
- Code execution tool must also be enabled.

## 2. Agent SDK Integration

In the orchestrator, tools are passed as string names to `query()`:

```ts
const stream = query({
  prompt: message,
  options: {
    tools: ["WebSearch", "WebFetch"],
    allowedTools: ["WebSearch", "WebFetch"],
    // ...
  },
});
```

The SDK translates `"WebSearch"` → `web_search_20250305` (server tool) and `"WebFetch"` → `web_fetch_20250910` (server tool) internally. We never construct the raw tool definition objects ourselves.

## 3. Streaming Event Sequence

Server-side tools produce a specific sequence of stream events. Understanding this is critical for correct status updates.

### Web Search — full event timeline

```
1. content_block_start   → type: "server_tool_use", name: "web_search"
2. content_block_delta   → input_json_delta: { "query": "..." }
3. content_block_stop    → tool call params done
   ↓ PAUSE — Anthropic runs the search server-side
4. content_block_start   → type: "web_search_tool_result", content: [{ type: "web_search_result", url, title, ... }]
5. content_block_stop    → results done
   ↓ model continues (may search again, or write final answer)
```

### Web Fetch — full event timeline

```
1. content_block_start   → type: "server_tool_use", name: "web_fetch"
2. content_block_delta   → input_json_delta: { "url": "..." }
3. content_block_stop    → tool call params done
   ↓ PAUSE — Anthropic fetches the URL server-side
4. content_block_start   → type: "web_fetch_tool_result", content: { type: "web_fetch_result", url, content: { type: "document", ... } }
5. content_block_stop    → results done
   ↓ model continues
```

### Key difference from client-side tools

With client-side tools (MCP tools, AskUserQuestion), the SDK:
1. Streams the tool call params
2. Emits `message_stop` (stop_reason: `"tool_use"`)
3. Runs the tool locally
4. Injects a user message with `tool_result`
5. Starts a new API turn → `message_start`

With server-side tools, steps 2–5 don't happen. The API handles tool execution inline and continues streaming. The SDK may still wrap results into a synthetic user message depending on version — check both `stream_event` and `msg.type === "user"` paths.

## 4. Mapping Events to TARS Status Updates

### Detection Strategy

Our orchestrator tracks tool activity through two paths:

**Path A: `stream_event` (raw API events)**

| Stream event | What we emit | Purpose |
|---|---|---|
| `content_block_start` with `server_tool_use` name `"web_search"` or `"web_fetch"` | `tool_activity_start` | Show spinner: "Searching the web..." or "Reading webpage..." |
| `content_block_delta` with `input_json_delta` | `tool_activity_start` (update) | Refine detail: show the search query or URL being fetched |
| `content_block_stop` for the tool block | Buffer → `pendingToolEndNames` | DON'T end yet — execution hasn't happened |
| Next `message_start` (new turn) | `tool_activity_end` for all pending | Tool execution is now complete |
| `message_delta` with `stop_reason: "end_turn"` | `tool_activity_end` for all pending | Safety flush — turn is over |

**Path B: `msg.type === "user"` (SDK-injected tool results)**

The SDK may inject a user message containing `tool_result` blocks with nested `web_search_tool_result` or `web_fetch_tool_result` content. We parse these for rich detail:

- **Search results**: Count results, extract unique domains → "Found 5 results from wikipedia.org, arxiv.org"
- **Fetch results**: Extract hostname → "Read docs.example.com"

These emit additional `tool_activity_start` events to update the detail text shown in the UI.

### Important: Timing of `tool_activity_end`

Do NOT emit `tool_activity_end` on `content_block_stop`. At that point the model has only *requested* the tool — execution hasn't happened yet. The correct signal is:

- **`message_start`** of the next turn (SDK has executed tools between turns)
- **`message_delta` with `stop_reason: "end_turn"`** (final turn, no more tool calls)

This is tracked via the `pendingToolEndNames` array in the orchestrator.

## 5. Response Content Blocks

### Web Search Result Structure

```ts
{
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_...",
  content: [
    {
      type: "web_search_result",
      url: "https://en.wikipedia.org/wiki/...",
      title: "Page Title",
      encrypted_content: "EqgfCi...",  // opaque — must pass back for multi-turn citations
      page_age: "April 30, 2025",
    },
    // ... more results
  ]
}
```

### Web Fetch Result Structure

```ts
// HTML content
{
  type: "web_fetch_tool_result",
  tool_use_id: "srvtoolu_...",
  content: {
    type: "web_fetch_result",
    url: "https://example.com/article",
    content: {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: "Full text..." },
      title: "Article Title",
      citations: { enabled: true },
    },
    retrieved_at: "2025-08-25T10:30:00Z",
  }
}

// PDF content
{
  type: "web_fetch_tool_result",
  tool_use_id: "srvtoolu_...",
  content: {
    type: "web_fetch_result",
    url: "https://example.com/paper.pdf",
    content: {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "JVBERi0x..." },
      citations: { enabled: true },
    },
    retrieved_at: "2025-08-25T10:30:02Z",
  }
}
```

### Error Structure

Errors come back as 200 responses with an error block — not HTTP errors:

```ts
// Search error
{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } }

// Fetch error
{ type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } }
```

Error codes — **search**: `too_many_requests`, `invalid_input`, `max_uses_exceeded`, `query_too_long`, `unavailable`.
Error codes — **fetch**: `invalid_input`, `url_too_long`, `url_not_allowed`, `url_not_accessible`, `too_many_requests`, `unsupported_content_type`, `max_uses_exceeded`, `unavailable`.

## 6. Citations

### Search citations (always on)

```ts
{
  type: "text",
  text: "Claude Shannon was born on April 30, 1916",
  citations: [{
    type: "web_search_result_location",
    url: "https://en.wikipedia.org/wiki/Claude_Shannon",
    title: "Claude Shannon - Wikipedia",
    encrypted_index: "Eo8B...",  // opaque — pass back for multi-turn
    cited_text: "Claude Elwood Shannon (April 30, 1916 – February 24, 2001)...",
  }]
}
```

### Fetch citations (opt-in via `citations.enabled: true`)

```ts
{
  type: "text",
  text: "the main argument is that AI will transform healthcare",
  citations: [{
    type: "char_location",
    document_index: 0,
    document_title: "Article Title",
    start_char_index: 1234,
    end_char_index: 1456,
    cited_text: "Artificial intelligence is poised to revolutionize...",
  }]
}
```

### How TARS extracts citations

The orchestrator listens for `msg.type === "assistant"` events, iterates over `message.content` blocks, and dedupes citations by URL into a `Map<string, Citation>`. These are emitted as a `citations` event and saved with the assistant message in MongoDB.

```ts
// Simplified from orchestrator/index.ts
const citationMap = new Map<string, Citation>();
for (const block of content) {
  if (block.type === "text" && block.citations) {
    for (const c of block.citations) {
      if (c.url && c.title) {
        citationMap.set(c.url, { url: c.url, title: c.title, citedText: c.cited_text });
      }
    }
  }
}
```

## 7. Multi-Turn Conversations

For search/fetch to work correctly across turns, you **must** pass the full assistant response (including `encrypted_content`, `encrypted_index`, and all tool result blocks) back in subsequent messages. The Agent SDK handles this automatically via session resume (`resume: sessionId`). Do not strip or modify these opaque fields.

## 8. `pause_turn` Stop Reason

Web search responses may include `stop_reason: "pause_turn"`, indicating the API paused a long-running turn. To continue:
1. Take the response content as-is.
2. Send it back as the assistant message in a new request.
3. The model picks up where it left off.

The Agent SDK handles this internally within its turn loop.

## 9. Cost Control Checklist

| Control | Search | Fetch |
|---|---|---|
| `max_uses` | Caps total searches per request | Caps total fetches per request |
| `max_content_tokens` | N/A | Truncates fetched content to token budget |
| `allowed_domains` | Restricts search results to listed domains | Restricts fetch targets to listed domains |
| `blocked_domains` | Excludes domains from results | Blocks fetching from listed domains |
| `maxTurns` (SDK) | Limits total agentic turns — caps how many searches the model can chain | Same — limits chained fetch loops |

## 10. Security Notes

- **Data exfiltration risk**: If the model processes untrusted user input alongside sensitive data, it could be tricked into fetching a URL that leaks data via query params. Mitigate with `allowed_domains` or disable fetch entirely.
- **URL validation**: Claude can only fetch URLs already present in the conversation. It cannot construct URLs dynamically. This is enforced server-side.
- **Homograph attacks**: Unicode characters in domain filters can bypass allow/block lists (`аmazon.com` with Cyrillic "а" ≠ `amazon.com`). Use ASCII-only domains in filter lists.
