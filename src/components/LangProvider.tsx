"use client";

import { useSyncExternalStore } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "studybase_lang";
const EVENT = "studybase-lang-change";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  // "storage" covers other tabs; the custom event covers this one.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}

function getSnapshot(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en" ? "en" : "zh";
}

// The server can't know the stored preference, so it always renders Chinese;
// the client swaps on hydration if the stored choice differs.
function getServerSnapshot(): Lang {
  return "zh";
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { lang, setLang };
}

function setLang(l: Lang) {
  localStorage.setItem(STORAGE_KEY, l);
  window.dispatchEvent(new Event(EVENT));
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  const options: { value: Lang; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "en", label: "EN" },
  ];

  return (
    <div
      role="group"
      aria-label="语言切换"
      className="relative flex items-center rounded-full bg-neutral-900/[0.06] p-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]"
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ transform: lang === "zh" ? "translateX(0)" : "translateX(100%)" }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLang(opt.value)}
          aria-pressed={lang === opt.value}
          className={`relative z-10 w-12 rounded-full py-1 text-xs transition-colors duration-200 ${
            lang === opt.value ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
