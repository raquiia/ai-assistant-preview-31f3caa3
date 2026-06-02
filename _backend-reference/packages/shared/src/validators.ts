const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
  "video/webm"
]);

export function isAllowedUploadMimeType(mimeType: string): boolean {
  return allowedMimeTypes.has(mimeType);
}

export function assertSafeFileName(fileName: string): void {
  if (!fileName || fileName.length > 180) throw new Error("Invalid file name");
  if (/[\\/:*?"<>|]/.test(fileName)) throw new Error("File name contains forbidden characters");
}

export function detectLanguage(text: string, fallback = "fr"): string {
  const sample = text.toLowerCase();
  if (/\b(the|and|with|project|schedule|risk)\b/.test(sample)) return "en";
  if (/\b(el|la|los|con|riesgo|proyecto)\b/.test(sample)) return "es";
  if (/\b(der|die|das|und|projekt|risiko)\b/.test(sample)) return "de";
  return fallback;
}

export function humanEscalationMessage(language: string): string {
  if (language.startsWith("en")) {
    return "We cannot answer this request reliably. Please contact your manager.";
  }
  if (language.startsWith("es")) {
    return "No podemos responder a esta solicitud de forma fiable. Contacta con tu manager.";
  }
  if (language.startsWith("de")) {
    return "Wir konnen diese Anfrage nicht zuverlassig beantworten. Bitte kontaktieren Sie Ihre Fuhrungskraft.";
  }
  return "Nous ne pouvons pas repondre de maniere fiable a cette demande. Contactez votre manager.";
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}
