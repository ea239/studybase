"use client";

import { useEffect, useState } from "react";
import type { AiProvider } from "@/lib/ai/types";
import { usableOpencodeModels, visionOpencodeModels } from "@/lib/ai/models";
import { DEFAULT_MODELS } from "@/lib/ai/types";
import { copyText } from "@/lib/browser";

/**
 * A model chooser. opencode Go publishes a fixed catalogue, so typing an id by
 * hand there is just a way to make a typo — the options are the models this
 * app has actually reached. Every other provider takes an arbitrary id and
 * keeps a text field.
 */
function ModelField({
  label,
  value,
  onChange,
  provider,
  placeholder,
  allowEmpty = false,
  visionOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  provider: AiProvider;
  placeholder?: string;
  allowEmpty?: boolean;
  /** Restrict to models that can read images. */
  visionOnly?: boolean;
}) {
  if (provider !== "opencode") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        {label || null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5"
        />
      </label>
    );
  }

  const models = visionOnly ? visionOpencodeModels() : usableOpencodeModels();
  const families = [...new Set(models.map((m) => m.family))];
  // A saved id that has since been withdrawn would otherwise vanish from the
  // select and silently become whatever sits first in the list.
  const missing = value && !models.some((m) => m.id === value) ? value : null;

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label || null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5"
      >
        {allowEmpty && <option value="">{placeholder ?? "不设置"}</option>}
        {!allowEmpty && !value && <option value="">选择模型…</option>}
        {missing && <option value={missing}>{missing}（当前配置，已不在列表中）</option>}
        {families.map((family) => (
          <optgroup key={family} label={family}>
            {models
              .filter((m) => m.family === family)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · 每月 {m.included}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function SettingsForm() {
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [chatModels, setChatModels] = useState<string[]>([]);
  const [visionModel, setVisionModel] = useState("");
  const [reasoningModel, setReasoningModel] = useState("");
  const [translateModel, setTranslateModel] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mcpToken, setMcpToken] = useState("");
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpCopied, setMcpCopied] = useState<"url" | "token" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    // Both loads must clear their loading flag even on failure, or the page
    // sits on "加载中…" forever (e.g. request lands during a server restart).
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setProvider(data.provider);
          setApiKey(data.apiKey ?? "");
          setBaseUrl(data.baseUrl ?? "");
          setModel(data.model ?? DEFAULT_MODELS[data.provider as AiProvider]);
          setChatModels(Array.isArray(data.chatModels) ? data.chatModels : []);
          setVisionModel(data.visionModel ?? "");
          setReasoningModel(data.reasoningModel ?? "");
          setTranslateModel(data.translateModel ?? "");
        }
      })
      .catch(() => setLoadError("设置加载失败，请刷新重试"))
      .finally(() => setLoading(false));
    fetch("/api/settings/mcp")
      .then((r) => r.json())
      .then((data) => setMcpToken(data.token))
      .catch(() => {})
      .finally(() => setMcpLoading(false));
  }, []);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  async function copy(value: string, which: "url" | "token") {
    const ok = await copyText(value);
    if (!ok) {
      // Non-secure context with no fallback available — tell the user to copy
      // by hand rather than silently pretending it worked.
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
      return;
    }
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
      body: JSON.stringify({ provider, apiKey, baseUrl, model, chatModels, visionModel, reasoningModel, translateModel }),
    });
    if (res.ok) setSaved(true);
  }

  if (loading) return <p className="text-sm text-neutral-500">加载中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">配置自动整理资料所用的 AI 服务。</p>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <form onSubmit={save} className="flex flex-col gap-4 surface rounded-xl p-4">
        <label className="flex flex-col gap-1 text-sm">
          服务商
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as AiProvider)}
            className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="custom">自定义（OpenAI 兼容接口 / 自建模型）</option>
            <option value="opencode">opencode Go</option>
          </select>
        </label>

        {provider === "custom" && (
          <label className="flex flex-col gap-1 text-sm">
            Base URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-endpoint.example.com/v1"
              className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5"
            />
          </label>
        )}

        <ModelField
          label="主模型"
          value={model}
          onChange={setModel}
          provider={provider}
          placeholder={DEFAULT_MODELS[provider] || "例如 gpt-4o-mini"}
        />
        <p className="-mt-2 text-xs text-neutral-500">日常提取、写笔记、答疑都用它。</p>

        <ModelField
          label="推理模型（可选）"
          value={reasoningModel}
          onChange={setReasoningModel}
          provider={provider}
          placeholder="留空则始终用主模型"
          allowEmpty
        />
        <p className="-mt-2 text-xs text-neutral-500">
          遇到公式、推导、复杂度这类内容时自动改用它；其余仍走主模型。
        </p>

        <div className="flex flex-col gap-1 text-sm">
          <span>答疑模型（按顺序尝试）</span>
          {[0, 1, 2].map((i) => (
            <ModelField
              key={i}
              label=""
              value={chatModels[i] ?? ""}
              onChange={(v) =>
                setChatModels((prev) => {
                  const next = [...prev];
                  if (v) next[i] = v;
                  else next.splice(i, 1);
                  // Compacted so a cleared middle entry does not leave a hole
                  // the fallback chain would step over.
                  return next.filter(Boolean);
                })
              }
              provider={provider}
              placeholder={i === 0 ? "留空则用主模型" : "不设置"}
              allowEmpty
            />
          ))}
        </div>
        <p className="-mt-2 text-xs text-neutral-500">
          文章内问答优先用第一个；额度用尽或该模型不可用时，自动改用下一个。
        </p>

        <ModelField
          label="识图模型（可选）"
          value={visionModel}
          onChange={setVisionModel}
          provider={provider}
          placeholder="不设置则无法解析图片"
          allowEmpty
          visionOnly
        />
        <p className="-mt-2 text-xs text-neutral-500">
          上传图片（png / jpg 等）时用它读出文字、公式和图表说明。不设置的话图片会解析失败。
        </p>

        <ModelField
          label="翻译模型（可选）"
          value={translateModel}
          onChange={setTranslateModel}
          provider={provider}
          placeholder="留空则用主模型"
          allowEmpty
        />
        <p className="-mt-2 text-xs text-neutral-500">笔记由主模型写英文，再由它翻成中文；用便宜的小模型即可。</p>

        <label className="flex flex-col gap-1 text-sm">
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5"
          />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-lg bg-neutral-900/90 transition-colors hover:bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            保存
          </button>
          {saved && <span className="text-sm text-green-700">已保存</span>}
        </div>
        <p className="text-xs text-neutral-500">API Key 以明文存在本地数据库，未加密。</p>
      </form>

      <div className="flex flex-col gap-3 surface rounded-xl p-4">
        <div>
          <h2 className="font-semibold">ChatGPT / Claude 接入（MCP）</h2>
          <p className="mt-1 text-sm text-neutral-500">
            配到 ChatGPT / Claude 的自定义连接器，即可只读查询你的资料库。
          </p>
        </div>

        {mcpLoading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              ChatGPT 用（Authentication 选「No authentication」）
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${mcpUrl}?token=${mcpToken}`}
                  className="flex-1 rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-2 py-1.5 font-mono text-xs"
                />
                <button
                  onClick={() => copy(`${mcpUrl}?token=${mcpToken}`, "url")}
                  className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  {mcpCopied === "url" ? "已复制" : "复制"}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Claude 用（地址 + Authorization: Bearer 密钥）
              <div className="flex gap-2">
                <input readOnly value={mcpUrl} className="flex-1 rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-2 py-1.5 font-mono text-xs" />
              </div>
              <div className="flex gap-2">
                <input readOnly value={mcpToken} className="flex-1 rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-2 py-1.5 font-mono text-xs" />
                <button
                  onClick={() => copy(mcpToken, "token")}
                  className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  {mcpCopied === "token" ? "已复制" : "复制"}
                </button>
              </div>
            </label>
            {copyFailed && (
              <p className="text-xs text-amber-700">
                当前不是安全上下文（非 HTTPS/localhost），浏览器不允许自动复制，请手动选中上面的内容复制。
              </p>
            )}
            <button
              onClick={regenerateMcpToken}
              className="w-fit rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              重新生成密钥
            </button>
          </>
        )}

      </div>
    </div>
  );
}
