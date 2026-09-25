export function sanitizeAssistantQuestion(raw: string): string {
  let text = String(raw || '').replace(/\u0000/g, ' ').trim();
  if (!text) return '';

  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[redacted]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]');
  text = text.replace(/\b\d{11}\b/g, '[documento]');
  text = text.replace(/\b\d{14}\b/g, '[documento]');
  text = text.replace(/\b(?:sk|rk)-[A-Za-z0-9]{8,}\b/g, '[redacted]');
  return text.slice(0, 800);
}

export function looksLikeSecretQuestion(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('service_role') ||
    normalized.includes('service role') ||
    (normalized.includes('jwt') && normalized.includes('token')) ||
    normalized.includes('senha do') ||
    normalized.includes('api key')
  );
}
