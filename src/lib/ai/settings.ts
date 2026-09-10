import { prisma } from "@/lib/db";
import type { AiSettings } from "./types";

const SETTINGS_KEY = "ai_settings";

export async function getAiSettings(): Promise<AiSettings | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as AiSettings;
  } catch {
    return null;
  }
}

export async function saveAiSettings(settings: AiSettings) {
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
  });
}

// Returns settings with the API key masked, for display in the UI.
export function redact(settings: AiSettings): AiSettings {
  return { ...settings, apiKey: settings.apiKey ? "••••••••" : "" };
}
