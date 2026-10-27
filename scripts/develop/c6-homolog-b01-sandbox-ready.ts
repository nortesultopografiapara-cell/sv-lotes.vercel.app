/**
 * Preparação (não execução) do único B_01 Sandbox.
 * Não chama C6. Não liga C6_BOLETO_SANDBOX_LIVE_ENABLED.
 * Autorização futura: EMITIR_B01_SANDBOX.
 *
 * npx tsx scripts/develop/c6-homolog-b01-sandbox-ready.ts
 */
import { C6_B01_CONFIRMATION_PHRASE } from '../../lib/banking/c6/c6BoletoHomologB01';
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import { collectC6HomologWordEvidence } from '../../lib/banking/c6/c6BoletoEvidence';
import { captureC6HomologB01Blocked } from '../../lib/banking/c6/c6BoletoHomologB01';
import type { C6BoletoCreateInput } from '../../lib/banking/c6/c6BoletoTypes';
import type { C6AuthCredentials } from '../../lib/banking/c6/c6AuthClient';

/** Integração C6 Sandbox de teste no Develop (S.V TOPOGRAFIA). Sem secrets. */
export const C6_B01_SANDBOX_COMPANY_ID = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
export const C6_B01_SANDBOX_INTEGRATION_ID = 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25';

/** Referência única de 10 caracteres (padrão OpenAPI). Não reutilizar após emissão. */
export const C6_B01_SANDBOX_PREPARED_REF = 'B01S261027';

/** Pagador de teste já usado nos testes B_01 (CPF válido de fixture, sem PII operacional). */
export const C6_B01_SANDBOX_TEST_PAYER: C6BoletoCreateInput['payer'] = {
  name: 'José da Silva',
  tax_id: '11144477735',
  address: {
    street: 'Av. Nove de Julho',
    number: 123,
    city: 'Rio de Janeiro',
    state: 'RJ',
    zip_code: '05093000',
  },
};

export function buildC6HomologB01SandboxPayload(companyId: string): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: C6_B01_SANDBOX_PREPARED_REF,
    amount: 123.45,
    due_date: '2026-11-15',
    payer: C6_B01_SANDBOX_TEST_PAYER,
  };
}

function main() {
  if (process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] === 'true') {
    throw new Error('C6_BOLETO_SANDBOX_LIVE_ENABLED não pode estar true nesta preparação.');
  }

  const blockedCreds: C6AuthCredentials = {
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    environment: 'SANDBOX',
    clientId: 'blocked',
    clientSecret: 'blocked',
    certificatePem: 'blocked',
    privateKeyPem: 'blocked',
  };
  const { evidence } = captureC6HomologB01Blocked({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: blockedCreds,
    payload: buildC6HomologB01SandboxPayload(C6_B01_SANDBOX_COMPANY_ID),
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
  });
  const word = collectC6HomologWordEvidence(evidence);

  console.log(
    JSON.stringify(
      {
        emitNow: false,
        confirmationRequiredLater: C6_B01_CONFIRMATION_PHRASE,
        liveFlagMustStayUnset: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_01.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_01.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_01.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_01.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_01.roteiroExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_01.readyToExecute,
        },
        prepared: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          billing_scheme: '21',
          external_reference_id: C6_B01_SANDBOX_PREPARED_REF,
          amount: 123.45,
          due_date: '2026-11-15',
          payerName: C6_B01_SANDBOX_TEST_PAYER.name,
          payerTaxIdMasked: '111*****35',
        },
        wordEvidenceTemplate: {
          httpStatus: word.httpStatus,
          responseBody: word.responseBody,
          wordColumnsReady: word.wordColumnsReady,
          collectAfterLiveHttp: [
            'evidence.httpStatus',
            'evidence.responseBody (sanitizado: id, amount, due_date, billing_scheme, bar_code, digitable_line)',
          ],
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b01-sandbox-ready')) {
  main();
}
