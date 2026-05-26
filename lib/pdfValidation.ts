export function createDocumentValidationCode(): string {
  const a = crypto.randomUUID().split("-")[0].toUpperCase();
  const b = crypto.randomUUID().split("-")[1].toUpperCase();
  return `${a}-${b}`;
}

export function getAppBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://sv-lotes-vercel-app.vercel.app"
  ).replace(/\/$/, "");
}

export function getValidationUrl(code: string): string {
  return `${getAppBaseUrl()}/validar?codigo=${encodeURIComponent(code)}`;
}
