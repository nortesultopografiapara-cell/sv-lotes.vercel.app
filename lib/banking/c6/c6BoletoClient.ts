/**
 * Cliente C6 Boleto bancário (OpenAPI 1.7.2).
 * Prepara POST/GET/PUT /v1/bank_slips/. HTTP real permanece bloqueado.
 */

import https from 'node:https';
import type { BankEnvironment } from '@/lib/banking/types';
import type { C6AuthCredentials, C6AuthFetchFn } from '@/lib/banking/c6/c6AuthClient';
import { requestC6AccessToken } from '@/lib/banking/c6/c6AuthClient';
import {
  C6_BOLETO_OPERATIONS,
  C6_BOLETO_PARTNER_SOFTWARE_NAME,
  C6_BOLETO_PARTNER_SOFTWARE_VERSION,
  C6_BOLETO_PDF_ACCEPT,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import {
  buildC6BankSlipCancelUrl,
  buildC6BankSlipEmitUrl,
  buildC6BankSlipPdfUrl,
  buildC6BankSlipResourceUrl,
  getC6BankSlipsHost,
} from '@/lib/banking/c6/c6BoletoEndpoints';
import {
  buildC6WebhookConsultUrl,
  buildC6WebhookRegisterUrl,
  getC6WebhooksHost,
  redactC6WebhookUrl,
} from '@/lib/banking/c6/c6WebhookEndpoints';
import {
  C6_NOTIFICATIONS_REGISTER_METHOD,
  C6_NOTIFICATIONS_SERVICE,
  type C6WebhookRegisterBody,
} from '@/lib/banking/c6/c6NotificationsOpenApi';
import {
  evidenceFromPreparedC6Boleto,
  inspectC6BoletoPdfPayload,
  isC6BoletoPdfPayloadValid,
  type C6BoletoEvidencePublic,
} from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
import type {
  C6BankSlipAlterRequest,
  C6BoletoCreateInput,
  C6BoletoPreparedHttp,
} from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoEvidenceCase } from '@/lib/banking/c6/c6BoletoHomologCatalog';
import {
  assertC6BankSlipId,
  assertC6CompanyIsolation,
  buildC6BankSlipAlterBody,
  buildC6BankSlipCreateBody,
  C6BoletoCompanyIsolationError,
  C6BoletoValidationError,
} from '@/lib/banking/c6/c6BoletoValidation';
import { isC6HomologProtectedBankSlipId } from '@/lib/banking/c6/c6BoletoHomologIssuedIds';

export type C6BoletoFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    agent: https.Agent;
  },
) => Promise<{ status: number; bodyText: string; contentType?: string; pdfMagic?: boolean }>;

export type C6BoletoExecuteOptions = {
  /** Somente testes com resposta simulada. Não autoriza C6 real. */
  allowSimulatedHttp?: boolean;
  fetchFn?: C6BoletoFetchFn;
  authFetchFn?: C6AuthFetchFn;
  accessToken?: string;
  now?: Date;
  testCase?: C6BoletoEvidenceCase;
  /**
   * HTTP Sandbox real. Exige ambiente SANDBOX, flag live e allowSandboxLive.
   * Não libera Production nem emissão comercial (Asaas/Inter/vendas).
   */
  allowSandboxLive?: boolean;
};

const JSON_CONTENT_TYPE = 'application/json';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
export const C6_BOLETO_HTTP_TIMEOUT_MS = 15_000;

export class C6BoletoTransportError extends Error {
  readonly code: 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED';

  constructor(code: 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED', message: string) {
    super(message);
    this.name = 'C6BoletoTransportError';
    this.code = code;
  }
}

