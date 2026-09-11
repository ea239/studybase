"use client";

import { useCallback, useState } from "react";
import { GoogleButton } from "./GoogleButton";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const onError = useCallback((msg: string) => setError(msg), []);
  const onPending = useCallback((email: string) => setPendingEmail(email), []);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="surface flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">StudyBase 学库</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {pendingEmail ? "已提交申请" : "使用 Google 账号登录。"}
          </p>
        </div>

        {pendingEmail ? (
          <p className="text-sm leading-relaxed text-neutral-600">
            <span className="font-medium">{pendingEmail}</span> 已记录，等待管理员批准后即可访问。
          </p>
        ) : (
          <>
            {clientId ? (
              <GoogleButton clientId={clientId} onError={onError} onPending={onPending} />
            ) : (
              <p className="text-sm text-red-600">未配置 Google 登录</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
