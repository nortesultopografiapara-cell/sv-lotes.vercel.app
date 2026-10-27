/**
 * Catálogo oficial B_01–B_08 — Roteiro C6 Developers v3.0.
 * Fonte Word: docs/c6/Roteiro de Testes - C6 Developers v3.0 (3).docx
 * OpenAPI: docs/c6/boleto-bancario.json (1.7.2).
 * Colunas de resultado real permanecem vazias até execução autorizada.
 */

import type { C6BoletoHomologCase } from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoOperation } from '@/lib/banking/c6/c6BoletoOpenApi';

export const C6_HOMOLOG_ROTEIRO_FILE =
  'docs/c6/Roteiro de Testes - C6 Developers v3.0 (3).docx';

export const C6_HOMOLOG_ROTEIRO_REQUESTED_FILE =
  'Roteiro de Testes - C6 Developers v3.0(4).docx';

export type C6BoletoInternalCase =
  | 'INT_VALIDATION'
  | 'INT_AUTH_HTTP_401'
  | 'INT_ISOLATION'
  | 'INT_TIMEOUT'
  | 'INT_UNEXPECTED_BODY'
  | 'INT_DUPLICATE_REFERENCE';

export type C6BoletoEvidenceCase = C6BoletoHomologCase | C6BoletoInternalCase;

export type C6HomologCatalogRow = {
  id: C6BoletoHomologCase;
  title: string;
  operation: C6BoletoOperation | 'webhook';
  method: 'GET' | 'POST' | 'PUT';
  endpoint: string;
  requiredFields: string[];
  roteiroExpectedStatus: number;
  openapiExpectedStatus: number | null;
  evidenceRequired: string;
  notes: string[];
  returnedStatus: null;
  returnedBody: null;
  readyToExecute: boolean;
};

