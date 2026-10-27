/**
 * Preparação (não execução) do B_03 Sandbox — desconto em valor.
 * Não chama C6. Não reserva. Não emite.
 *
 * npx tsx scripts/develop/c6-homolog-b03-sandbox-ready.ts
 */
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import { C6_BOLETO_EXTERNAL_REFERENCE_PATTERN } from '../../lib/banking/c6/c6BoletoOpenApi';
import { buildC6BankSlipCreateBody } from '../../lib/banking/c6/c6BoletoValidation';
import type { C6BoletoCreateInput, C6BoletoDiscount } from '../../lib/banking/c6/c6BoletoTypes';
import {
  C6_B01_SANDBOX_COMPANY_ID,
  C6_B01_SANDBOX_INTEGRATION_ID,
  C6_B01_SANDBOX_PREPARED_REF,
  C6_B01_SANDBOX_TEST_PAYER,
} from './c6-homolog-b01-sandbox-ready';
import { C6_B02_SANDBOX_PREPARED_REF } from './c6-homolog-b02-sandbox-ready';

export const C6_B03_SANDBOX_COMPANY_ID = C6_B01_SANDBOX_COMPANY_ID;
export const C6_B03_SANDBOX_INTEGRATION_ID = C6_B01_SANDBOX_INTEGRATION_ID;
export const C6_B03_SANDBOX_PREPARED_REF = 'B03S261027';
export const C6_B03_CONFIRMATION_PHRASE = 'EMITIR_B03_SANDBOX';

/** R$ 15,00 se pago até 5 dias antes do vencimento (OpenAPI: dead_line retroativo). */
export const C6_B03_SANDBOX_DISCOUNT: C6BoletoDiscount = {
  discount_type: 'V',
  first: { value: 15, dead_line: 5 },
};

export function buildC6HomologB03SandboxPayload(companyId: string): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: C6_B03_SANDBOX_PREPARED_REF,
    amount: 300,
    due_date: '2026-11-25',
    payer: C6_B01_SANDBOX_TEST_PAYER,
    discount: C6_B03_SANDBOX_DISCOUNT,
  };
}

function main() {
  if (C6_B03_SANDBOX_PREPARED_REF === C6_B01_SANDBOX_PREPARED_REF) {
    throw new Error('B_03 não pode reutilizar a referência B_01.');
  }
  if (C6_B03_SANDBOX_PREPARED_REF === C6_B02_SANDBOX_PREPARED_REF) {
    throw new Error('B_03 não pode reutilizar a referência B_02.');
  }
  if (!C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B03_SANDBOX_PREPARED_REF)) {
    throw new Error('Referência B_03 fora do padrão OpenAPI.');
  }
  const payload = buildC6HomologB03SandboxPayload(C6_B03_SANDBOX_COMPANY_ID);
  const body = buildC6BankSlipCreateBody(payload, new Date('2026-10-27T12:00:00-03:00'));
  console.log(
    JSON.stringify(
      {
        emitNow: false,
        confirmationRequiredLater: C6_B03_CONFIRMATION_PHRASE,
        liveFlagMustStaySandboxOnly: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_03.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_03.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_03.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_03.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_03.roteiroExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_03.readyToExecute,
        },
        prepared: {
          companyId: C6_B03_SANDBOX_COMPANY_ID,
          integrationId: C6_B03_SANDBOX_INTEGRATION_ID,
          environment: body.billing_scheme === '21' ? 'SANDBOX' : 'UNKNOWN',
          billing_scheme: body.billing_scheme,
          external_reference_id: body.external_reference_id,
          amount: body.amount,
          due_date: body.due_date,
          discount: body.discount,
          discountLimitDate: '2026-11-20',
          payerName: C6_B01_SANDBOX_TEST_PAYER.name,
          payerTaxIdMasked: '111*****35',
        },
        forbiddenReuse: {
          b01Reference: C6_B01_SANDBOX_PREPARED_REF,
          b02Reference: C6_B02_SANDBOX_PREPARED_REF,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b03-sandbox-ready')) {
  main();
}
