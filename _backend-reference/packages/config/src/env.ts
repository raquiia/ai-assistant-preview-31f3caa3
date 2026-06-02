export function getEnv(name: string, fallback = ""): string {
  const nodeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return nodeProcess?.env?.[name] ?? fallback;
}

export function getNumberEnv(name: string, fallback: number): number {
  const nodeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = nodeProcess?.env?.[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  apiPort: getNumberEnv("API_PORT", 4000),
  appOrigin: getEnv("APP_ORIGIN", "http://localhost:5173"),
  jwtSecret: getEnv("JWT_SECRET", "local-dev-secret"),
  mistralModel: getEnv("MISTRAL_MODEL", "mistral-large-latest"),
  openAiModel: getEnv("OPENAI_MODEL", "gpt-5.5"),
  searchProvider: getEnv("SEARCH_PROVIDER", "none"),
  allowedEmbedOrigins: getEnv("ALLOWED_EMBED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