function pathFromUrl(url: string, host: string): string {
  const prefix = `https://${host}`;
  if (url.startsWith(prefix)) return url.slice(prefix.length) || '/';
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function partnerHeaders(): Record<string, string> {
  return {
    'partner-software-name': C6_BOLETO_PARTNER_SOFTWARE_NAME,
    'partner-software-version': C6_BOLETO_PARTNER_SOFTWARE_VERSION,
  };
}

function withAuthHeaders(
  extra: Record<string, string>,
  accessToken?: string,
): Record<string, string> {
  const headers = { ...partnerHeaders(), ...extra };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

/** GET sem body não envia Content-Type — Node https também não deve inferir um. */
export function sanitizeC6BoletoGetHeaders(
  headers: Record<string, string>,
  method: string,
  body?: string | null,
): Record<string, string> {
  const out = { ...headers };
  if (String(method || '').toUpperCase() !== 'GET' || body) return out;
  for (const key of Object.keys(out)) {
    if (key.toLowerCase() === 'content-type') delete out[key];
  }
  return out;
}

export function prepareC6BankSlipCreate(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  input: C6BoletoCreateInput,
  options?: { now?: Date; accessToken?: string },
): C6BoletoPreparedHttp {
  assertC6CompanyIsolation(creds.companyId, input.companyId);
  if (creds.environment !== input.environment) {
    throw new C6BoletoValidationError('environment da credencial diverge do payload.', ['environment']);
  }
  const body = buildC6BankSlipCreateBody(input, options?.now);
  const url = buildC6BankSlipEmitUrl(creds.environment);
  const host = getC6BankSlipsHost(creds.environment);
  return {
    companyId: creds.companyId,
    environment: creds.environment,
    operation: 'emit',
    method: C6_BOLETO_OPERATIONS.emit.method,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: withAuthHeaders({ 'Content-Type': JSON_CONTENT_TYPE, Accept: JSON_CONTENT_TYPE }, options?.accessToken),
    body: JSON.stringify(body),
    jsonBody: body as unknown as Record<string, unknown>,
    billingScheme: body.billing_scheme || null,
  };
}

export function prepareC6BankSlipGet(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  bankSlipId: string,
  options?: { accessToken?: string },
): C6BoletoPreparedHttp {
  if (!String(creds.companyId || '').trim()) {
    throw new C6BoletoCompanyIsolationError('companyId C6 obrigatório para isolamento multiempresa.');
  }
  const id = assertC6BankSlipId(bankSlipId);
  const url = buildC6BankSlipResourceUrl(creds.environment, id);
  const host = getC6BankSlipsHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'get',
    method: C6_BOLETO_OPERATIONS.get.method,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: withAuthHeaders({ 'Content-Type': FORM_CONTENT_TYPE, Accept: JSON_CONTENT_TYPE }, options?.accessToken),
    body: null,
    jsonBody: null,
    billingScheme: null,
  };
}

export function prepareC6BankSlipAlter(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  bankSlipId: string,
  patch: C6BankSlipAlterRequest,
  options?: { now?: Date; accessToken?: string },
): C6BoletoPreparedHttp {
  const id = assertC6BankSlipId(bankSlipId);
  if (isC6HomologProtectedBankSlipId(id)) {
    throw new C6BoletoValidationError(
      'Boletos B_01, B_02 e B_03 estão protegidos contra alteração e cancelamento.',
      ['id'],
    );
  }
  const body = buildC6BankSlipAlterBody(patch, options?.now);
  const url = buildC6BankSlipResourceUrl(creds.environment, id);
  const host = getC6BankSlipsHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'alter',
    method: C6_BOLETO_OPERATIONS.alter.method,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: withAuthHeaders({ 'Content-Type': JSON_CONTENT_TYPE, Accept: JSON_CONTENT_TYPE }, options?.accessToken),
    body: JSON.stringify(body),
    jsonBody: body as unknown as Record<string, unknown>,
    billingScheme: null,
  };
}

