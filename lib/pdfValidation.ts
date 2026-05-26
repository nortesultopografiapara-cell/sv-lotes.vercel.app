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

export function getReceiptValidationUrl(code: string): string {
  return `${getAppBaseUrl()}/validar-recibo/${encodeURIComponent(code)}`;
}

/** Número sequencial legível para recibo de despesa. */
export function createExpenseReceiptNumber(movementId?: string): string {
  const year = new Date().getFullYear();
  const suffix = movementId
    ? movementId.replace(/-/g, "").slice(0, 8).toUpperCase()
    : crypto.randomUUID().split("-")[0].toUpperCase();
  return `REC-${year}-${suffix}`;
}
