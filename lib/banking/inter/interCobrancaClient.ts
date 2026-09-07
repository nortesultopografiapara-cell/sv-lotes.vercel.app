/**
 * Cliente HTTP Cobrança V3 Inter (consulta cobrança + CRUD webhook).
 * Usa OAuth+mTLS da Fase B. Sem emissão nesta fase além do necessário ao webhook.
 */

import https from 'node:https';
import type { BankEnvironment } from '@/lib/banking/types';
import { getInterCobrancaV3BaseUrl, INTER_OAUTH_SCOPES } from '@/lib/banking/inter/interEndpoints';
import {
  requestInterAccessToken,
  type InterOAuthCredentials,
  type InterOAuthFetchFn,
} from '@/lib/banking/inter/interOAuthClient';
import { isInterSituacaoTerminal } from '@/lib/banking/inter/interStatus';
import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';

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
  processingError?: string | null;
  raw: Record<string, unknown>;
};

/** Motivo da API antiga de boleto (`/{nossoNumero}/cancelar`, HTTP 204). */
export const INTER_LEGACY_BOLETO_CANCEL_MOTIVO = 'ACERTOS' as const;
/**
 * Motivo bolepix usado pelo ACBr/Postman com Accept problem+json.
 * O exemplo oficial da Cobrança v3 é CLIENTE_DESISTIU.
 */
export const INTER_BOLEPIX_CANCEL_MOTIVO = 'Solicitado Pela Empresa' as const;
/** Exemplo documentado da Cobrança v3 (não é da API antiga de boleto). */
export const INTER_COBRANCA_V3_DOCUMENTED_CANCEL_MOTIVO = 'CLIENTE_DESISTIU' as const;
/**
 * Accept exclusivo do POST /cancelar. NÃO misturar application/json:
 * o Inter recusa Accept json neste endpoint (violacao problem+json).
 * Isto é Accept, não Content-Type. O body continua application/json.
 */
export const INTER_COBRANCA_V3_CANCEL_ACCEPT = 'application/problem+json' as const;

const SAFE_RESPONSE_HEADER_KEYS = new Set([
  'content-type',
  'location',
  'retry-after',
  'x-request-id',
  'x-correlation-id',
  'x-ratelimit-remaining',
]);

export function resolveInterCobrancaV3CancelMotivo(chargeType?: string | null): string {
  const type = String(chargeType || '')
    .trim()
    .toUpperCase();
  if (type === 'BOLETO') return INTER_LEGACY_BOLETO_CANCEL_MOTIVO;
  return INTER_BOLEPIX_CANCEL_MOTIVO;
}

export function extractInterCobrancaProcessingError(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) return null;
  const found: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value == null) return;
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const rec = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(rec)) {
      if (/falha|erro|mensagem|detail|title|origem|observacao|violac/i.test(key)) {
        if (typeof item !== 'string') continue;
        const s = sanitizeInterOperatorDetail(item);
        if (s && /erro|falha|process|violac/i.test(s)) found.push(`${key}:${s}`);
      }
      visit(item, depth + 1);
    }
  };
  visit(raw, 0);
  return found[0] || null;
}

export function shouldLogInterCancelDiagnostics(): boolean {
  const vercel = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercel === 'production') return false;
  if (isProductionSupabaseRuntime()) return false;
  return vercel === 'preview' || process.env.NODE_ENV === 'development' || isDevelopHomologRuntime();
}

function redactPersonalIds(value: string): string {
  return String(value || '')
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[cpf-redacted]')
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '[cnpj-redacted]')
    .replace(/\d{11,14}/g, '[id-redacted]');
}

function redactSensitivePayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return redactPersonalIds(value).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactSensitivePayload(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactSensitivePayload(v, depth + 1);
  }
  return out;
}

export function pickSafeInterResponseHeaders(
  headers?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (!SAFE_RESPONSE_HEADER_KEYS.has(k)) continue;
    const s = String(value || '').trim();
    if (s && !OPERATOR_SECRET_RE.test(s)) out[k] = s.slice(0, 180);
  }
  return out;
}