export function prepareC6BankSlipPdf(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  bankSlipId: string,
  options?: { accessToken?: string },
): C6BoletoPreparedHttp {
  const id = assertC6BankSlipId(bankSlipId);
  const url = buildC6BankSlipPdfUrl(creds.environment, id);
  const host = getC6BankSlipsHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'pdf',
    method: C6_BOLETO_OPERATIONS.pdf.method,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: sanitizeC6BoletoGetHeaders(
      withAuthHeaders({ Accept: C6_BOLETO_PDF_ACCEPT }, options?.accessToken),
      C6_BOLETO_OPERATIONS.pdf.method,
      null,
    ),
    body: null,
    jsonBody: null,
    billingScheme: null,
  };
}

export function prepareC6BankSlipCancel(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  bankSlipId: string,
  options?: { accessToken?: string },
): C6BoletoPreparedHttp {
  const id = assertC6BankSlipId(bankSlipId);
  if (isC6HomologProtectedBankSlipId(id)) {
    throw new C6BoletoValidationError(
      'Boletos B_01, B_02 e B_03 estão protegidos contra alteração e cancelamento.',
      ['id'],
    );
  }
  const url = buildC6BankSlipCancelUrl(creds.environment, id);
  const host = getC6BankSlipsHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'cancel',
    method: C6_BOLETO_OPERATIONS.cancel.method,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: withAuthHeaders({ 'Content-Type': FORM_CONTENT_TYPE, Accept: JSON_CONTENT_TYPE }, options?.accessToken),
    body: null,
    jsonBody: null,
    billingScheme: null,
  };
}

export function prepareC6WebhookRegister(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  input: C6WebhookRegisterBody,
  options?: { accessToken?: string },
): C6BoletoPreparedHttp {
  if (!String(creds.companyId || '').trim()) {
    throw new C6BoletoCompanyIsolationError('companyId C6 obrigatório para isolamento multiempresa.');
  }
  const callbackUrl = String(input.url || '').trim();
  if (!callbackUrl.startsWith('https://')) {
    throw new C6BoletoValidationError('Webhook C6 exige URL HTTPS.', ['url']);
  }
  const service = String(input.service || '').trim();
  if (service !== C6_NOTIFICATIONS_SERVICE) {
    throw new C6BoletoValidationError('B_07 cadastra somente service BANK_SLIP.', ['service']);
  }
  const body: C6WebhookRegisterBody = { url: callbackUrl, service: C6_NOTIFICATIONS_SERVICE };
  const url = buildC6WebhookRegisterUrl(creds.environment);
  const host = getC6WebhooksHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'webhook',
    method: C6_NOTIFICATIONS_REGISTER_METHOD,
    url,
    host,
    path: pathFromUrl(url, host),
    headers: withAuthHeaders(
      { 'Content-Type': JSON_CONTENT_TYPE, Accept: JSON_CONTENT_TYPE },
      options?.accessToken,
    ),
    body: JSON.stringify(body),
    jsonBody: {
      url: redactC6WebhookUrl(callbackUrl),
      service: body.service,
    },
    billingScheme: null,
  };
}

export function prepareC6WebhookConsult(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment'>,
  options?: { accessToken?: string },
): C6BoletoPreparedHttp {
  if (!String(creds.companyId || '').trim()) {
    throw new C6BoletoCompanyIsolationError('companyId C6 obrigatório para isolamento multiempresa.');
  }
  const url = buildC6WebhookConsultUrl(creds.environment);
  const host = getC6WebhooksHost(creds.environment);
  return {
    companyId: String(creds.companyId || '').trim(),
    environment: creds.environment,
    operation: 'webhook',
    method: 'GET',
    url,
    host,
    path: pathFromUrl(url, host),
    headers: sanitizeC6BoletoGetHeaders(
      withAuthHeaders({ Accept: JSON_CONTENT_TYPE }, options?.accessToken),
      'GET',
      null,
    ),
    body: null,
    jsonBody: null,
    billingScheme: null,
  };
}

function isC6SandboxLiveExecute(
  environment: BankEnvironment,
  options?: C6BoletoExecuteOptions,
): boolean {
  return (
    environment === 'SANDBOX' &&
    options?.allowSandboxLive === true &&
    isC6BoletoSandboxLiveAuthorized(environment)
  );
}

