export type AiProvider = "openai" | "anthropic" | "custom" | "opencode";

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  // Only used when provider === "custom": base URL of an OpenAI-compatible endpoint.
  // "opencode" always uses OPENCODE_GO_BASE_URL below, so it's not user-editable.
  baseUrl?: string;
  model: string;
  // Optional cheaper model used only for translating already-written notes,
  // which is a mechanical task that doesn't need the main model. Falls back to
  // `model` when unset. Same provider/key — this is just a model id.
  translateModel?: string;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  custom: "",
  opencode: "",
};

// opencode Go's fixed gateway endpoint (OpenAI-compatible) — not user-editable,
// unlike "custom" which is an arbitrary self-hosted/third-party endpoint.
// NOTE: this is distinct from plain opencode Zen pay-as-you-go
// (https://opencode.ai/zen/v1) — Go has its own /zen/go/v1 path with its
// own balance; hitting the plain Zen path with a Go-only account 401s with
// "Insufficient balance" even though auth succeeds.
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
