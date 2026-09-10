"use client";

import { useEffect, useState } from "react";
import type { AiProvider } from "@/lib/ai/types";
import { DEFAULT_MODELS } from "@/lib/ai/types";

export default function SettingsPage() {
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [mcpToken, setMcpToken] = useState("");
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpCopied, setMcpCopied] = useState<"url" | "token" | null>(null);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setProvider(data.provider);
          setApiKey(data.apiKey ?? "");
          setBaseUrl(data.baseUrl ?? "");
          setModel(data.model ?? DEFAULT_MODELS[data.provider as AiProvider]);
        }
        setLoading(false);
      });
    fetch("/api/settings/mcp")
      .then((r) => r.json())
      .then((data) => {
        setMcpToken(data.token);
        setMcpLoading(false);
      });
  }, []);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  async function copy(value: string, which: "url" | "token") {
    await navigator.clipboard.writeText(value);
    setMcpCopied(which);
    setTimeout(() => setMcpCopied(null), 1500);
  }

  async function regenerateMcpToken() {
    if (!confirm("重新生成后，之前配置在 ChatGPT/Claude 里的旧密钥会立刻失效，需要重新配置。确定继续吗？")) return;
    setMcpLoading(true);
    const res = await fetch("/api/settings/mcp", { method: "POST" });
    const data = await res.json();
    setMcpToken(data.token);
    setMcpLoading(false);
  }

  function onProviderChange(p: AiProvider) {
    setProvider(p);
    if (!model || Object.values(DEFAULT_MODELS).includes(model)) {
      setModel(DEFAULT_MODELS[p]);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, baseUrl, model }),
    });
    if (res.ok) setSaved(true);
  }

  if (loading) return <p className="text-sm text-neutral-500">加载中…</p>;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <p className="text-sm text-neutral-500">
        配置用于自动整理资料（提取摘要、知识点、题目）的 AI 服务。支持 OpenAI、Anthropic，或任意 OpenAI 兼容接口（包括自部署模型）。
      </p>

      <form onSubmit={save} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          服务商
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as AiProvider)}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="custom">自定义（OpenAI 兼容接口 / 自建模型）</option>
          </select>
        </label>

        {provider === "custom" && (
          <label className="flex flex-col gap-1 text-sm">
            Base URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-endpoint.example.com/v1"
              className="rounded-md border border-neutral-300 px-2 py-1.5"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          模型名称
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODELS[provider] || "例如 gpt-4o-mini"}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            保存
          </button>
          {saved && <span className="text-sm text-green-700">已保存</span>}
        </div>
        <p className="text-xs text-neutral-500">
          API Key 目前以明文保存在本地数据库中（个人本地使用场景），尚未做加密存储，请勿在多用户/公网环境直接使用。
        </p>
      </form>

      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div>
          <h2 className="font-semibold">ChatGPT / Claude 接入（MCP）</h2>
          <p className="mt-1 text-sm text-neutral-500">
            把下面的地址配置到 ChatGPT 的自定义连接器（Developer mode → Add custom connector）或 Claude 的远程 MCP 服务器里，就能让它直接查询你的资料库——按科目/章节搜索知识点和题目、查看原文出处，但不能修改或删除任何内容。
          </p>
        </div>

        {mcpLoading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              ChatGPT 用（Authentication 选 &ldquo;No authentication&rdquo;，密钥已拼进地址里）
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${mcpUrl}?token=${mcpToken}`}
                  className="flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-mono text-xs"
                />
                <button
                  onClick={() => copy(`${mcpUrl}?token=${mcpToken}`, "url")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  {mcpCopied === "url" ? "已复制" : "复制"}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Claude / 支持自定义请求头的客户端用（服务器地址 + Authorization: Bearer 密钥）
              <div className="flex gap-2">
                <input readOnly value={mcpUrl} className="flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-mono text-xs" />
              </div>
              <div className="flex gap-2">
                <input readOnly value={mcpToken} className="flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-mono text-xs" />
                <button
                  onClick={() => copy(mcpToken, "token")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  {mcpCopied === "token" ? "已复制" : "复制"}
                </button>
              </div>
            </label>
            <button
              onClick={regenerateMcpToken}
              className="w-fit rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              重新生成密钥
            </button>
          </>
        )}

        <p className="text-xs text-neutral-500">
          注意：这个地址只有在 ChatGPT/Claude 的服务器能从公网访问到它时才能用——本机 localhost 地址它们连不进来。本地开发阶段可以用 ngrok / cloudflared 等内网穿透工具临时暴露出去测试；要长期使用需要把这个项目部署到有公网 HTTPS 地址的服务器上（比如 Vercel）。
        </p>
        <p className="text-xs text-neutral-500">
          ChatGPT 的自定义连接器目前只支持 &ldquo;No authentication&rdquo; 或 OAuth，没有直接填请求头的选项，所以密钥只能拼进 URL 里（类似日历订阅链接的做法）——不如请求头安全，请勿把这个带密钥的地址分享给别人。
        </p>
      </div>
    </div>
  );
}