/** Body HTTP Inter completo (POST/GET), sem token/certificado/CPF. */
export function sanitizeInterCobrancaHttpPayload(bodyText: string): Record<string, unknown> {
  const raw = String(bodyText || '').trim();
  if (!raw) return { empty: true, bodyLength: 0 };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const redacted = redactSensitivePayload(parsed);
    if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) {
      return { empty: false, bodyLength: raw.length, value: redacted };
    }
    const rec = redacted as Record<string, unknown>;
    const violacoes = Array.isArray(rec.violacoes) ? rec.violacoes : [];
    return {
      empty: false,
      bodyLength: raw.length,
      keys: Object.keys(rec),
      ...rec,
      violacoes,
    };
  } catch {
    return { empty: false, unparsedPreview: redactPersonalIds(raw).slice(0, 2000) };
  }
}

export function pickInterDiagnosticRawKeys(raw: Record<string, unknown> | null | undefined): string[] {
  const keys: string[] = [];
  const visit = (value: unknown, prefix: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 3) return;
    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((item, idx) => visit(item, `${prefix}[${idx}]`, depth + 1));
      return;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (/situacao|erro|falha|mensagem|violac|title|detail|status|origem/i.test(key)) {
        keys.push(path);
      }
      visit(item, path, depth + 1);
    }
  };
  visit(raw || {}, '', 0);
  return [...new Set(keys)].slice(0, 40);
}

export function isInterCancelPostRejected(
  status: number,
  json: Record<string, unknown> | null,
): boolean {
  if (status >= 400) return true;
  if (!json) return false;
  const violacoes = Array.isArray(json.violacoes) ? json.violacoes : [];
  if (violacoes.length > 0) return true;
  const title = String(json.title || '');
  const detail = String(json.detail || json.mensagem || '');
  if (/falha|not supported|não suportado|invalido|inválido/i.test(`${title} ${detail}`)) {
    return true;
  }
  const queued = String(json.status || '').toUpperCase();
  return queued === 'ERRO' || queued === 'FALHA' || queued === 'ERROR';
}

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
      status: parsed.status ?? null,
      mensagem: parsed.mensagem ?? null,
      violacoes,
    }) as Record<string, unknown>;
  } catch {
    return { unparsedPreview: raw.slice(0, 2000) };
  }
}

export class InterCobrancaHttpError extends Error {
  status: number;
  sanitized: Record<string, unknown>;
  constructor(status: number, bodyText: string, operation: 'emitir' | 'cancelar' = 'emitir') {
    const sanitized = sanitizeInterApiErrorBody(bodyText);
    super(`Falha ao ${operation} cobrança Inter (HTTP ${status}). ${JSON.stringify(sanitized)}`);
    this.name = 'InterCobrancaHttpError';
    this.status = status;
    this.sanitized = sanitized;
  }
}

export type InterCancelStage =
  | 'consulta_inicial'
  | 'pedido_cancelamento'
  | 'confirmacao';

const OPERATOR_SECRET_RE =
  /token|secret|password|authorization|cert(?:ificate)?|private.?key|client.?secret|api.?key|bearer|BEGIN [A-Z]/i;

export function sanitizeInterOperatorDetail(raw?: string | null): string {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s || OPERATOR_SECRET_RE.test(s)) return '';
  return s.slice(0, 280);
}

