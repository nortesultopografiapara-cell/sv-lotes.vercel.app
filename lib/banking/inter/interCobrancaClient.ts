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
  raw: Record<string, unknown>;
};

export type InterWebhookRegistration = {
  webhookUrl: string;
  criacao?: string | null;
};

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

export function normalizeInterCobrancaDetail(
  raw: Record<string, unknown>,
  fallbackCodigo?: string,
): InterCobrancaDetail {
  const cobranca =
    raw.cobranca && typeof raw.cobranca === 'object'
      ? (raw.cobranca as Record<string, unknown>)
      : raw;
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
    nossoNumero: cobranca.nossoNumero ? String(cobranca.nossoNumero) : null,
    seuNumero: cobranca.seuNumero ? String(cobranca.seuNumero) : null,
    codigoBarras: cobranca.codigoBarras ? String(cobranca.codigoBarras) : null,
    linhaDigitavel: cobranca.linhaDigitavel ? String(cobranca.linhaDigitavel) : null,
    pixCopiaECola: cobranca.pixCopiaECola
      ? String(cobranca.pixCopiaECola)
      : cobranca.pixCopiaCola
        ? String(cobranca.pixCopiaCola)
        : null,
    raw,
  };
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

export function isInterSituacaoRecebido(situacao: string): boolean {
  const s = String(situacao || '').trim().toUpperCase();
  return s === 'RECEBIDO' || s === 'PAGO';
}

export function mapInterOrigemRecebimento(
  origem: string | null | undefined,
): 'BOLETO' | 'PIX' | 'UNKNOWN' {
  const o = String(origem || '').trim().toUpperCase();
  if (o.includes('PIX')) return 'PIX';
  if (o.includes('BOLETO') || o.includes('CODIGO_BARRAS') || o === 'BOLETO') return 'BOLETO';
  return 'UNKNOWN';
}
