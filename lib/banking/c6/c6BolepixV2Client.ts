/**
 * Cliente Bolepix v2. Chamada real bloqueada por C6_BOLEPIX_V2_LIVE_CALLS_ENABLED.
 * Consulta e PDF usam a referência externa de 26 caracteres, não o id interno.
 */

import {
  C6_BOLEPIX_V2_LIVE_CALLS_ENABLED,
  C6_BOLEPIX_V2_SPEC_VERSION,
  C6_BOLEPIX_V2_URL,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';
import {
  assertC6BolepixV2Reference,
  buildC6BolepixV2CreateBody,
  type C6BolepixV2CreateInput,
} from '@/lib/banking/c6/c6BolepixV2Validation';
import type { BankEnvironment } from '@/lib/banking/types';

export class C6BolepixV2LiveDisabledError extends Error {
  constructor() {
    super('A emissão Bolepix v2 está desligada. Nenhuma chamada real ao C6 foi feita.');
    this.name = 'C6BolepixV2LiveDisabledError';
  }
}

export type C6BolepixV2FetchResult = {
  status: number;
  bodyText: string;
  contentType?: string | null;
};

export type C6BolepixV2OfficialFields = {
  id: string | null;
  externalReferenceId: string | null;
  status: string | null;
  billingScheme: string | null;
  billingType: string | null;
  digitableLine: string | null;
  barCode: string | null;
  ourNumber: string | null;
  pixCopyPaste: string | null;
  pixQrImagePresent: boolean;
  amount: number | null;
  dueDate: string | null;
};

export type C6BolepixV2CallResult = {
  ok: boolean;
  httpStatus: number | null;
  disposition: 'succeeded' | 'rejected' | 'uncertain';
  fields: C6BolepixV2OfficialFields | null;
  pdfBytes: number | null;
  pdfBody: string | null;
  responseBody: unknown;
  specVersion: typeof C6_BOLEPIX_V2_SPEC_VERSION;
};

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<C6BolepixV2FetchResult>;

function baseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_BOLEPIX_V2_URL.PRODUCTION : C6_BOLEPIX_V2_URL.SANDBOX;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readC6BolepixV2OfficialFields(body: unknown): C6BolepixV2OfficialFields | null {
  const row = asRecord(body);
  if (!row) return null;
  const payment = asRecord(row.payment_method);
  const slip = asRecord(payment?.bank_slip);
  const pix = asRecord(payment?.pix);
  const line = slip?.digitable_line != null ? String(slip.digitable_line) : null;
  const barCode = slip?.bar_code != null ? String(slip.bar_code) : null;
  const ourNumber = slip?.our_number != null ? String(slip.our_number) : null;
  const qr = pix?.qr_code != null ? String(pix.qr_code).trim() : '';
  return {
    id: row.id != null ? String(row.id) : null,
    externalReferenceId: row.external_reference_id != null ? String(row.external_reference_id) : null,
    status: row.status != null ? String(row.status).toUpperCase() : null,
    billingScheme: slip?.billing_scheme != null ? String(slip.billing_scheme) : null,
    billingType: slip?.billing_type != null ? String(slip.billing_type) : null,
    digitableLine: line,
    barCode,
    ourNumber,
    pixCopyPaste: qr || null,
    pixQrImagePresent: Boolean(pix?.image_content),
    amount: row.amount != null ? Number(row.amount) : null,
    dueDate: row.due_date != null ? String(row.due_date) : null,
  };
}

function classify(status: number, fields: C6BolepixV2OfficialFields | null): C6BolepixV2CallResult['disposition'] {
  if (status === 201 && fields?.id) return 'succeeded';
  if (status >= 400 && status < 500 && !fields?.id) return 'rejected';
  return 'uncertain';
}

async function execute(
  fetchFn: FetchFn | undefined,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  simulated: boolean,
): Promise<C6BolepixV2FetchResult> {
  if (!C6_BOLEPIX_V2_LIVE_CALLS_ENABLED) {
    if (simulated && typeof fetchFn === 'function') return fetchFn(url, init);
    throw new C6BolepixV2LiveDisabledError();
  }
  if (typeof fetchFn !== 'function') throw new C6BolepixV2LiveDisabledError();
  return fetchFn(url, init);
}

export async function executeC6BolepixV2Create(params: {
  input: C6BolepixV2CreateInput;
  fetchFn?: FetchFn;
  allowSimulatedHttp?: boolean;
  now?: Date;
}): Promise<C6BolepixV2CallResult & { body: Record<string, unknown>; responseBody: unknown }> {
  const body = buildC6BolepixV2CreateBody(params.input, params.now);
  const url = baseUrl(params.input.environment);
  if (!url.includes('/v2/bank_slips/')) {
    throw new Error('O Bolepix só pode ser enviado ao endpoint oficial v2.');
  }
  try {
    const response = await execute(
      params.fetchFn,
      url,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      params.allowSimulatedHttp === true,
    );
    const parsed = response.bodyText ? JSON.parse(response.bodyText) : null;
    const fields = readC6BolepixV2OfficialFields(parsed);
    return {
      ok: response.status === 201 && Boolean(fields?.id),
      httpStatus: response.status,
      disposition: classify(response.status, fields),
      fields,
      pdfBytes: null,
      pdfBody: null,
      specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
      body,
      responseBody: parsed,
    };
  } catch (error) {
    if (error instanceof C6BolepixV2LiveDisabledError) throw error;
    return {
      ok: false,
      httpStatus: null,
      disposition: 'uncertain',
      fields: null,
      pdfBytes: null,
      pdfBody: null,
      specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
      body,
      responseBody: null,
    };
  }
}

export async function executeC6BolepixV2Get(params: {
  environment: BankEnvironment;
  externalReferenceId: string;
  fetchFn?: FetchFn;
  allowSimulatedHttp?: boolean;
}): Promise<C6BolepixV2CallResult> {
  const reference = assertC6BolepixV2Reference(params.externalReferenceId);
  const url = `${baseUrl(params.environment)}${encodeURIComponent(reference)}`;
  const response = await execute(
    params.fetchFn,
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    params.allowSimulatedHttp === true,
  );
  const parsed = response.bodyText ? JSON.parse(response.bodyText) : null;
  const fields = readC6BolepixV2OfficialFields(parsed);
  return {
    ok: response.status === 200 && Boolean(fields),
    httpStatus: response.status,
    disposition: response.status === 200 && fields ? 'succeeded' : response.status >= 500 ? 'uncertain' : 'rejected',
    fields,
    pdfBytes: null,
    pdfBody: null,
    responseBody: parsed,
    specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
  };
}

export async function executeC6BolepixV2Pdf(params: {
  environment: BankEnvironment;
  externalReferenceId: string;
  fetchFn?: FetchFn;
  allowSimulatedHttp?: boolean;
}): Promise<C6BolepixV2CallResult> {
  const reference = assertC6BolepixV2Reference(params.externalReferenceId);
  const url = `${baseUrl(params.environment)}${encodeURIComponent(reference)}/pdf`;
  const response = await execute(
    params.fetchFn,
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/pdf' },
    },
    params.allowSimulatedHttp === true,
  );
  const contentType = String(response.contentType || '').toLowerCase();
  const pdf =
    response.status === 200 &&
    contentType.includes('application/pdf') &&
    response.bodyText.startsWith('%PDF');
  return {
    ok: pdf,
    httpStatus: response.status,
    disposition: pdf ? 'succeeded' : response.status >= 500 ? 'uncertain' : 'rejected',
    fields: null,
    pdfBytes: pdf ? response.bodyText.length : null,
    pdfBody: pdf ? response.bodyText : null,
    responseBody: null,
    specVersion: C6_BOLEPIX_V2_SPEC_VERSION,
  };
}
