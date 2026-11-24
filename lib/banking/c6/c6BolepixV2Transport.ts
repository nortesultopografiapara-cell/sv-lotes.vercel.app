/**
 * Transporte HTTPS/mTLS do Bolepix v2.
 * Reutiliza o certificado e o OAuth já usados pelo C6.
 * A chamada real só ocorre para a parcela autorizada, com credenciais da própria integração.
 */

import https from 'node:https';
import { requestC6AccessToken, type C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import {
  C6_BOLETO_HTTP_TIMEOUT_MS,
  C6BoletoTransportError,
} from '@/lib/banking/c6/c6BoletoClient';
import {
  C6_BOLETO_PARTNER_SOFTWARE_NAME,
  C6_BOLETO_PARTNER_SOFTWARE_VERSION,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import {
  executeC6BolepixV2Create,
  executeC6BolepixV2Get,
  executeC6BolepixV2Pdf,
  readC6BolepixV2OfficialFields,
  C6BolepixV2LiveDisabledError,
  type C6BolepixV2CallResult,
  type C6BolepixV2FetchResult,
} from '@/lib/banking/c6/c6BolepixV2Client';
import {
  C6_BOLEPIX_V2_SPEC_VERSION,
  isC6BolepixV2LiveReceipt,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { c6BolepixV2Endpoint, redactC6BolepixV2Body } from '@/lib/banking/c6/c6BolepixV2Issue';
import {
  assertC6BolepixV2Reference,
  buildC6BolepixV2CreateBody,
  type C6BolepixV2CreateInput,
} from '@/lib/banking/c6/c6BolepixV2Validation';
import type { BankEnvironment } from '@/lib/banking/types';

type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<C6BolepixV2FetchResult>;

export type C6BolepixV2HttpPlan = {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body?: string;
  redactedHeaders: Record<string, string>;
  redactedBody: Record<string, unknown> | null;
};

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const copy = { ...headers };
  if (copy.Authorization) copy.Authorization = 'Bearer [redacted]';
  return copy;
}

export function planC6BolepixV2Request(input: {
  companyId: string;
  integrationId: string;
  creds: Pick<C6AuthCredentials, 'companyId' | 'integrationId' | 'environment'>;
  operation: 'create' | 'get' | 'pdf';
  accessToken: string;
  externalReferenceId?: string | null;
  body?: Record<string, unknown> | null;
}): C6BolepixV2HttpPlan {
  if (!input.companyId || input.creds.companyId !== input.companyId) {
    throw new Error('Integração de outra empresa.');
  }
  if (input.creds.integrationId && input.creds.integrationId !== input.integrationId) {
    throw new Error('Integração de outra empresa.');
  }
  const token = String(input.accessToken || '').trim();
  if (!token) throw new Error('Não foi possível autenticar no C6.');
  const base = c6BolepixV2Endpoint(input.creds.environment);
  let url = base;
  if (input.operation !== 'create') {
    const reference = assertC6BolepixV2Reference(String(input.externalReferenceId || ''));
    url = `${base}${encodeURIComponent(reference)}${input.operation === 'pdf' ? '/pdf' : ''}`;
  }
  if (!url.includes('/v2/bank_slips/') || url.includes('/v1/bank_slips/')) {
    throw new Error('O Bolepix só pode ser enviado ao endpoint oficial v2.');
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: input.operation === 'pdf' ? 'application/pdf' : 'application/json',
    'partner-software-name': C6_BOLETO_PARTNER_SOFTWARE_NAME,
    'partner-software-version': C6_BOLETO_PARTNER_SOFTWARE_VERSION,
  };
  let body: string | undefined;
  if (input.operation === 'create') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(input.body || {});
  }
  return {
    url,
    method: input.operation === 'create' ? 'POST' : 'GET',
    headers,
    body,
    redactedHeaders: redactHeaders(headers),
    redactedBody: input.body ? redactC6BolepixV2Body(input.body) : null,
  };
}

export function createC6BolepixMtlsAgent(
  creds: Pick<C6AuthCredentials, 'certificatePem' | 'privateKeyPem'>,
): https.Agent {
  const cert = String(creds.certificatePem || '').trim();
  const key = String(creds.privateKeyPem || '').trim();
  if (!cert || !key) throw new Error('Certificado C6 ausente para esta integração.');
  return new https.Agent({
    cert,
    key,
    rejectUnauthorized: true,
    keepAlive: false,
  });
}

function classifyCreate(status: number, hasId: boolean): C6BolepixV2CallResult['disposition'] {
  if (status === 201 && hasId) return 'succeeded';
  if (status >= 400 && status < 500 && !hasId) return 'rejected';
  return 'uncertain';
}

export async function performC6BolepixV2Https(
  plan: C6BolepixV2HttpPlan,
  request: FetchFn,
): Promise<C6BolepixV2FetchResult> {
  try {
    return await request(plan.url, {
      method: plan.method,
      headers: plan.headers,
      body: plan.body,
    });
  } catch (error) {
    if (error instanceof C6BoletoTransportError) throw error;
    throw new C6BoletoTransportError('NETWORK', 'Falha de transporte ao C6.');
  }
}

function httpsOnce(plan: C6BolepixV2HttpPlan, agent: https.Agent): Promise<C6BolepixV2FetchResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      plan.url,
      {
        method: plan.method,
        headers: plan.headers,
        agent,
        timeout: C6_BOLETO_HTTP_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const contentType = String(res.headers['content-type'] || '');
          const pdf = buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF';
          resolve({
            status: res.statusCode || 0,
            bodyText: pdf || /pdf/i.test(contentType) ? buf.toString('latin1') : buf.toString('utf8'),
            contentType,
          });
        });
      },
    );
    req.on('error', () => reject(new C6BoletoTransportError('NETWORK', 'Falha de transporte ao C6.')));
    req.on('timeout', () => {
      req.destroy();
      reject(new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).'));
    });
    if (plan.body) req.write(plan.body);
    req.end();
  });
}

