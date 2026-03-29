import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

const BASE = "/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  dataSummary?: DataSummary | null;
  isStreaming?: boolean;
  error?: boolean;
}

export interface DataSummary {
  projectsAnalyzed: number;
  totalInvestment: string;
  countriesCovered: number;
  sectorsCovered: number;
  queryTimestamp: string;
  dataSource: string;
}

export interface InsightContext {
  insightType?: string | null;
  sector?: string | null;
  country?: string | null;
  region?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: ChatMessage[];
  preview: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  conversationId: string;
  conversations: Conversation[];
  dataSummary: DataSummary | null;
  sendMessage: (content: string, context?: InsightContext) => Promise<void>;
  newConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  copyLastResponse: () => void;
  retryLast: () => Promise<void>;
}

const ChatContext = createContext<ChatState | null>(null);

const STORAGE_KEY = "afrienergy_conversations";

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadStoredConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos.slice(0, 50)));
  } catch {
    // Storage may be full or unavailable
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState(() => generateId());
  const [conversations, setConversations] = useState<Conversation[]>(loadStoredConversations);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const lastUserMessageRef = useRef<{ content: string; context?: InsightContext } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const saveCurrentConversation = useCallback((msgs: ChatMessage[], convId: string) => {
    if (msgs.length === 0) return;
    const userMsg = msgs.find(m => m.role === "user");
    const title = userMsg ? userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? "…" : "") : "New conversation";
    const preview = msgs.filter(m => m.role === "assistant").at(-1)?.content.slice(0, 100) ?? "";

    const convo: Conversation = {
      id: convId,
      title,
      date: new Date().toISOString(),
      messages: msgs,
      preview,
    };

    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== convId);
      const updated = [convo, ...filtered];
      saveConversations(updated);
      return updated;
    });
  }, []);

  const sendMessage = useCallback(async (content: string, context?: InsightContext) => {
    if (isStreaming) return;

    lastUserMessageRef.current = { content, context };
    setError(null);

    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    const assistantMsgId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const historyMessages = messages.map(m => ({ role: m.role, content: m.content }));
      historyMessages.push({ role: "user", content });

      const res = await fetch(`${BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyMessages, context }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let finalDataSummary: DataSummary | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "text") {
              accumulatedContent += event.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: accumulatedContent, isStreaming: true }
                  : m
              ));
            } else if (event.type === "done") {
              finalDataSummary = event.dataSummary ?? null;
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.startsWith("JSON")) {
              throw parseErr;
            }
          }
        }
      }

      // Finalize the assistant message
      const finalMessages = messages.concat([
        userMsg,
        {
          id: assistantMsgId,
          role: "assistant",
          content: accumulatedContent || "(No response received)",
          timestamp: new Date(),
          isStreaming: false,
          dataSummary: finalDataSummary,
        },
      ]);
      setMessages(finalMessages);
      setDataSummary(finalDataSummary);
      saveCurrentConversation(finalMessages, conversationId);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errMsg = err.message ?? "An unexpected error occurred.";
      setError(errMsg);
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: errMsg, isStreaming: false, error: true }
          : m
      ));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, messages, conversationId, saveCurrentConversation]);

  const newConversation = useCallback(() => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setError(null);
    setDataSummary(null);
    setIsStreaming(false);
    setConversationId(generateId());
  }, [isStreaming]);

  const loadConversation = useCallback((id: string) => {
    const convo = conversations.find(c => c.id === id);
    if (!convo) return;
    setMessages(convo.messages);
    setConversationId(id);
    setError(null);
    setDataSummary(convo.messages.filter(m => m.role === "assistant").at(-1)?.dataSummary ?? null);
  }, [conversations]);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (id === conversationId) {
      newConversation();
    }
  }, [conversationId, newConversation]);

  const copyLastResponse = useCallback(() => {
    const last = [...messages].reverse().find(m => m.role === "assistant");
    if (last?.content) {
      navigator.clipboard.writeText(last.content).catch(() => {});
    }
  }, [messages]);

  const retryLast = useCallback(async () => {
    if (!lastUserMessageRef.current || isStreaming) return;
    // Remove the last failed assistant message
    setMessages(prev => {
      const lastAssistant = [...prev].reverse().findIndex(m => m.role === "assistant");
      if (lastAssistant === -1) return prev;
      const idx = prev.length - 1 - lastAssistant;
      return prev.slice(0, idx);
    });
    const { content, context } = lastUserMessageRef.current;
    await sendMessage(content, context);
  }, [isStreaming, sendMessage]);

  return (
    <ChatContext.Provider value={{
      messages,
      isStreaming,
      error,
      conversationId,
      conversations,
      dataSummary,
      sendMessage,
      newConversation,
      loadConversation,
      deleteConversation,
      copyLastResponse,
      retryLast,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