function assertExecuteGate(
  environment: BankEnvironment,
  options?: C6BoletoExecuteOptions,
): void {
  if (environment === 'PRODUCTION') {
    throw new C6EmissionNotHomologatedError();
  }
  const simulated = options?.allowSimulatedHttp === true && typeof options.fetchFn === 'function';
  if (simulated) return;
  if (isC6SandboxLiveExecute(environment, options)) return;
  throwIfC6EmissionAttempt('C6');
}

const defaultBoletoFetch: C6BoletoFetchFn = async (url, init) => {
  const { statusCode, body, contentType, pdfMagic } = await new Promise<{
    statusCode: number;
    body: string;
    contentType: string;
    pdfMagic: boolean;
  }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method,
        headers: init.headers,
        agent: init.agent,
        timeout: C6_BOLETO_HTTP_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const type = String(res.headers['content-type'] || '');
          const pdfMagic = buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF';
          const looksPdf = /pdf/i.test(type) || pdfMagic;
          const looksBinary = /octet-stream/i.test(type);
          resolve({
            statusCode: res.statusCode || 0,
            body:
              looksPdf || looksBinary
                ? `[pdf-bytes:${buf.length}]`
                : buf.toString('utf8'),
            contentType: type,
            pdfMagic,
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).'));
    });
    if (init.body) req.write(init.body);
    req.end();
  });
  return { status: statusCode, bodyText: body, contentType, pdfMagic };
};

async function resolveAccessToken(
  creds: C6AuthCredentials,
  options?: C6BoletoExecuteOptions,
): Promise<string> {
  const provided = String(options?.accessToken || '').trim();
  if (provided) return provided;
  const oauth = await requestC6AccessToken(creds, {
    fetchFn: options?.authFetchFn,
    allowProduction: false,
  });
  if (!oauth.ok) {
    throw new C6BoletoValidationError(oauth.message, ['authorization']);
  }
  return oauth.accessToken;
}

export type C6BoletoExecuteResult = {
  ok: boolean;
  evidence: C6BoletoEvidencePublic;
  httpStatus: number | null;
  prepared: C6BoletoPreparedHttp;
};

async function executePrepared(
  creds: C6AuthCredentials,
  prepared: C6BoletoPreparedHttp,
  options: C6BoletoExecuteOptions | undefined,
  testCase: C6BoletoEvidenceCase,
): Promise<C6BoletoExecuteResult> {
  assertC6CompanyIsolation(creds.companyId, prepared.companyId);
  assertExecuteGate(creds.environment, options);

  const accessToken = await resolveAccessToken(creds, options);
  const headers =
    prepared.operation === 'pdf'
      ? sanitizeC6BoletoGetHeaders(
          { ...prepared.headers, Authorization: `Bearer ${accessToken}` },
          prepared.method,
          prepared.body,
        )
      : { ...prepared.headers, Authorization: `Bearer ${accessToken}` };
  const fetchFn = options?.fetchFn || defaultBoletoFetch;

  if (!options?.fetchFn) {
    if (!isC6BoletoSandboxLiveAuthorized(creds.environment) || options?.allowSandboxLive !== true) {
      throw new C6EmissionNotHomologatedError();
    }
  }

  let agent: https.Agent;
  try {
    agent = new https.Agent({
      cert: creds.certificatePem,
      key: creds.privateKeyPem,
      rejectUnauthorized: true,
      keepAlive: false,
    });
  } catch {
    throw new C6EmissionNotHomologatedError();
  }

  try {
    const res = await fetchFn(prepared.url, {
      method: prepared.method,
      headers,
      body: prepared.body || undefined,
      agent,
    });

    const expected = C6_BOLETO_OPERATIONS[prepared.operation].successStatus;
    const pdfInspect =
      prepared.operation === 'pdf'
        ? inspectC6BoletoPdfPayload({
            bodyText: res.bodyText,
            contentType: res.contentType,
            httpStatus: res.status,
            pdfMagic: res.pdfMagic,
          })
        : null;
    const pdfOk = prepared.operation !== 'pdf' || isC6BoletoPdfPayloadValid(pdfInspect);
    const ok = res.status === expected && pdfOk;
    const liveHttp = isC6SandboxLiveExecute(creds.environment, options) && !options?.fetchFn;
    const message = !pdfOk && res.status === expected
      ? 'HTTP 200 sem PDF válido (%PDF-).'
      : ok
        ? liveHttp
          ? 'Boleto C6 Sandbox emitido.'
          : 'Resposta simulada do boleto C6. Status efetivo registrado sem forçar divergências do roteiro.'
        : `C6 retornou HTTP ${res.status}. Status efetivo registrado.`;
    const evidence = evidenceFromPreparedC6Boleto(
      { ...prepared, headers: { ...headers, Authorization: 'Bearer [redacted]' } },
      {
        testCase,
        success: ok,
        blocked: false,
        executed: true,
        httpStatus: res.status,
        responseText: res.bodyText,
        contentType: res.contentType,
        pdfMagic: res.pdfMagic,
        message,
      },
    );

    return { ok, evidence, httpStatus: res.status, prepared };
  } catch (err) {
    const timeout = err instanceof C6BoletoTransportError && err.code === 'TIMEOUT';
    const evidence = evidenceFromPreparedC6Boleto(prepared, {
      testCase: timeout ? 'INT_TIMEOUT' : 'INT_UNEXPECTED_BODY',
      success: false,
      blocked: false,
      executed: true,
      httpStatus: null,
      message: err instanceof Error ? err.message : 'Falha de transporte ao C6.',
    });
    return { ok: false, evidence, httpStatus: null, prepared };
  }
}

