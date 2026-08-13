/**
 * Cliente HTTP Cobrança V3 Inter (consulta cobrança + CRUD webhook).
 * Usa OAuth+mTLS da Fase B. Sem emissão nesta fase além do necessário ao webhook.
 */

import https from 'node:https';
import type { BankEnvironment } from '@/lib/banking/types';
import { getInterCobrancaV3BaseUrl } from '@/lib/banking/inter/interEndpoints';
import {
  requestInterAccessToken,
  type InterOAuthCredentials,
  type InterOAuthFetchFn,
} from '@/lib/banking/inter/interOAuthClient';
import { isInterSituacaoTerminal } from '@/lib/banking/inter/interStatus';

export type InterCobrancaDetail = {
  codigoSolicitacao: string;
  situacao: string;
  valorNominal?: number;
  valorTotalRecebido?: number;
  origemRecebimento?: string | null;
  dataHoraSituacao?: string | null;
  nossoNumero?: string | null;
  seuNumero?: string | null;
  codigoBarras?: string | null;
  linhaDigitavel?: string | null;
  pixCopiaECola?: string | null;
  txid?: string | null;
  raw: Record<string, unknown>;
};

export type InterCreateCobrancaInput = {
  seuNumero: string;
  valorNominal: number;
  dataVencimento: string;
  numDiasAgenda?: number;
  pagador: {
    cpfCnpj: string;
    tipoPessoa: 'FISICA' | 'JURIDICA';
    nome: string;
    email?: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
    ddd?: string;
    telefone?: string;
  };
  formasRecebimento?: Array<'BOLETO' | 'PIX'>;
  multa?: { codigo: 'PERCENTUAL' | 'VALORFIXO'; taxa?: number; valor?: number };
  mora?: { codigo: 'TAXAMENSAL' | 'VALORDIA'; taxa?: number; valor?: number };
};

export type InterWebhookRegistration = {
  webhookUrl: string;
  criacao?: string | null;
};

const SENSITIVE_KEY_RE =
  /token|secret|password|authorization|cert|private.?key|client.?secret|api.?key|bearer|pem/i;

function redactSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveKeys);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactSensitiveKeys(v);
  }
  return out;
}

/** Resposta de erro Inter sem credenciais — inclui violacoes[].razao completo. */
export function sanitizeInterApiErrorBody(bodyText: string): Record<string, unknown> {
  const raw = String(bodyText || '').trim();
  if (!raw) return { empty: true };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const violacoes = Array.isArray(parsed.violacoes)
      ? parsed.violacoes.map((item) => {
          const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          return {
            razao: row.razao != null ? String(row.razao) : null,
            propriedade: row.propriedade != null ? String(row.propriedade) : null,
            valor: row.valor != null ? String(row.valor) : null,
          };
        })
      : [];
    return redactSensitiveKeys({
      title: parsed.title ?? null,
      detail: parsed.detail ?? null,
      timestamp: parsed.timestamp ?? null,
      violacoes,
    }) as Record<string, unknown>;
  } catch {
    return { unparsedPreview: raw.slice(0, 2000) };
  }
}

export class InterCobrancaHttpError extends Error {
  status: number;
  sanitized: Record<string, unknown>;
  constructor(status: number, bodyText: string) {
    const sanitized = sanitizeInterApiErrorBody(bodyText);
    super(`Falha ao emitir cobrança Inter (HTTP ${status}). ${JSON.stringify(sanitized)}`);
    this.name = 'InterCobrancaHttpError';
    this.status = status;
    this.sanitized = sanitized;
  }
}

function createMtlsAgent(creds: InterOAuthCredentials): https.Agent {
  return new https.Agent({
    cert: creds.certificatePem,
    key: creds.privateKeyPem,
    rejectUnauthorized: true,
    keepAlive: false,
  });
}

const defaultFetch: InterOAuthFetchFn = async (url, init) => {
  const { statusCode, body } = await new Promise<{ statusCode: number; body: string }>(
    (resolve, reject) => {
      const req = https.request(
        url,
        { method: init.method, headers: init.headers, agent: init.agent },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );
      req.on('error', reject);
      req.write(init.body);
      req.end();
    },
  );
  return { status: statusCode, bodyText: body };
};

