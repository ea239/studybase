"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ZOOMED_SCALE = 2.2;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
// Two taps closer together than this count as a double-tap. `dblclick` doesn't
// fire reliably on touch, so it's detected by hand as well.
const DOUBLE_TAP_MS = 300;

function distance(touches: TouchList) {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Image viewer: opens at a comfortable size rather than full-bleed, closes via
 * the X or the backdrop (never by clicking the image itself), double-click or
 * double-tap toggles zoom, and two fingers pinch to zoom freely.
 */
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Drives whether the transform animates. Kept in state, not a ref: it is
  // read during render, and a ref change wouldn't re-render.
  const [interacting, setInteracting] = useState(false);

  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleZoom = useCallback(() => {
    setScale((s) => (s > 1 ? 1 : ZOOMED_SCALE));
    setOffset({ x: 0, y: 0 });
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { startDist: distance(e.touches as unknown as TouchList), startScale: scale };
      drag.current = null;
      setInteracting(true);
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        toggleZoom();
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      if (scale > 1) {
        drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
        setInteracting(true);
      }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const next = (pinch.current.startScale * distance(e.touches as unknown as TouchList)) / pinch.current.startDist;
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
      return;
    }
    if (e.touches.length === 1 && drag.current) {
      setOffset({
        x: drag.current.ox + (e.touches[0].clientX - drag.current.x),
        y: drag.current.oy + (e.touches[0].clientY - drag.current.y),
      });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) {
      drag.current = null;
      setInteracting(false);
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setInteracting(true);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  }

  return createPortal(
    // Portalled to <body>: an ancestor with a transform would otherwise make
    // this fixed overlay position against that box instead of the viewport.
    <div
      role="dialog"
      aria-modal
      aria-label={alt}
      onClick={onClose}
      onMouseMove={onMouseMove}
      onMouseUp={() => {
        drag.current = null;
        setInteracting(false);
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-900/50 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[80vh] max-w-[min(900px,86vw)] overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-full bg-neutral-900/55 text-sm text-white backdrop-blur transition-colors hover:bg-neutral-900/80"
        >
          ✕
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG of unknown size, not a static asset */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onDoubleClick={toggleZoom}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: interacting ? "none" : "transform 0.2s ease-out",
            cursor: scale > 1 ? "grab" : "zoom-in",
            touchAction: "none",
          }}
          className="block max-h-[80vh] max-w-full object-contain select-none"
        />
      </div>
    </div>,
    document.body
  );
}