export function extractInterHttpStatusFromError(err: unknown): number | null {
  if (err instanceof InterCobrancaHttpError) return err.status;
  const msg = err instanceof Error ? err.message : String(err || '');
  const m = msg.match(/HTTP\s+(\d{3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Erro operacional do cancelamento Inter — sem token/certificado. */
export class InterRemoteCancelError extends Error {
  stage: InterCancelStage;
  httpStatus: number | null;
  situacao: string | null;
  codigoSolicitacao: string | null;

  constructor(input: {
    stage: InterCancelStage;
    httpStatus?: number | null;
    situacao?: string | null;
    codigoSolicitacao?: string | null;
    detail?: string | null;
  }) {
    const situacao = String(input.situacao || '')
      .trim()
      .toUpperCase() || null;
    const codigo = String(input.codigoSolicitacao || '').trim() || null;
    const httpStatus = input.httpStatus ?? null;
    const detail = sanitizeInterOperatorDetail(input.detail);
    const stageLabel =
      input.stage === 'consulta_inicial'
        ? 'consulta inicial'
        : input.stage === 'pedido_cancelamento'
          ? 'pedido de cancelamento'
          : 'confirmação';
    const parts: string[] = [];
    if (input.stage === 'confirmacao' && situacao && situacao !== 'CANCELADO' && situacao !== 'EXPIRADO') {
      parts.push('Inter — cancelamento não confirmado.');
      if (httpStatus != null && httpStatus >= 200 && httpStatus < 300) {
        parts.push(`POST aceito, porém consulta permaneceu ${situacao}.`);
      } else {
        parts.push(`consulta permaneceu ${situacao}.`);
      }
      if (detail) parts.push(detail);
    } else {
      parts.push(`Inter — ${stageLabel}.`);
      if (detail) parts.push(detail);
    }
    if (httpStatus != null && !parts.some((p) => p.includes(`HTTP ${httpStatus}`))) {
      parts.push(`HTTP ${httpStatus}.`);
    }
    if (situacao && input.stage !== 'confirmacao') parts.push(`situação ${situacao}.`);
    if (codigo) parts.push(`codigoSolicitacao: ${codigo}`);
    super(parts.join(' ').replace(/\s+/g, ' ').trim());
    this.name = 'InterRemoteCancelError';
    this.stage = input.stage;
    this.httpStatus = httpStatus;
    this.situacao = situacao;
    this.codigoSolicitacao = codigo;
  }

  withParcelLabel(index: number, total: number): string {
    const n = Math.max(1, index);
    const t = Math.max(n, total);
    return this.message.replace(/^Inter —/, `Inter — Parcela ${n}/${t} —`);
  }
}

export const INTER_CANCEL_CONFIRM_POLL = {
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 2000,
} as const;

function createMtlsAgent(creds: InterOAuthCredentials): https.Agent {
  return new https.Agent({
    cert: creds.certificatePem,
    key: creds.privateKeyPem,
    rejectUnauthorized: true,
    keepAlive: false,
  });
}

const defaultFetch: InterOAuthFetchFn = async (url, init) => {
  const { statusCode, body, headers } = await new Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const req = https.request(
      url,
      { method: init.method, headers: init.headers, agent: init.agent },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const hdrs: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers || {})) {
            if (typeof value === 'string') hdrs[key.toLowerCase()] = value;
            else if (Array.isArray(value) && value[0]) hdrs[key.toLowerCase()] = String(value[0]);
          }
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: hdrs,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(init.body);
    req.end();
  });
  return { status: statusCode, bodyText: body, headers };
};

async function authorizedRequest(
  creds: InterOAuthCredentials,
  path: string,
  init: { method: string; body?: unknown; accept?: string },
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<{
  status: number;
  json: Record<string, unknown> | null;
  bodyText: string;
  headers: Record<string, string>;
}> {
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
        Accept: init.accept || 'application/json',
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
    return { status: res.status, json, bodyText: res.bodyText, headers: res.headers || {} };
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
    processingError: extractInterCobrancaProcessingError(raw),
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

export type InterCancelPollAttempt = {
  attempt: number;
  elapsedMsFromPost: number;
  situacao: string;
  processingError: string | null;
  keys: string[];
  diagnosticKeys: string[];
};

export type InterPollOptions = {
  fetchFn?: InterOAuthFetchFn;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  elapsedFromMs?: number;
  onAttempt?: (attempt: InterCancelPollAttempt) => void;
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

/**
 * Após POST /cancelar (tipicamente 202 assíncrono).
 * Não trata boleto/PIX já emitido como sucesso — só situacao terminal
 * (CANCELADO / EXPIRADO / RECEBIDO).
 */
export async function pollInterCobrancaUntilCancelSettled(
  creds: InterOAuthCredentials,
  codigoSolicitacao: string,
  options?: InterPollOptions,
): Promise<InterCobrancaDetail> {
  const maxAttempts = options?.maxAttempts ?? INTER_CANCEL_CONFIRM_POLL.maxAttempts;
  const initialDelayMs =
    options?.initialDelayMs ?? INTER_CANCEL_CONFIRM_POLL.initialDelayMs;
  const maxDelayMs = options?.maxDelayMs ?? INTER_CANCEL_CONFIRM_POLL.maxDelayMs;
  const sleepFn = options?.sleepFn || defaultSleep;
  const startedAt = options?.elapsedFromMs ?? Date.now();

  let last: InterCobrancaDetail | null = null;
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (delay > 0) await sleepFn(delay);
    last = await fetchInterCobrancaByCodigo(creds, codigoSolicitacao, {
      fetchFn: options?.fetchFn,
    });
    options?.onAttempt?.({
      attempt,
      elapsedMsFromPost: Math.max(0, Date.now() - startedAt),
      situacao: last.situacao,
      processingError: last.processingError || null,
      keys: Object.keys(last.raw || {}),
      diagnosticKeys: pickInterDiagnosticRawKeys(last.raw),
    });
    if (isInterSituacaoTerminal(last.situacao)) return last;
    if (last.processingError) return last;
    delay = Math.min(
      maxDelayMs,
      Math.round(Math.max(delay, initialDelayMs || 400) * 1.6),
    );
  }
  if (!last) throw new Error('Timeout ao confirmar cancelamento Inter.');
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

/**
 * POST /cobranca/v3/cobrancas/{codigoSolicitacao}/cancelar
 * Escopo: boleto-cobranca.write. Resposta típica: 202 Accepted + PROCESSANDO.
 * HTTP 202 NÃO confirma CANCELADO. Sem identificador de operação — o
 * acompanhamento é o GET da mesma cobrança. Accept exclusivo problem+json.
 */
export async function cancelInterCobranca(
  creds: InterOAuthCredentials,
  codigoSolicitacao: string,
  options?: {
    fetchFn?: InterOAuthFetchFn;
    motivoCancelamento?: string;
  },
): Promise<{
  status: number;
  raw: Record<string, unknown> | null;
  bodyText: string;
  headers: Record<string, string>;
  accept: string;
  contentType: string;
  motivo: string;
  path: string;
}> {
  const code = encodeURIComponent(String(codigoSolicitacao || '').trim());
  if (!code) throw new Error('codigoSolicitacao ausente para cancelamento Inter.');
  const motivo =
    String(options?.motivoCancelamento || INTER_BOLEPIX_CANCEL_MOTIVO).trim() ||
    INTER_BOLEPIX_CANCEL_MOTIVO;
  const path = `/cobrancas/${code}/cancelar`;
  const accept = INTER_COBRANCA_V3_CANCEL_ACCEPT;
  const contentType = 'application/json';
  const res = await authorizedRequest(
    creds,
    path,
    {
      method: 'POST',
      body: { motivoCancelamento: motivo },
      accept,
    },
    { fetchFn: options?.fetchFn },
  );
  if (res.status < 200 || res.status >= 300 || isInterCancelPostRejected(res.status, res.json)) {
    throw new InterCobrancaHttpError(
      res.status,
      res.bodyText || JSON.stringify(res.json || {}),
      'cancelar',
    );
  }
  return {
    status: res.status,
    raw: res.json,
    bodyText: res.bodyText,
    headers: pickSafeInterResponseHeaders(res.headers),
    accept,
    contentType,
    motivo,
    path,
  };
}

export function logInterCancelDiagnostics(entry: {
  stage: string;
  codigoSolicitacao: string;
  method?: string;
  path?: string;
  accept?: string;
  contentType?: string;
  motivo?: string;
  httpStatus?: number | null;
  elapsedMsFromPost?: number | null;
  requestBody?: Record<string, unknown>;
  responseHeaders?: Record<string, string>;
  responseBody?: Record<string, unknown>;
  getSituacao?: string | null;
  getKeys?: string[];
  diagnosticKeys?: string[];
  processingError?: string | null;
}): void {
  if (!shouldLogInterCancelDiagnostics()) return;
  console.log('[inter][cancel][diag]', {
    stage: entry.stage,
    method: entry.method || null,
    path: entry.path || null,
    accept: entry.accept || null,
    contentType: entry.contentType || null,
    motivo: entry.motivo || null,
    codigoSolicitacao: entry.codigoSolicitacao,
    scopes: INTER_OAUTH_SCOPES,
    httpStatus: entry.httpStatus ?? null,
    elapsedMsFromPost: entry.elapsedMsFromPost ?? null,
    requestBody: entry.requestBody || null,
    responseHeaders: entry.responseHeaders || null,
    responseBody: entry.responseBody || null,
    getSituacao: entry.getSituacao || null,
    getKeys: entry.getKeys || null,
    diagnosticKeys: entry.diagnosticKeys || null,
    processingError: entry.processingError || null,
  });
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
