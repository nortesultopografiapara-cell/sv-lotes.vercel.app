/**
 * Preparação (não execução) do B_07 Sandbox — cadastro de webhook BANK_SLIP.
 * Não chama POST /v1/webhooks/. Não chama GET de webhook no C6.
 *
 * npx tsx scripts/develop/c6-homolog-b07-sandbox-ready.ts
 */
import { C6_BOLETO_HOMOLOG_CASES } from '../../lib/banking/c6/c6BoletoHomologCatalog';
import { C6_BOLETO_SANDBOX_LIVE_ENV_KEY } from '../../lib/banking/c6/c6EmitGuard';
import {
  C6_B07_CONFIRMATION_PHRASE,
  C6_B07_IDEMPOTENCY_REF,
} from '../../lib/banking/c6/c6BoletoHomologB07';
import {
  C6_NOTIFICATIONS_REGISTER_METHOD,
  C6_NOTIFICATIONS_ROTEIRO_STATUS,
  C6_NOTIFICATIONS_SERVICE,
  C6_NOTIFICATIONS_OPENAPI_IN_REPO,
} from '../../lib/banking/c6/c6NotificationsOpenApi';
import { buildC6WebhookConsultUrl, buildC6WebhookRegisterUrl } from '../../lib/banking/c6/c6WebhookEndpoints';
import {
  C6_WEBHOOK_FINANCE_MUTATION,
  buildC6WebhookReceiverPath,
} from '../../lib/banking/c6/c6WebhookReceiver';
import { C6_B01_SANDBOX_COMPANY_ID, C6_B01_SANDBOX_INTEGRATION_ID } from './c6-homolog-b01-sandbox-ready';

export const C6_B07_SANDBOX_PREPARED_REF = C6_B07_IDEMPOTENCY_REF;

function main() {
  console.log(
    JSON.stringify(
      {
        registerNow: false,
        confirmationRequiredLater: C6_B07_CONFIRMATION_PHRASE,
        liveFlagMustStaySandboxOnly: C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
        catalog: {
          id: C6_BOLETO_HOMOLOG_CASES.B_07.id,
          title: C6_BOLETO_HOMOLOG_CASES.B_07.title,
          method: C6_BOLETO_HOMOLOG_CASES.B_07.method,
          endpoint: C6_BOLETO_HOMOLOG_CASES.B_07.endpoint,
          roteiroExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_07.roteiroExpectedStatus,
          openapiExpectedStatus: C6_BOLETO_HOMOLOG_CASES.B_07.openapiExpectedStatus,
          readyToExecute: C6_BOLETO_HOMOLOG_CASES.B_07.readyToExecute,
        },
        register: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          method: C6_NOTIFICATIONS_REGISTER_METHOD,
          url: buildC6WebhookRegisterUrl('SANDBOX'),
          body: {
            url: `https://<preview>${buildC6WebhookReceiverPath(C6_B01_SANDBOX_INTEGRATION_ID)}?token=[redacted]`,
            service: C6_NOTIFICATIONS_SERVICE,
          },
          roteiroExpectedStatus: C6_NOTIFICATIONS_ROTEIRO_STATUS,
          openapiInRepo: C6_NOTIFICATIONS_OPENAPI_IN_REPO,
          financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
          idempotencyRef: C6_B07_SANDBOX_PREPARED_REF,
        },
        consult: {
          method: 'GET',
          url: buildC6WebhookConsultUrl('SANDBOX'),
          executed: false,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].includes('c6-homolog-b07-sandbox-ready')) {
  main();
}