export const C6_BOLETO_HOMOLOG_CASES: Record<C6BoletoHomologCase, C6HomologCatalogRow> = {
  B_01: {
    id: 'B_01',
    title: 'Emissão de boleto simples',
    operation: 'emit',
    method: 'POST',
    endpoint: '/v1/bank_slips/',
    requiredFields: ['external_reference_id', 'amount', 'due_date', 'payer'],
    roteiroExpectedStatus: 201,
    openapiExpectedStatus: 201,
    evidenceRequired: 'HTTP status e response body sanitizado (id, amount, due_date, billing_scheme, bar_code, digitable_line). Sem token, PEM ou tax_id completo.',
    notes: [
      'Somente campos obrigatórios. Sem juros, multa ou desconto.',
      'Carteira via billing_scheme: 21 Sandbox / 15 Production.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_02: {
    id: 'B_02',
    title: 'Emissão de boleto com juros e multa variáveis',
    operation: 'emit',
    method: 'POST',
    endpoint: '/v1/bank_slips/',
    requiredFields: ['external_reference_id', 'amount', 'due_date', 'payer', 'interest', 'fine'],
    roteiroExpectedStatus: 201,
    openapiExpectedStatus: 201,
    evidenceRequired: 'HTTP status e body sanitizado, incluindo interest e fine retornados.',
    notes: [
      'Roteiro: valor, vencimento, percentual ou valor de juros por dia, percentual ou valor de multa.',
      'OpenAPI 1.7.2: interest/fine com type V|P, value e dead_line. V = valor; P = percentual.',
      'Referência preparada B02S261027. Não executar POST nesta etapa.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_03: {
    id: 'B_03',
    title: 'Emissão de boleto com desconto',
    operation: 'emit',
    method: 'POST',
    endpoint: '/v1/bank_slips/',
    requiredFields: ['external_reference_id', 'amount', 'due_date', 'payer', 'discount'],
    roteiroExpectedStatus: 201,
    openapiExpectedStatus: 201,
    evidenceRequired: 'HTTP status e body sanitizado, incluindo discount retornado.',
    notes: [
      'OpenAPI 1.7.2: discount.discount_type V|P; first/second/third com value e dead_line (dias antes do vencimento, decrescente).',
      'Referência preparada B03S261027. Valor 300, desconto V R$ 15, dead_line 5 (limite 2026-11-20), vencimento 2026-11-25.',
      'Não reutiliza B01S261027 nem B02S261027. Não executar POST nesta etapa.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_04: {
    id: 'B_04',
    title: 'Alteração de dados do boleto',
    operation: 'alter',
    method: 'PUT',
    endpoint: '/v1/bank_slips/{id}',
    requiredFields: ['id', 'ao menos um de: amount, due_date, discount, interest, fine'],
    roteiroExpectedStatus: 200,
    openapiExpectedStatus: 200,
    evidenceRequired: 'HTTP status e body sanitizado do boleto alterado.',
    notes: [
      'Roteiro cita alteração de dados do pagador; OpenAPI 1.7.2 (bank_slip_alter_request) não inclui payer.',
      'Campos permitidos no PUT: amount, due_date, discount, interest, fine. B_04 autorizado altera só due_date 2026-12-01 → 2026-12-10.',
      'Não altera B_01/B_02/B_03. Boleto exclusivo B04S261027 (origem) / B04A261027 (alteração).',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_05: {
    id: 'B_05',
    title: 'Consulta de boleto',
    operation: 'get',
    method: 'GET',
    endpoint: '/v1/bank_slips/{id}',
    requiredFields: ['id'],
    roteiroExpectedStatus: 200,
    openapiExpectedStatus: 200,
    evidenceRequired: 'HTTP status e body sanitizado (status, amount, due_date). Payer mascarado.',
    notes: [
      'Reutiliza o id do B_01 01M5YPX04ZB8H14XAPJDA8MRV8. GET não emite.',
      'Escopo bankslip.read. URL Sandbox GET /v1/bank_slips/{id}.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_06: {
    id: 'B_06',
    title: 'Geração do PDF do boleto',
    operation: 'pdf',
    method: 'GET',
    endpoint: '/v1/bank_slips/{id}/pdf',
    requiredFields: ['id'],
    roteiroExpectedStatus: 200,
    openapiExpectedStatus: 200,
    evidenceRequired: 'HTTP status, content-type e tamanho do PDF. Sem Base64 completo.',
    notes: [
      'HTTP 406 em B06S261027 com Accept application/pdf. Próxima tentativa: B06R261027, Accept application/json, sem Content-Type no GET sem body.',
      'OpenAPI 1.7.2 documenta base64_pdf_file no JSON; GET /pdf 200 não declara application/pdf.',
      'Reutiliza o id do B_01 01M5YPX04ZB8H14XAPJDA8MRV8. GET PDF não emite. Escopo bankslip.read.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_07: {
    id: 'B_07',
    title: 'Cadastro do webhook de boleto',
    operation: 'webhook',
    method: 'POST',
    endpoint: '/webhooks/',
    requiredFields: ['url', 'service'],
    roteiroExpectedStatus: 200,
    openapiExpectedStatus: null,
    evidenceRequired: 'HTTP status e body sanitizado do cadastro. Sem URL interna sensível se houver segredo.',
    notes: [
      'Roteiro: body url + service="BANK_SLIP" na API de notificações.',
      'OpenAPI de boleto 1.7.2 não descreve /webhooks/. Falta o OpenAPI oficial de notificações.',
      'Não implementar payload, headers ou host por suposição.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
  B_08: {
    id: 'B_08',
    title: 'Baixa/cancelamento de boleto emitido',
    operation: 'cancel',
    method: 'PUT',
    endpoint: '/v1/bank_slips/{id}/cancel',
    requiredFields: ['id'],
    roteiroExpectedStatus: 200,
    openapiExpectedStatus: 204,
    evidenceRequired: 'HTTP status efetivamente retornado pelo C6 e body (se houver). Não forçar 200 nem 204.',
    notes: [
      'Divergência: roteiro espera 200; OpenAPI 1.7.2 declara 204.',
      'Registrar o status real na execução autorizada. Não inventar resultado.',
    ],
    returnedStatus: null,
    returnedBody: null,
    readyToExecute: false,
  },
};

export const C6_BOLETO_INTERNAL_CASES: Record<C6BoletoInternalCase, string> = {
  INT_VALIDATION: 'Validação local (CPF/CNPJ, endereço, vencimento, carteira). Não é cenário oficial.',
  INT_AUTH_HTTP_401: 'Falha de autenticação/autorização HTTP 401 simulada. Não é cenário oficial.',
  INT_ISOLATION: 'Isolamento multiempresa. Não é cenário oficial.',
  INT_TIMEOUT: 'Timeout de transporte até o C6. Não é cenário oficial.',
  INT_UNEXPECTED_BODY: 'Resposta inesperada/não JSON. Não é cenário oficial.',
  INT_DUPLICATE_REFERENCE: 'Reenvio acidental do mesmo external_reference_id. Não é cenário oficial.',
};

export function isC6BoletoHomologCase(value: string): value is C6BoletoHomologCase {
  return Object.prototype.hasOwnProperty.call(C6_BOLETO_HOMOLOG_CASES, value);
}

export function isC6BoletoInternalCase(value: string): value is C6BoletoInternalCase {
  return Object.prototype.hasOwnProperty.call(C6_BOLETO_INTERNAL_CASES, value);
}

export function getC6HomologCatalogRow(id: C6BoletoHomologCase): C6HomologCatalogRow {
  return C6_BOLETO_HOMOLOG_CASES[id];
}
