"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "./LangProvider";
import { Markdown } from "./Markdown";
import { randomId } from "@/lib/browser";

type Message = { role: "user" | "assistant"; content: string };

type Pending = { quote: string; x: number; y: number };

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
  const [pending, setPending] = useState<Pending | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(randomId());
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
            // Lets the server load this chapter's material (and search the
            // rest of the course) instead of answering from the quote alone.
            subjectId,
            chapterId,
            lang,
            sessionId: sessionId.current,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "请求失败");
        }
        if (!res.body) throw new Error("没有返回内容");

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "请求失败");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, quote, context, subjectId, chapterId, lang]
  );

  function openWithQuote(text: string) {
    setQuote(text);
    setPending(null);
    setOpen(true);
    setInput(lang === "en" ? "Explain this" : "解释这里");
    window.getSelection()?.removeAllRanges();
  }

  return (
    <>
      {/* Portalled to <body>: the reading column animates with a transform,
          which would otherwise make this fixed button position itself against
          that box and drift away from the selection as the page scrolls. */}
      {pending &&
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

      <div
        data-ask-panel
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 flex h-full w-[min(var(--ask-panel-w),100vw)] flex-col border-l border-white/60 bg-white/80 backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-900/[0.06] px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">问 AI</span>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  sessionId.current = randomId();
                }}
                className="text-xs text-neutral-400 transition-colors hover:text-neutral-700"
              >
                清空
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="text-neutral-400 transition-colors hover:text-neutral-900"
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
            {loading && <p className="text-sm text-neutral-400">思考中…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        <div className="border-t border-neutral-900/[0.06] px-4 py-3">
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
      </div>
    </>
  );
}
