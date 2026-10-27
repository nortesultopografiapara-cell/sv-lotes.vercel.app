/**
 * Preparação (não execução) do B_06 Sandbox — GET PDF do boleto B_01.
 * Não chama C6. Não baixa PDF.
 *
 * npx tsx scripts/develop/c6-homolog-b06-sandbox-ready.ts
 */
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import { buildC6BankSlipPdfUrl } from '../../lib/banking/c6/c6BoletoEndpoints';
import {
  C6_B06_AUTHORIZED_BANK_SLIP_ID,
  C6_B06_CONFIRMATION_PHRASE,
  C6_B06_IDEMPOTENCY_REF,
} from '../../lib/banking/c6/c6BoletoHomologB06';
import { C6_HOMOLOG_B01_BANK_SLIP_ID } from '../../lib/banking/c6/c6BoletoHomologIssuedIds';
import { C6_B01_SANDBOX_COMPANY_ID, C6_B01_SANDBOX_INTEGRATION_ID } from './c6-homolog-b01-sandbox-ready';

export const C6_B06_SANDBOX_PREPARED_REF = C6_B06_IDEMPOTENCY_REF;

function main() {
  if (C6_B06_AUTHORIZED_BANK_SLIP_ID !== C6_HOMOLOG_B01_BANK_SLIP_ID) {
    throw new Error('B_06 deve usar o id do B_01.');
  }
  console.log(
    JSON.stringify(
      {
        getPdfNow: false,
        confirmationRequiredLater: C6_B06_CONFIRMATION_PHRASE,
        liveFlagMustStaySandboxOnly: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_06.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_06.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_06.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_06.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_06.roteiroExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_06.readyToExecute,
        },
        query: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          method: 'GET',
          url: buildC6BankSlipPdfUrl('SANDBOX', C6_B06_AUTHORIZED_BANK_SLIP_ID),
          bankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
          source: 'B_01',
          scope: 'bankslip.read',
          accept: 'application/pdf',
          idempotencyRef: C6_B06_SANDBOX_PREPARED_REF,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b06-sandbox-ready')) {
  main();
}
