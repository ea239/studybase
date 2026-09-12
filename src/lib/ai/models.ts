// The models an opencode Go subscription includes, as its plan page lists
// them. Ids are the ones the gateway actually accepts (GET /v1/models) —
// the plan's display names differ from them, so they are recorded separately
// rather than derived.
//
// `verified` records that the model answered a real request from this app:
// the catalogue is a published plan, not a promise that every entry works for
// every account, and a model that 4xxs is worse than one that isn't offered.
export type OpencodeModel = {
  id: string;
  label: string;
  family: string;
  /** Monthly allowance the plan lists for this model. */
  included: string;
  verified: boolean;
  /** Why it isn't offered, when it isn't. */
  note?: string;
};

export const OPENCODE_MODELS: OpencodeModel[] = [
  { id: "gpt-5.6-luna", label: "GPT 5.6 Luna", family: "OpenAI", included: "$15", verified: false, note: "网关返回 500，反复重试均失败" },
  { id: "grok-4.6", label: "Grok 4.6", family: "xAI", included: "$15", verified: false, note: "网关不支持以 OpenAI 兼容格式调用（oa-compat）" },

  { id: "glm-5.3-flash", label: "GLM-5.3-Flash", family: "Zhipu GLM", included: "$60", verified: true },
  { id: "glm-5.3", label: "GLM-5.3", family: "Zhipu GLM", included: "$15", verified: true },
  { id: "glm-5.2", label: "GLM-5.2", family: "Zhipu GLM", included: "$60", verified: true },
  { id: "glm-5.1", label: "GLM-5.1", family: "Zhipu GLM", included: "$60", verified: true },

  { id: "kimi-k3", label: "Kimi K3", family: "Moonshot", included: "$15", verified: true },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code", family: "Moonshot", included: "$60", verified: true },
  { id: "kimi-k2.6", label: "Kimi K2.6", family: "Moonshot", included: "$60", verified: true },

  { id: "longcat-2.0", label: "LongCat-2.0", family: "Meituan", included: "$60", verified: true },

  { id: "mimo-v2.5", label: "MiMo-V2.5", family: "Xiaomi", included: "$60", verified: true },
  { id: "mimo-v2.5-pro", label: "MiMo-V2.5-Pro", family: "Xiaomi", included: "$15", verified: true },

  { id: "minimax-m3", label: "MiniMax M3", family: "MiniMax", included: "$60", verified: true },
  { id: "minimax-m2.7", label: "MiniMax M2.7", family: "MiniMax", included: "$60", verified: false, note: "网关返回 500，反复重试均失败" },

  { id: "muse-spark-1.3-contributor", label: "Muse Spark 1.3 Contributor", family: "Meta", included: "$60", verified: false, note: "需在 opencode 后台同意数据收集条款后才可用" },
  { id: "muse-spark-1.2-contributor", label: "Muse Spark 1.2 Contributor", family: "Meta", included: "$60", verified: false, note: "需在 opencode 后台同意数据收集条款后才可用" },

  { id: "qwen3.8-max", label: "Qwen3.8 Max", family: "Alibaba", included: "$15", verified: true },
  { id: "qwen3.8-flash", label: "Qwen3.8 Flash", family: "Alibaba", included: "$30", verified: true },
  { id: "qwen3.7-max", label: "Qwen3.7 Max", family: "Alibaba", included: "$30", verified: true },
  { id: "qwen3.7-plus", label: "Qwen3.7 Plus", family: "Alibaba", included: "$60", verified: true },
  { id: "qwen3.6-plus", label: "Qwen3.6 Plus", family: "Alibaba", included: "$60", verified: true },

  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", family: "DeepSeek", included: "$15", verified: true },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", family: "DeepSeek", included: "$15", verified: false, note: "最新版本仅在中国境内托管，需在 opencode 后台显式 opt in" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", family: "DeepSeek", included: "$30", verified: false, note: "最新版本仅在中国境内托管，需在 opencode 后台显式 opt in" },
  { id: "deepseek-v4-flash-vision-exp", label: "DeepSeek V4 Flash Vision Exp", family: "DeepSeek", included: "$15", verified: true },

  { id: "hy4-preview", label: "Hy4 preview", family: "Tencent Hunyuan", included: "$30", verified: true },
  { id: "hy3", label: "Hy3", family: "Tencent Hunyuan", included: "$60", verified: true },
];

export function opencodeModel(id: string) {
  return OPENCODE_MODELS.find((m) => m.id === id);
}

/** Offered in the settings dropdowns: only what this app has actually reached. */
export function usableOpencodeModels() {
  return OPENCODE_MODELS.filter((m) => m.verified);
}
