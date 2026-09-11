"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type CredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: CredentialResponse) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/**
 * Google Identity Services sign-in. Uses the browser flow, so only the client
 * ID is needed (no secret, no redirect URI) — the resulting ID token is
 * verified server-side and matched against the email allowlist.
 */
export function GoogleButton({ clientId, onError }: { clientId: string; onError: (msg: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !holder.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (res) => {
        if (!res.credential) return onError("Google 未返回凭据");
        try {
          const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: res.credential }),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error ?? "登录失败");
          }
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href = next && next.startsWith("/") ? next : "/";
        } catch (err) {
          onError(err instanceof Error ? err.message : "登录失败");
        }
      },
    });

    window.google.accounts.id.renderButton(holder.current, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "signin_with",
    });
  }, [ready, clientId, onError]);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} />
      <div ref={holder} className="flex justify-center" />
    </>
  );
}