export async function executeC6BankSlipCreate(
  creds: C6AuthCredentials,
  input: C6BoletoCreateInput,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6BankSlipCreate(creds, input, { now: options?.now });
  return executePrepared(creds, prepared, options, options?.testCase || 'B_01');
}

export async function executeC6BankSlipGet(
  creds: C6AuthCredentials,
  bankSlipId: string,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6BankSlipGet(creds, bankSlipId);
  return executePrepared(creds, prepared, options, options?.testCase || 'B_05');
}

export async function executeC6BankSlipAlter(
  creds: C6AuthCredentials,
  bankSlipId: string,
  patch: C6BankSlipAlterRequest,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6BankSlipAlter(creds, bankSlipId, patch, { now: options?.now });
  return executePrepared(creds, prepared, options, options?.testCase || 'B_04');
}

export async function executeC6BankSlipPdf(
  creds: C6AuthCredentials,
  bankSlipId: string,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6BankSlipPdf(creds, bankSlipId);
  return executePrepared(creds, prepared, options, options?.testCase || 'B_06');
}

export async function executeC6BankSlipCancel(
  creds: C6AuthCredentials,
  bankSlipId: string,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6BankSlipCancel(creds, bankSlipId);
  return executePrepared(creds, prepared, options, options?.testCase || 'B_08');
}

export async function executeC6WebhookRegister(
  creds: C6AuthCredentials,
  input: C6WebhookRegisterBody,
  options?: C6BoletoExecuteOptions,
): Promise<C6BoletoExecuteResult> {
  const prepared = prepareC6WebhookRegister(creds, input, { accessToken: options?.accessToken });
  return executePrepared(creds, prepared, options, options?.testCase || 'B_07');
}

export function capturePreparedC6BoletoEvidence(
  prepared: C6BoletoPreparedHttp,
  extras: {
    testCase: C6BoletoEvidenceCase;
    message?: string;
  },
): C6BoletoEvidencePublic {
  return evidenceFromPreparedC6Boleto(prepared, {
    testCase: extras.testCase,
    success: false,
    blocked: true,
    executed: false,
    httpStatus: null,
    message: extras.message || C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
}

export { C6_EMIT_NOT_HOMOLOGATED_MESSAGE };
