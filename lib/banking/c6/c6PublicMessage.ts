/** Texto de erro C6 seguro para a interface. Não devolve token, documento nem corpo bruto. */

const SECRET_PATTERN =
  /bearer\s+\S+|access_token|client_secret|private[_ ]key|begin certificate|begin private/i;

export function sanitizeC6PublicText(value: string): string {
  const cleaned = value
    .replace(/\d{11,14}/g, '[documento]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[credencial]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || SECRET_PATTERN.test(cleaned)) return '';
  return cleaned.slice(0, 180);
}

export function c6BankRejectionMessage(
  body: unknown,
  httpStatus: number | null,
): string {
  const status = httpStatus ? ` (HTTP ${httpStatus})` : '';
  const base = `C6 não confirmou o boleto${status}.`;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return base;
  const record = body as Record<string, unknown>;
  const raw = [record.title, record.detail, record.message, record.error]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ');
  const detail = sanitizeC6PublicText(raw);
  return detail ? `${base} ${detail}` : base;
}

export const C6_ADDRESS_NUMBER_REQUIRED_MESSAGE =
  'O Banco C6 exige o número do endereço do comprador. Atualize o cadastro do cliente antes de gerar o boleto.';
