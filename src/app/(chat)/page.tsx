"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ChatContainer } from "./components/chat-container";
import { Sidebar } from "./components/sidebar";
import type { ChatMessage, StopReason, UserQuestion } from "./components/types";
import { buildErrorStatus } from "@/lib/status-builders";
import { MODELS } from "./components/model-selector";

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

            // --- Segment break: finalize current segment, reset for next ---
            if (event.type === "segment_break") {
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

        await streamResponse(convId!, content);

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
      try {
        await streamResponse(activeConversationId, lastUserMsg.content);
        fetchConversations();
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId, messages, fetchConversations, streamResponse]
  );

  // Handle user question submission — save answers and resolve pending Promise
  // so the model continues on the same SSE stream (no extra user message).
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

      // POST to answer endpoint — saves to DB and resolves the pending Promise,
      // which unblocks canUseTool and lets the model continue.
      try {
        await fetch(`/api/conversations/${activeConversationId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, answers }),
        });
      } catch {
        // Best-effort — local state already updated
      }

      // Model is resuming on the existing stream
      setIsLoading(true);
    },
    [activeConversationId]
  );

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
          model={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  );
}
