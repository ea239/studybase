"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLang } from "./LangProvider";
import { Markdown } from "./Markdown";

type Message = { role: "user" | "assistant"; content: string };
type Pending = { quote: string; x: number; y: number };
type Thread = { id: string; title: string; updatedAt: string; messageCount: number };

function AiMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13 4.5 11l5.6-2z" />
    </svg>
  );
}

export function AskAI({
  context,
  subjectId,
  chapterId,
}: {
  context?: string;
  subjectId?: string;
  chapterId?: string | null;
}) {
  const { lang } = useLang();
  // Portals need document.body, which doesn't exist while server-rendering.
  // useSyncExternalStore gives false on the server and true on the client
  // without an effect (and without tripping the no-setState-in-effect rule).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Watch for a selection that lands inside quotable study content.
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if ((e.target as HTMLElement)?.closest?.("[data-ask-panel]")) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.isCollapsed || text.length < 2) {
        setPending(null);
        return;
      }
      const node = sel.anchorNode;
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
      if (!el?.closest("[data-quotable]")) {
        setPending(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setPending({ quote: text, x: rect.left + rect.width / 2, y: rect.top });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Marks the page so CSS can collapse the chapter nav and narrow the reading
  // column, instead of the panel covering what the user is reading.
  useEffect(() => {
    if (open) document.body.dataset.askOpen = "true";
    else delete document.body.dataset.askOpen;
    return () => {
      delete document.body.dataset.askOpen;
    };
  }, [open]);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations${subjectId ? `?subjectId=${subjectId}` : ""}`);
      if (res.ok) setThreads(await res.json());
    } catch {
      // The dropdown is a convenience; a failed list shouldn't raise an error.
    }
  }, [subjectId]);

  // Opening is an event, not a state to synchronise against — fetching here
  // rather than in an effect keeps it off the render path.
  const openPanel = useCallback(() => {
    setOpen(true);
    loadThreads();
  }, [loadThreads]);

  async function openThread(id: string) {
    setHistoryOpen(false);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("对话已不存在");
      const data = await res.json();
      setMessages(data.messages.map((m: Message) => ({ role: m.role, content: m.content })));
      setConversationId(id);
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }

  function newThread() {
    setHistoryOpen(false);
    setMessages([]);
    setConversationId(null);
    setQuote(null);
    setError(null);
  }

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || loading) return;
      const next: Message[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            quote,
            context,
            subjectId,
            chapterId,
            conversationId,
            lang,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "请求失败");
        }
        if (!res.body) throw new Error("没有返回内容");
        setConversationId(res.headers.get("X-Conversation-Id") ?? conversationId);

        // Append an empty assistant message, then grow it as chunks arrive so
        // the answer appears progressively instead of after the full generation.
        setMessages([...next, { role: "assistant", content: "" }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages([...next, { role: "assistant", content: acc }]);
        }
        loadThreads();
      } catch (err) {
        setError(err instanceof Error ? err.message : "请求失败");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, quote, context, subjectId, chapterId, conversationId, lang, loadThreads]
  );

  function openWithQuote(text: string) {
    setQuote(text);
    setPending(null);
    openPanel();
    setInput(lang === "en" ? "Explain this" : "解释这里");
    window.getSelection()?.removeAllRanges();
  }

  return (
    <>
      {/* All portalled to <body>: the reading column animates with a transform,
          which would otherwise make these fixed elements position against that
          box and drift away as the page scrolls. */}
      {mounted && pending &&
        createPortal(
          <button
            onClick={() => openWithQuote(pending.quote)}
            className="surface animate-fade-up fixed z-[65] -translate-x-1/2 -translate-y-full rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-lg"
            style={{ left: pending.x, top: pending.y - 8 }}
          >
            引用并提问
          </button>,
          document.body
        )}

      {mounted && !open &&
        createPortal(
          <button
            onClick={openPanel}
            aria-label="打开 AI 对话"
            title="问 AI"
            className="surface surface-interactive fixed top-[4.5rem] right-5 z-[55] flex size-11 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-900"
          >
            <AiMark className="size-5" />
          </button>,
          document.body
        )}

      {mounted && open &&
        createPortal(
          <div
            data-ask-panel
            className="animate-fade-up surface fixed top-[4.5rem] right-4 bottom-4 z-[55] flex w-[min(var(--ask-panel-w),calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl shadow-[0_8px_40px_-12px_rgba(16,24,40,0.35)]"
          >
            <div className="flex items-center justify-between border-b border-neutral-900/[0.07] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <AiMark className="size-4 text-neutral-500" />
                问 AI
              </span>

              <div className="flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-expanded={historyOpen}
                    className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
                  >
                    历史对话 ▾
                  </button>

                  {historyOpen && (
                    <div className="surface absolute top-full right-0 z-10 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl p-1 shadow-lg">
                      <button
                        onClick={newThread}
                        className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-900/[0.05]"
                      >
                        ＋ 新对话
                      </button>
                      {threads.length === 0 && (
                        <p className="px-2.5 py-2 text-xs text-neutral-400">还没有历史对话</p>
                      )}
                      {threads.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => openThread(t.id)}
                          className={`w-full rounded-lg px-2.5 py-2 text-left hover:bg-neutral-900/[0.05] ${
                            t.id === conversationId ? "bg-neutral-900/[0.05]" : ""
                          }`}
                        >
                          <span className="block truncate text-xs text-neutral-700">{t.title}</span>
                          <span className="block text-[11px] text-neutral-400">
                            {t.messageCount} 条 · {new Date(t.updatedAt).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                  className="rounded-lg px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
                >
                  ✕
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && !loading && (
                <p className="text-sm text-neutral-400">
                  在笔记里选中一段话，点「引用并提问」，就能针对那段内容提问。
                </p>
              )}
              <div className="flex flex-col gap-4">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div
                      key={i}
                      className="self-end rounded-2xl rounded-br-md bg-neutral-900/[0.06] px-3.5 py-2 text-sm whitespace-pre-wrap text-neutral-800"
                    >
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="text-[15px] leading-[1.7] text-neutral-800">
                      <Markdown>{m.content}</Markdown>
                    </div>
                  )
                )}
                {loading && messages[messages.length - 1]?.content === "" && (
                  <p className="text-sm text-neutral-400">思考中…</p>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            </div>

            <div className="border-t border-neutral-900/[0.07] px-4 py-3">
              {quote && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border-l-2 border-neutral-900/20 bg-neutral-900/[0.03] py-1.5 pr-2 pl-2.5">
                  <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-neutral-500">{quote}</p>
                  <button
                    onClick={() => setQuote(null)}
                    aria-label="移除引用"
                    className="text-xs text-neutral-400 transition-colors hover:text-neutral-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={2}
                  placeholder="问点什么…"
                  className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:bg-white/90"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded-xl bg-neutral-900/90 px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-neutral-900 disabled:opacity-30"
                >
                  发送
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
