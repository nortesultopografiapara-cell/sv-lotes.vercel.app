/**
 * Preparação (não execução) do B_04 Sandbox — boleto exclusivo + PUT due_date.
 * Não chama C6. Não reserva. Não emite. Não altera.
 *
 * npx tsx scripts/develop/c6-homolog-b04-sandbox-ready.ts
 */
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import { C6_BOLETO_EXTERNAL_REFERENCE_PATTERN } from '../../lib/banking/c6/c6BoletoOpenApi';
import {
  buildC6BankSlipAlterBody,
  buildC6BankSlipCreateBody,
} from '../../lib/banking/c6/c6BoletoValidation';
import {
  C6_B01_SANDBOX_COMPANY_ID,
  C6_B01_SANDBOX_INTEGRATION_ID,
  C6_B01_SANDBOX_PREPARED_REF,
  C6_B01_SANDBOX_TEST_PAYER,
} from './c6-homolog-b01-sandbox-ready';
import { C6_B02_SANDBOX_PREPARED_REF } from './c6-homolog-b02-sandbox-ready';
import { C6_B03_SANDBOX_PREPARED_REF } from './c6-homolog-b03-sandbox-ready';
import {
  C6_B04_ALTER_CONFIRMATION_PHRASE,
  C6_B04_ALTER_REF,
  C6_B04_SOURCE_CONFIRMATION_PHRASE,
  C6_B04_SOURCE_REF,
  buildC6HomologB04AlterPatch,
  buildC6HomologB04SourcePayload,
} from '../../lib/banking/c6/c6BoletoHomologB04';
import {
  C6_HOMOLOG_B01_BANK_SLIP_ID,
  C6_HOMOLOG_B02_BANK_SLIP_ID,
  C6_HOMOLOG_B03_BANK_SLIP_ID,
} from '../../lib/banking/c6/c6BoletoHomologIssuedIds';
import { C6_BANK_SLIPS_URL } from '../../lib/banking/c6/c6BoletoEndpoints';

export const C6_B04_SANDBOX_COMPANY_ID = C6_B01_SANDBOX_COMPANY_ID;
export const C6_B04_SANDBOX_INTEGRATION_ID = C6_B01_SANDBOX_INTEGRATION_ID;
export const C6_B04_SANDBOX_SOURCE_REF = C6_B04_SOURCE_REF;
export const C6_B04_SANDBOX_ALTER_REF = C6_B04_ALTER_REF;

export function buildC6HomologB04SandboxPayload(companyId: string) {
  return buildC6HomologB04SourcePayload(companyId);
}

function main() {
  if (C6_B04_SANDBOX_SOURCE_REF === C6_B01_SANDBOX_PREPARED_REF) {
    throw new Error('B_04 não pode reutilizar a referência B_01.');
  }
  if (C6_B04_SANDBOX_SOURCE_REF === C6_B02_SANDBOX_PREPARED_REF) {
    throw new Error('B_04 não pode reutilizar a referência B_02.');
  }
  if (C6_B04_SANDBOX_SOURCE_REF === C6_B03_SANDBOX_PREPARED_REF) {
    throw new Error('B_04 não pode reutilizar a referência B_03.');
  }
  if (!C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B04_SANDBOX_SOURCE_REF)) {
    throw new Error('Referência origem B_04 fora do padrão OpenAPI.');
  }
  if (!C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B04_SANDBOX_ALTER_REF)) {
    throw new Error('Referência alteração B_04 fora do padrão OpenAPI.');
  }
  const payload = buildC6HomologB04SandboxPayload(C6_B04_SANDBOX_COMPANY_ID);
  const now = new Date('2026-10-27T12:00:00-03:00');
  const body = buildC6BankSlipCreateBody(payload, now);
  const patch = buildC6BankSlipAlterBody(buildC6HomologB04AlterPatch(), now);
  console.log(
    JSON.stringify(
      {
        emitNow: false,
        alterNow: false,
        sourceConfirmationRequiredLater: C6_B04_SOURCE_CONFIRMATION_PHRASE,
        alterConfirmationRequiredLater: C6_B04_ALTER_CONFIRMATION_PHRASE,
        liveFlagMustStaySandboxOnly: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_04.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_04.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_04.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_04.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_04.roteiroExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_04.readyToExecute,
        },
        exclusiveSource: {
          companyId: C6_B04_SANDBOX_COMPANY_ID,
          integrationId: C6_B04_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          billing_scheme: body.billing_scheme,
          external_reference_id: body.external_reference_id,
          amount: body.amount,
          due_date: body.due_date,
          payerName: C6_B01_SANDBOX_TEST_PAYER.name,
          payerTaxIdMasked: '111*****35',
        },
        alter: {
          openapiAllowedFields: ['amount', 'due_date', 'discount', 'interest', 'fine'],
          payerAllowed: false,
          patch,
          urlTemplate: `${C6_BANK_SLIPS_URL.SANDBOX}{id_do_boleto_exclusivo}`,
        },
        forbiddenReuse: {
          b01Reference: C6_B01_SANDBOX_PREPARED_REF,
          b02Reference: C6_B02_SANDBOX_PREPARED_REF,
          b03Reference: C6_B03_SANDBOX_PREPARED_REF,
          b01BankSlipId: C6_HOMOLOG_B01_BANK_SLIP_ID,
          b02BankSlipId: C6_HOMOLOG_B02_BANK_SLIP_ID,
          b03BankSlipId: C6_HOMOLOG_B03_BANK_SLIP_ID,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b04-sandbox-ready')) {
  main();
}