function fromCreateResponse(
  status: number,
  bodyText: string,
  officialBody: Record<string, unknown>,
): C6BolepixV2CallResult & { body: Record<string, unknown>; responseBody: unknown } {
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  const fields = readC6BolepixV2OfficialFields(parsed);
  return {
    ok: status === 201 && Boolean(fields?.id),
    httpStatus: status,
    disposition: classifyCreate(status, Boolean(fields?.id)),
    fields,
    pdfBytes: null,
    pdfBody: null,
    responseBody: parsed,
    specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
    body: officialBody,
  };
}

export async function postC6BolepixV2Charge(params: {
  companyId: string;
  integrationId: string;
  environment: BankEnvironment;
  input: C6BolepixV2CreateInput;
  receiptId?: string;
  activationGranted?: boolean;
  allowSimulatedHttp?: boolean;
  fetchFn?: FetchFn;
  credentials?: C6AuthCredentials | null;
  requestFn?: (plan: C6BolepixV2HttpPlan) => Promise<C6BolepixV2FetchResult>;
  now?: Date;
}): Promise<C6BolepixV2CallResult & { body?: Record<string, unknown>; responseBody: unknown }> {
  if (params.allowSimulatedHttp === true && typeof params.fetchFn === 'function') {
    return executeC6BolepixV2Create({
      input: params.input,
      fetchFn: params.fetchFn,
      allowSimulatedHttp: true,
      now: params.now,
    });
  }
  if (
    params.activationGranted !== true ||
    !isC6BolepixV2LiveReceipt(params.companyId, params.integrationId, params.receiptId || '')
  ) {
    throw new C6BolepixV2LiveDisabledError();
  }
  const creds = params.credentials;
  if (!creds || creds.companyId !== params.companyId || creds.environment !== params.environment) {
    throw new C6BolepixV2LiveDisabledError();
  }
  if (creds.integrationId && creds.integrationId !== params.integrationId) {
    throw new Error('Integração de outra empresa.');
  }
  const officialBody = buildC6BolepixV2CreateBody(params.input, params.now);
  let accessToken = 'token-de-teste';
  if (!params.requestFn) {
    const token = await requestC6AccessToken(creds, {
      allowProduction: creds.environment === 'PRODUCTION',
    });
    if (!token.ok) throw new Error('Não foi possível autenticar no C6.');
    accessToken = token.accessToken;
  }
  const plan = planC6BolepixV2Request({
    companyId: params.companyId,
    integrationId: params.integrationId,
    creds,
    operation: 'create',
    accessToken,
    body: officialBody,
  });
  if (params.requestFn) {
    try {
      const response = await params.requestFn(plan);
      return fromCreateResponse(response.status, response.bodyText, officialBody);
    } catch {
      return {
        ok: false,
        httpStatus: null,
        disposition: 'uncertain',
        fields: null,
        pdfBytes: null,
        pdfBody: null,
        responseBody: null,
        specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
        body: officialBody,
      };
    }
  }
  const agent = createC6BolepixMtlsAgent(creds);
  try {
    const response = await httpsOnce(plan, agent);
    return fromCreateResponse(response.status, response.bodyText, officialBody);
  } catch {
    return {
      ok: false,
      httpStatus: null,
      disposition: 'uncertain',
      fields: null,
      pdfBytes: null,
      pdfBody: null,
      responseBody: null,
      specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
      body: officialBody,
    };
  } finally {
    agent.destroy();
  }
}

