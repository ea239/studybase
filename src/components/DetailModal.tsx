"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

// Panels can stack — a citation opened from inside an assignment's brief puts
// one over the other — and every one of them listens for Escape on the
// document. Without knowing which is on top, one press closes the lot.
const stack: symbol[] = [];

/**
 * A panel that opens over the page and can be pushed out to fill it.
 *
 * Reading an assignment or a chapter is usually a glance — checking what is
 * due, or what a rubric asks for — and losing the list you were reading to do
 * that costs more than it gives. Expanding is one click away for the times it
 * really is a sit-down read.
 *
 * Portalled to the body: an ancestor with a transform makes `position: fixed`
 * resolve against that ancestor instead of the viewport, and the page is full
 * of animated cards that have one.
 */
export function DetailModal({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Extra controls in the title bar, left of the close button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const [id] = useState(() => Symbol("modal"));

  useEffect(() => {
    stack.push(id);
    return () => {
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the topmost panel closes, so dismissing a citation does not also
      // dismiss the brief it was opened from.
      if (stack[stack.length - 1] !== id) return;
      // Escape steps back out of fullscreen before it closes: it is the
      // undo for the last thing you did, not a straight exit.
      if (full) setFull(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full, onClose, id]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
      // Later panels paint over earlier ones: they share a z-index, and DOM
      // order settles it once they are siblings on the body.
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-stone-900/30 p-4 backdrop-blur-sm sm:p-8"
      style={{ animation: "modal-fade 0.18s ease-out" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`surface my-auto flex w-full flex-col overflow-hidden rounded-2xl transition-[max-width,border-radius] duration-300 ${
          full ? "min-h-[calc(100vh-2rem)] max-w-none rounded-xl" : "max-w-[62rem]"
        }`}
        style={{ animation: "modal-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-900/[0.07] bg-[rgba(255,253,250,0.85)] px-4 py-2.5 backdrop-blur-xl">
          <button
            onClick={() => setFull((v) => !v)}
            aria-label={full ? "退出全屏" : "扩大到全屏"}
            title={full ? "退出全屏" : "扩大到全屏"}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-4">
              {full ? (
                <path d="M6.5 2v4.5H2M9.5 14V9.5H14" />
              ) : (
                <path d="M2 6V2h4M14 10v4h-4" />
              )}
            </svg>
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-neutral-700">
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
      </div>
    </div>,
    document.body
  );
}
