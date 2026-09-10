export type AiProvider = "openai" | "anthropic" | "custom";

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  // Only used when provider === "custom": base URL of an OpenAI-compatible endpoint
  baseUrl?: string;
  model: string;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  custom: "",
};
