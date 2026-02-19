"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChatContainer } from "./components/chat-container";
import { Sidebar } from "./components/sidebar";
import type { ChatMessage, StopReason, UserQuestion } from "./components/types";
import { buildErrorStatus } from "@/lib/status-builders";
import { MODELS } from "./components/model-selector";

interface TaskTerminalData {
  status: string;
  result: string | null;
  error: string | null;
}

type TaskCompleteHandler = (taskId: string, data: TaskTerminalData) => void;

const SIDEBAR_WIDTH = 260;

interface ConversationItem {
  _id: string;
  title: string | null;
  lastMessageAt: string;
}

function getInitialChatId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("chat");
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(getInitialChatId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const streamActiveRef = useRef(false);
  const handledTasksRef = useRef(new Set<string>());

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Fetch conversations for sidebar
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations);
    } catch {
      // silently fail — sidebar will just be empty
    }
  }, []);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        data.messages.map((m: Record<string, unknown>) => ({
          id: m._id as string,
          role: m.role as string,
          content: (m.content as string) ?? "",
          timestamp: new Date(m.timestamp as string),
          agentActivity: m.agentActivity,
          statusInfo: m.statusInfo,
          userQuestion: m.userQuestion,
          citations: m.citations,
          toolUse: m.toolUse,
        }))
      );
    } catch {
      // silently fail
    }
  }, []);

  // Load conversations on mount (+ restore chat from URL)
  useEffect(() => {
    fetchConversations();
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync activeConversationId → URL query param
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeConversationId) {
      url.searchParams.set("chat", activeConversationId);
    } else {
      url.searchParams.delete("chat");
    }
    window.history.replaceState(null, "", url.toString());
  }, [activeConversationId]);

  // Select a conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      fetchMessages(id);
    },
    [fetchMessages]
  );

  // New chat
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  // Delete a conversation
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c._id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch {
        // silently fail
      }
    },
    [activeConversationId]
  );

  // Rename a conversation
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) return;
        setConversations((prev) =>
          prev.map((c) => (c._id === id ? { ...c, title } : c))
        );
      } catch {
        // silently fail
      }
    },
    []
  );

  // Stream orchestrator response via SSE. Shared by handleSendMessage and handleRetry.
  const streamResponse = useCallback(
    async (convId: string, content: string) => {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: content, model: selectedModel }),
      });

      if (!chatRes.ok || !chatRes.body) {
        const errData = await chatRes.json().catch(() => null);
        const errMsg = errData?.error ?? "Failed to get response from TARS.";
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "status",
            content: "",
            timestamp: new Date(),
            statusInfo: buildErrorStatus(errMsg, "unknown"),
          },
        ]);
        return;
      }

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Mutable: reset on segment_break so post-question text becomes a new message
      let assistantMsgId = crypto.randomUUID();
      let assistantCreated = false;
      let toolActivityMsgId: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            // --- Streaming text ---
            if (event.type === "content_delta" && event.text) {
              if (!assistantCreated) {
                assistantCreated = true;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: event.text as string,
                    timestamp: new Date(),
                  },
                ]);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + (event.text as string) }
                      : m
                  )
                );
              }
            }

            // --- User question loading (skeleton) ---
            if (event.type === "user_question_loading") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `question-${crypto.randomUUID()}`,
                  role: "user-question",
                  content: "",
                  timestamp: new Date(),
                },
              ]);
            }

            // --- User question ready (replace skeleton with real card) ---
            // Model is now paused in canUseTool, waiting for the user's answer.
            if (event.type === "user_question" && event.data) {
              setIsLoading(false);
              const data = event.data as { questions: UserQuestion["questions"] };
              const questionData: UserQuestion = {
                questions: data.questions,
                answered: false,
              };
              const questionDbId = event.messageId as string | undefined;

              // Swap optimistic assistant ID → real DB ID
              const assistantDbId = event.assistantMessageId as string | undefined;
              if (assistantDbId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, id: assistantDbId } : m
                  )
                );
              }

              setMessages((prev) => {
                const idx = [...prev]
                  .reverse()
                  .findIndex((m) => m.role === "user-question" && !m.userQuestion);
                if (idx !== -1) {
                  const realIdx = prev.length - 1 - idx;
                  const updated = [...prev];
                  updated[realIdx] = {
                    ...updated[realIdx],
                    ...(questionDbId ? { id: questionDbId } : {}),
                    userQuestion: questionData,
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: questionDbId ?? `question-${crypto.randomUUID()}`,
                    role: "user-question" as const,
                    content: "",
                    timestamp: new Date(),
                    userQuestion: questionData,
                  },
                ];
              });
            }

            // --- Tool activity ---
            if (event.type === "tool_activity_start") {
              // Swap optimistic → real DB ID for pre-tool text that was flushed
              const flushedId = event.flushedMessageId as string | undefined;
              if (flushedId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, id: flushedId } : m
                  )
                );
              }

              const toolName = event.toolName as string;
              const detail = event.detail as string | undefined;
              const status = (event.completed ? "completed" : "active") as "completed" | "active";
              const newStep = { toolName, detail, status };

              if (!toolActivityMsgId) {
                // First tool step — create the tool-activity message
                toolActivityMsgId = `tool-activity-${crypto.randomUUID()}`;
                const id = toolActivityMsgId;
                setMessages((prev) => [
                  ...prev,
                  { id, role: "tool-activity", content: "", timestamp: new Date(), toolSteps: [newStep] },
                ]);
              } else {
                // Update existing tool-activity message
                const id = toolActivityMsgId;
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== id) return m;
                    const steps = m.toolSteps || [];
                    const lastStep = steps[steps.length - 1];

                    // Same tool still active → update its detail (and maybe mark completed)
                    if (lastStep?.status === "active" && lastStep.toolName === toolName) {
                      return {
                        ...m,
                        toolSteps: [
                          ...steps.slice(0, -1),
                          { ...lastStep, detail: detail ?? lastStep.detail, status },
                        ],
                      };
                    }

                    // Different tool or new completed step → append
                    return { ...m, toolSteps: [...steps, newStep] };
                  })
                );
              }
            }

            if (event.type === "tool_activity_end") {
              // Mark the active step as completed on the inline message
              const id = toolActivityMsgId;
              if (id) {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== id) return m;
                    return {
                      ...m,
                      toolSteps: (m.toolSteps || []).map((s) =>
                        s.status === "active" ? { ...s, status: "completed" as const } : s
                      ),
                    };
                  })
                );
              }
            }

            // --- Citations ---
            if (event.type === "citations") {
              const citations = event.citations as ChatMessage["citations"];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, citations } : m
                )
              );
            }

            // --- Segment break: finalize current segment, reset for next ---
            if (event.type === "segment_break") {
              toolActivityMsgId = null;
              assistantMsgId = crypto.randomUUID();
              assistantCreated = false;
            }

            // --- Done ---
            if (event.type === "done") {
              const statusInfo = event.statusInfo as ChatMessage["statusInfo"] | undefined;
              const statusMsgDbId = event.statusMessageId as string | undefined;

              if (statusInfo) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: statusMsgDbId ?? crypto.randomUUID(),
                    role: "status",
                    content: "",
                    timestamp: new Date(),
                    statusInfo,
                  },
                ]);
              }

              // Swap optimistic ID → real DB ID
              const savedId = event.messageId as string | undefined;
              if (savedId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, id: savedId }
                      : m
                  )
                );
              }
            }

            // --- Error ---
            if (event.type === "error") {
              const statusInfo = event.statusInfo as ChatMessage["statusInfo"] ??
                buildErrorStatus(
                  (event.message as string) ?? "An error occurred.",
                  event.errorType as string | undefined,
                  (event.stopReason as StopReason) ?? null
                );
              const errorMsgDbId = event.messageId as string | undefined;

              setMessages((prev) => [
                ...prev,
                {
                  id: errorMsgDbId ?? crypto.randomUUID(),
                  role: "status",
                  content: "",
                  timestamp: new Date(),
                  statusInfo,
                },
              ]);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [selectedModel]
  );

  // Send a message
  const handleSendMessage = useCallback(
    async (content: string) => {
      setIsLoading(true);

      try {
        let convId = activeConversationId;

        // Create conversation if none is active
        if (!convId) {
          const res = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) return;
          const data = await res.json();
          convId = data.conversation._id;
          setActiveConversationId(convId);
        }

        // Optimistically add user message to UI
        const optimisticUserMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, optimisticUserMsg]);

        // Save user message
        const userRes = await fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content }),
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          // Replace optimistic ID with real ID
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticUserMsg.id
                ? { ...m, id: userData.message._id }
                : m
            )
          );
        }

        streamActiveRef.current = true;
        try {
          await streamResponse(convId!, content);
        } finally {
          streamActiveRef.current = false;
        }

        // Re-fetch messages to pick up any agent-activity messages created by MCP tools
        await fetchMessages(convId!);

        // Refresh sidebar to pick up new title & ordering
        fetchConversations();
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId, fetchConversations, selectedModel, streamResponse]
  );

  // Retry after a failed response — clean up failed messages and re-stream
  const handleRetry = useCallback(
    async (errorMessageId: string) => {
      if (!activeConversationId) return;

      // Find the last user message (the one we're retrying)
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      // Remove everything after the last user message from UI
      const lastUserIdx = messages.findIndex((m) => m.id === lastUserMsg.id);
      setMessages((prev) => prev.slice(0, lastUserIdx + 1));

      // Clean up failed messages from DB
      try {
        await fetch(`/api/conversations/${activeConversationId}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastUserMessageId: lastUserMsg.id }),
        });
      } catch {
        // Best-effort — continue with retry even if cleanup fails
      }

      setIsLoading(true);
      streamActiveRef.current = true;
      try {
        await streamResponse(activeConversationId, lastUserMsg.content);
        await fetchMessages(activeConversationId);
        fetchConversations();
      } finally {
        streamActiveRef.current = false;
        setIsLoading(false);
      }
    },
    [activeConversationId, messages, fetchConversations, fetchMessages, streamResponse]
  );

  // Handle user question submission — save answers and unblock the model.
  const handleQuestionSubmit = useCallback(
    async (messageId: string, answers: Record<string, string>) => {
      // Mark the question as answered in local state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.userQuestion
            ? { ...m, userQuestion: { ...m.userQuestion, answered: true, answers } }
            : m
        )
      );

      if (!activeConversationId) return;

      // POST to answer endpoint — saves to DB. If a stream is alive, this
      // unblocks the poll loop in onQuestion and the model continues.
      try {
        await fetch(`/api/conversations/${activeConversationId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, answers }),
        });
      } catch {
        // Best-effort — local state already updated
      }

      // Only show loading if a stream is actively running (will resume).
      // After a page reload the stream is dead — the answer is saved to DB
      // but no model will process it. The user can retry via the error card.
      if (streamActiveRef.current) {
        setIsLoading(true);
      }
    },
    [activeConversationId]
  );

  // Handle task completion — claim the auto-response, then stream orchestrator summary.
  // `liveData` comes from polling the agent server directly so it's always fresh,
  // whereas the TARS Task doc may not be updated yet (webhook race condition).
  const handleTaskComplete: TaskCompleteHandler = useCallback(
    async (taskId: string, liveData: TaskTerminalData) => {
      // Client-side dedup: skip if already handled this task
      if (handledTasksRef.current.has(taskId)) return;
      handledTasksRef.current.add(taskId);

      // Don't auto-respond if a stream is already active or loading
      if (streamActiveRef.current || isLoading) return;

      const convId = activeConversationId;
      if (!convId) return;

      // Server-side atomic dedup: only one tab/reload can claim this
      try {
        const claimRes = await fetch(`/api/tasks/${taskId}/claim-response`, {
          method: "POST",
        });
        const claimData = await claimRes.json();
        if (!claimData.claimed) return;

        // Prefer live polling data over TARS Task doc (which may lag behind webhook)
        const result = liveData.result ?? claimData.result;
        const error = liveData.error ?? claimData.error;
        const status = liveData.status ?? claimData.status;

        const taskContext =
          `[SYSTEM] Agent "${claimData.agentName}" finished task "${claimData.summary}". ` +
          `Status: ${status}. ` +
          (result
            ? `Result:\n${result}`
            : error
              ? `Error:\n${error}`
              : "No result returned.");

        setIsLoading(true);
        streamActiveRef.current = true;
        try {
          await streamResponse(convId, taskContext);
          await fetchMessages(convId);
        } finally {
          streamActiveRef.current = false;
          setIsLoading(false);
        }
      } catch {
        // Best-effort — the task card already shows the final status
      }
    },
    [activeConversationId, isLoading, streamResponse, fetchMessages]
  ) as TaskCompleteHandler;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <motion.div
        className="h-full shrink-0 overflow-hidden border-r"
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div className="h-full" style={{ width: SIDEBAR_WIDTH }}>
          <Sidebar
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
          />
        </div>
      </motion.div>

      {/* Main content */}
      <div className="h-full min-w-0 flex-1">
        <ChatContainer
          onToggleSidebar={toggleSidebar}
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onQuestionSubmit={handleQuestionSubmit}
          onRetry={handleRetry}
          onTaskComplete={handleTaskComplete}
          model={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  );
}
