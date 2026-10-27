/**
 * Preparação (não execução) do B_05 Sandbox — GET do boleto B_01.
 * Não chama C6. Não consulta boleto.
 *
 * npx tsx scripts/develop/c6-homolog-b05-sandbox-ready.ts
 */
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import { C6_BANK_SLIPS_URL } from '../../lib/banking/c6/c6BoletoEndpoints';
import {
  C6_B05_AUTHORIZED_BANK_SLIP_ID,
  C6_B05_CONFIRMATION_PHRASE,
  C6_B05_IDEMPOTENCY_REF,
} from '../../lib/banking/c6/c6BoletoHomologB05';
import { C6_HOMOLOG_B01_BANK_SLIP_ID } from '../../lib/banking/c6/c6BoletoHomologIssuedIds';
import { C6_B01_SANDBOX_COMPANY_ID, C6_B01_SANDBOX_INTEGRATION_ID } from './c6-homolog-b01-sandbox-ready';

export const C6_B05_SANDBOX_PREPARED_REF = C6_B05_IDEMPOTENCY_REF;

function main() {
  if (C6_B05_AUTHORIZED_BANK_SLIP_ID !== C6_HOMOLOG_B01_BANK_SLIP_ID) {
    throw new Error('B_05 deve usar o id do B_01.');
  }
  console.log(
    JSON.stringify(
      {
        getNow: false,
        confirmationRequiredLater: C6_B05_CONFIRMATION_PHRASE,
        liveFlagMustStaySandboxOnly: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_05.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_05.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_05.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_05.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_05.roteiroExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_05.readyToExecute,
        },
        query: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          method: 'GET',
          url: `${C6_BANK_SLIPS_URL.SANDBOX}${C6_B05_AUTHORIZED_BANK_SLIP_ID}`,
          bankSlipId: C6_B05_AUTHORIZED_BANK_SLIP_ID,
          source: 'B_01',
          scope: 'bankslip.read',
          idempotencyRef: C6_B05_SANDBOX_PREPARED_REF,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b05-sandbox-ready')) {
  main();
}