function fromGetResponse(status: number, bodyText: string): C6BolepixV2CallResult {
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  const fields = readC6BolepixV2OfficialFields(parsed);
  const ok = status === 200 && Boolean(fields);
  return {
    ok,
    httpStatus: status,
    disposition: ok ? 'succeeded' : status >= 500 ? 'uncertain' : 'rejected',
    fields,
    pdfBytes: null,
    pdfBody: null,
    responseBody: parsed,
    specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
  };
}

function fromPdfResponse(
  status: number,
  bodyText: string,
  contentType: string | null,
): C6BolepixV2CallResult {
  const type = String(contentType || '').toLowerCase();
  const official = status === 200 && type.includes('application/pdf') && bodyText.startsWith('%PDF');
  return {
    ok: official,
    httpStatus: status,
    disposition: official ? 'succeeded' : status >= 500 ? 'uncertain' : 'rejected',
    fields: null,
    pdfBytes: official ? bodyText.length : null,
    pdfBody: official ? bodyText : null,
    responseBody: null,
    specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
  };
}

export async function readC6BolepixV2Charge(params: {
  companyId: string;
  integrationId: string;
  environment: BankEnvironment;
  externalReferenceId: string;
  pdf?: boolean;
  allowSimulatedHttp?: boolean;
  fetchFn?: FetchFn;
  credentials?: C6AuthCredentials | null;
  ownedByCompany?: boolean;
  requestFn?: (
    plan: C6BolepixV2HttpPlan,
  ) => Promise<{ status: number; bodyText: string; contentType: string | null }>;
}): Promise<C6BolepixV2CallResult> {
  if (params.allowSimulatedHttp === true && typeof params.fetchFn === 'function') {
    return params.pdf
      ? executeC6BolepixV2Pdf({
          environment: params.environment,
          externalReferenceId: params.externalReferenceId,
          fetchFn: params.fetchFn,
          allowSimulatedHttp: true,
        })
      : executeC6BolepixV2Get({
          environment: params.environment,
          externalReferenceId: params.externalReferenceId,
          fetchFn: params.fetchFn,
          allowSimulatedHttp: true,
        });
  }
  if (params.ownedByCompany !== true) {
    throw new Error('Consulta Bolepix só da cobrança desta empresa.');
  }
  const creds = params.credentials;
  if (!creds) throw new Error('Credenciais C6 ausentes para esta empresa.');
  if (creds.companyId !== params.companyId || creds.environment !== params.environment) {
    throw new Error('Integração de outra empresa.');
  }
  if (creds.integrationId && creds.integrationId !== params.integrationId) {
    throw new Error('Integração de outra empresa.');
  }
  const accessToken = params.requestFn
    ? 'token-de-teste'
    : await (async () => {
        const token = await requestC6AccessToken(creds, {
          allowProduction: creds.environment === 'PRODUCTION',
        });
        if (!token.ok) throw new Error('Não foi possível autenticar no C6.');
        return token.accessToken;
      })();
  const plan = planC6BolepixV2Request({
    companyId: params.companyId,
    integrationId: params.integrationId,
    creds,
    operation: params.pdf ? 'pdf' : 'get',
    accessToken,
    externalReferenceId: params.externalReferenceId,
  });
  const response = params.requestFn
    ? await params.requestFn(plan)
    : await (async () => {
        const agent = createC6BolepixMtlsAgent(creds);
        try {
          return await httpsOnce(plan, agent);
        } finally {
          agent.destroy();
        }
      })();
  return params.pdf
    ? fromPdfResponse(response.status, response.bodyText, response.contentType)
    : fromGetResponse(response.status, response.bodyText);
}