async function authorizedRequest(
  creds: InterOAuthCredentials,
  path: string,
  init: { method: string; body?: unknown },
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<{ status: number; json: Record<string, unknown> | null; bodyText: string }> {
  const token = await requestInterAccessToken(creds, { fetchFn: options?.fetchFn });
  if (!token.ok) {
    throw new Error(token.message);
  }

  const base = getInterCobrancaV3BaseUrl(creds.environment);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const body =
    init.body === undefined || init.body === null
      ? ''
      : typeof init.body === 'string'
        ? init.body
        : JSON.stringify(init.body);

  const agent = createMtlsAgent(creds);
  const fetchFn = options?.fetchFn || defaultFetch;
  try {
    const res = await fetchFn(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        ...(body
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body,
      agent,
    });
    let json: Record<string, unknown> | null = null;
    try {
      json = res.bodyText ? (JSON.parse(res.bodyText) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, bodyText: res.bodyText };
  } finally {
    try {
      agent.destroy();
    } catch {
      /* ignore */
    }
  }
}

function pickNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickNonEmptyString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

export function interDetailHasPaymentArtifacts(detail: Pick<
  InterCobrancaDetail,
  'linhaDigitavel' | 'codigoBarras' | 'pixCopiaECola' | 'nossoNumero'
>): boolean {
  return Boolean(
    detail.linhaDigitavel || detail.codigoBarras || detail.pixCopiaECola || detail.nossoNumero,
  );
}

export function normalizeInterCobrancaDetail(
  raw: Record<string, unknown>,
  fallbackCodigo?: string,
): InterCobrancaDetail {
  const cobranca = asRecord(raw.cobranca) || raw;
  const boleto = asRecord(raw.boleto) || asRecord(cobranca.boleto) || {};
  const pix = asRecord(raw.pix) || asRecord(cobranca.pix) || {};
  const codigo = String(
    cobranca.codigoSolicitacao ||
      cobranca.idSolicitacao ||
      raw.codigoSolicitacao ||
      fallbackCodigo ||
      '',
  ).trim();
  return {
    codigoSolicitacao: codigo,
    situacao: String(cobranca.situacao || raw.situacao || '').trim().toUpperCase(),
    valorNominal: pickNumber(cobranca.valorNominal ?? raw.valorNominal),
    valorTotalRecebido: pickNumber(
      cobranca.valorTotalRecebido ??
        cobranca.valorTotalRecebimento ??
        raw.valorTotalRecebido ??
        raw.valorTotalRecebimento,
    ),
    origemRecebimento: cobranca.origemRecebimento
      ? String(cobranca.origemRecebimento)
      : raw.origemRecebimento
        ? String(raw.origemRecebimento)
        : null,
    dataHoraSituacao: cobranca.dataHoraSituacao
      ? String(cobranca.dataHoraSituacao)
      : raw.dataHoraSituacao
        ? String(raw.dataHoraSituacao)
        : null,
    nossoNumero: pickNonEmptyString(cobranca.nossoNumero, boleto.nossoNumero, raw.nossoNumero),
    seuNumero: pickNonEmptyString(cobranca.seuNumero, raw.seuNumero),
    codigoBarras: pickNonEmptyString(cobranca.codigoBarras, boleto.codigoBarras, raw.codigoBarras),
    linhaDigitavel: pickNonEmptyString(
      cobranca.linhaDigitavel,
      boleto.linhaDigitavel,
      raw.linhaDigitavel,
    ),
    pixCopiaECola: pickNonEmptyString(
      cobranca.pixCopiaECola,
      cobranca.pixCopiaCola,
      pix.pixCopiaECola,
      pix.pixCopiaCola,
      raw.pixCopiaECola,
    ),
    txid: pickNonEmptyString(cobranca.txid, pix.txid, raw.txid),
    raw,
  };
}

export async function createInterCobranca(
  creds: InterOAuthCredentials,
  input: InterCreateCobrancaInput,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<{ codigoSolicitacao: string; raw: Record<string, unknown> }> {
  const payload = {
    seuNumero: String(input.seuNumero || '').slice(0, 15),
    valorNominal: Number(input.valorNominal),
    dataVencimento: String(input.dataVencimento).slice(0, 10),
    numDiasAgenda: input.numDiasAgenda ?? 60,
    pagador: input.pagador,
    formasRecebimento: input.formasRecebimento || ['BOLETO', 'PIX'],
    ...(input.multa ? { multa: input.multa } : {}),
    ...(input.mora ? { mora: input.mora } : {}),
  };

  const res = await authorizedRequest(
    creds,
    '/cobrancas',
    { method: 'POST', body: payload },
    options,
  );
  if (res.status < 200 || res.status >= 300 || !res.json) {
    throw new InterCobrancaHttpError(res.status, res.bodyText || JSON.stringify(res.json || {}));
  }
  const codigo = String(
    res.json.codigoSolicitacao || res.json.idSolicitacao || '',
  ).trim();
  if (!codigo) {
    throw new Error('Inter não retornou codigoSolicitacao.');
  }
  return { codigoSolicitacao: codigo, raw: res.json };
}

export type InterPollOptions = {
  fetchFn?: InterOAuthFetchFn;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry/backoff até obter linha digitável/código de barras/PIX. A_RECEBER sem artefatos continua. */
export async function pollInterCobrancaUntilReady(
  creds: InterOAuthCredentials,
  codigoSolicitacao: string,
  options?: InterPollOptions,
): Promise<InterCobrancaDetail> {
  const maxAttempts = options?.maxAttempts ?? 6;
  const initialDelayMs = options?.initialDelayMs ?? 800;
  const maxDelayMs = options?.maxDelayMs ?? 5000;
  const sleepFn = options?.sleepFn || defaultSleep;

  let last: InterCobrancaDetail | null = null;
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await fetchInterCobrancaByCodigo(creds, codigoSolicitacao, {
      fetchFn: options?.fetchFn,
    });
    const hasArtifacts = interDetailHasPaymentArtifacts(last);
    if (hasArtifacts || isInterSituacaoTerminal(last.situacao)) {
      return last;
    }
    if (attempt < maxAttempts) {
      await sleepFn(delay);
      delay = Math.min(maxDelayMs, Math.round(delay * 1.6));
    }
  }
  if (!last) throw new Error('Timeout ao consultar cobrança Inter.');
  return last;
}

export async function fetchInterCobrancaByCodigo(
  creds: InterOAuthCredentials,
  codigoSolicitacao: string,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<InterCobrancaDetail> {
  const code = encodeURIComponent(String(codigoSolicitacao || '').trim());
  if (!code) throw new Error('codigoSolicitacao ausente.');
  const res = await authorizedRequest(
    creds,
    `/cobrancas/${code}`,
    { method: 'GET' },
    options,
  );
  if (res.status < 200 || res.status >= 300 || !res.json) {
    throw new Error(`Falha ao consultar cobrança Inter (HTTP ${res.status}).`);
  }
  return normalizeInterCobrancaDetail(res.json, codigoSolicitacao);
}

export function decodeInterCobrancaPdfPayload(
  json: Record<string, unknown> | null,
  bodyText: string,
): Buffer | null {
  const b64 = pickNonEmptyString(
    json?.pdf,
    json?.arquivo,
    json?.pdfBase64,
    json?.file,
  );
  if (b64) {
    const cleaned = b64.replace(/^data:application\/pdf;base64,/i, '');
    const bytes = Buffer.from(cleaned, 'base64');
    if (bytes.length > 4) return bytes;
  }
  const raw = String(bodyText || '');
  if (raw.startsWith('%PDF')) {
    return Buffer.from(raw, 'binary');
  }
  return null;
}

/** GET oficial /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf — não gera cobrança. */
export async function fetchInterCobrancaPdf(
  creds: InterOAuthCredentials,
  codigoSolicitacao: string,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<Buffer> {
  const code = encodeURIComponent(String(codigoSolicitacao || '').trim());
  if (!code) throw new Error('codigoSolicitacao ausente.');
  const res = await authorizedRequest(
    creds,
    `/cobrancas/${code}/pdf`,
    { method: 'GET' },
    options,
  );
  if (res.status === 404) {
    throw new Error('PDF oficial do boleto Inter ainda não está disponível para esta cobrança.');
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Falha ao obter PDF oficial Inter (HTTP ${res.status}).`);
  }
  const pdf = decodeInterCobrancaPdfPayload(res.json, res.bodyText);
  if (!pdf) {
    throw new Error('Inter não retornou PDF oficial para esta cobrança.');
  }
  return pdf;
}

export async function putInterCobrancaWebhook(
  creds: InterOAuthCredentials,
  webhookUrl: string,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<InterWebhookRegistration> {
  const url = String(webhookUrl || '').trim();
  if (!url.startsWith('https://')) {
    throw new Error('webhookUrl deve ser HTTPS.');
  }
  const res = await authorizedRequest(
    creds,
    '/cobrancas/webhook',
    { method: 'PUT', body: { webhookUrl: url } },
    options,
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Falha ao cadastrar webhook Inter (HTTP ${res.status}).`);
  }
  return {
    webhookUrl: url,
    criacao: res.json?.criacao ? String(res.json.criacao) : null,
  };
}

export async function getInterCobrancaWebhook(
  creds: InterOAuthCredentials,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<InterWebhookRegistration | null> {
  const res = await authorizedRequest(creds, '/cobrancas/webhook', { method: 'GET' }, options);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Falha ao consultar webhook Inter (HTTP ${res.status}).`);
  }
  const webhookUrl = String(res.json?.webhookUrl || '').trim();
  if (!webhookUrl) return null;
  return {
    webhookUrl,
    criacao: res.json?.criacao ? String(res.json.criacao) : null,
  };
}

export async function deleteInterCobrancaWebhook(
  creds: InterOAuthCredentials,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<void> {
  const res = await authorizedRequest(
    creds,
    '/cobrancas/webhook',
    { method: 'DELETE' },
    options,
  );
  if (res.status === 404) return;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Falha ao remover webhook Inter (HTTP ${res.status}).`);
  }
}

export { isInterSituacaoRecebido } from '@/lib/banking/inter/interStatus';

export function mapInterOrigemRecebimento(
  origem: string | null | undefined,
): 'BOLETO' | 'PIX' | 'UNKNOWN' {
  const o = String(origem || '').trim().toUpperCase();
  if (o.includes('PIX')) return 'PIX';
  if (o.includes('BOLETO') || o.includes('CODIGO_BARRAS') || o === 'BOLETO') return 'BOLETO';
  return 'UNKNOWN';
}
