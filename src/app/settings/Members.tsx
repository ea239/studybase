"use client";

import { useCallback, useState } from "react";

type Member = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  approved: boolean;
  isOwner: boolean;
};

export function Members({ initial }: { initial: Member[] }) {
  // Seeded from the server render, so there is no fetch-on-mount; refreshed
  // only after an approve/revoke actually changes something.
  const [members, setMembers] = useState<Member[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setMembers(await res.json());
  }, []);

  async function act(id: string, action: "approve" | "revoke" | "remove") {
    setBusy(id);
    if (action === "remove") {
      await fetch(`/api/users/${id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: action === "approve" }),
      });
    }
    await load();
    setBusy(null);
  }

  const pending = members.filter((m) => !m.approved);
  const approved = members.filter((m) => m.approved);

  return (
    <div className="surface flex flex-col gap-3 rounded-xl p-4">
      <div>
        <h2 className="font-semibold">成员</h2>
        <p className="mt-1 text-sm text-neutral-500">用 Google 登录过的人会出现在这里，批准后才能访问。</p>
      </div>

      <>
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">待批准</p>
              {pending.map((m) => (
                <Row key={m.id} member={m} busy={busy === m.id} onAct={act} />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">已批准</p>
            {approved.map((m) => (
              <Row key={m.id} member={m} busy={busy === m.id} onAct={act} />
            ))}
          </div>
      </>
    </div>
  );
}

function Row({
  member,
  busy,
  onAct,
}: {
  member: Member;
  busy: boolean;
  onAct: (id: string, action: "approve" | "revoke" | "remove") => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {member.name ?? member.email}
          {member.isOwner && <span className="ml-2 text-xs text-neutral-400">管理员</span>}
        </div>
        {member.name && <div className="truncate text-xs text-neutral-400">{member.email}</div>}
      </div>
      {!member.isOwner && (
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {member.approved ? (
            <button
              onClick={() => onAct(member.id, "revoke")}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-900/[0.05] hover:text-neutral-900 disabled:opacity-40"
            >
              取消权限
            </button>
          ) : (
            <button
              onClick={() => onAct(member.id, "approve")}
              disabled={busy}
              className="rounded-lg bg-neutral-900/90 px-2.5 py-1 font-medium text-white hover:bg-neutral-900 disabled:opacity-40"
            >
              批准
            </button>
          )}
          <button
            onClick={() => onAct(member.id, "remove")}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            移除
          </button>
        </div>
      )}
    </div>
  );
}
