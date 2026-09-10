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
  }, []);

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
    </div>
  );
}
