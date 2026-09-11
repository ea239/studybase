"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "登录失败");
      }
      // Full navigation rather than a router push: every page is server
      // rendered behind the middleware and needs the new cookie on the request.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={submit} className="surface flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">StudyBase 学库</h1>
          <p className="mt-1 text-sm text-neutral-500">这个站点可从公网访问，请先登录。</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          autoFocus
          className="rounded-xl border border-white/70 bg-white/60 px-3.5 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:bg-white/90"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-xl bg-neutral-900/90 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-900 disabled:opacity-40"
        >
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
