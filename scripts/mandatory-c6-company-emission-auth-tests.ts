/**
 * Emissão C6 fica na integração da própria empresa. Outra empresa não liga nem herda a flag.
 * npx tsx scripts/mandatory-c6-company-emission-auth-tests.ts
 */
import { isC6CompanyOperationEnabled } from '../lib/banking/c6/c6CompanyAccess';
import {
  isC6EmissionActivated,
  readC6BolepixActivationRequested,
  readC6EmissionEnabled,
  requestC6BolepixCompanyActivation,
  setC6CompanyEmissionEnabled,
  filterC6BolepixAuthorizedReceipts,
} from '../lib/banking/c6/c6EmissionAuthorization';
import { throwIfC6EmissionAttempt } from '../lib/banking/c6/c6EmitGuard';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Row = Record<string, unknown>;

function memory() {
  const tables: Record<string, Row[]> = {
    bank_integrations: [
      {
        id: 'int-a',
        company_id: COMPANY_A,
        provider: 'C6',
        client_id: 'client-a',
        metadata: { c6: { boleto: true, emission_enabled: false, webhook_enabled: false, settlement_enabled: false } },
      },
      {
        id: 'int-b',
        company_id: COMPANY_B,
        provider: 'C6',
        client_id: 'client-b',
        metadata: { c6: { emission_enabled: false } },
      },
    ],
    bank_credentials: [
      { integration_id: 'int-a', credential_type: 'oauth' },
      { integration_id: 'int-a', credential_type: 'certificate' },
      { integration_id: 'int-b', credential_type: 'oauth' },
    ],
    company_financial_accounts: [
      { id: 'fa-a', company_id: COMPANY_A, bank_integration_id: 'int-a', active: true },
    ],
    c6_bolepix_pix_keys: [],
    audit_logs: [],
  };

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let patch: Row | null = null;
    let single = false;
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      update(next: Row) {
        patch = next;
        return query;
      },
      insert(row: Row) {
        tables[table].push(row);
        return Promise.resolve({ data: row, error: null });
      },
      maybeSingle() {
        single = true;
        return query;
      },
      then(resolve: (value: { data: Row | Row[] | null; error: null }) => void) {
        const matched = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
        if (patch) {
          for (const row of matched) Object.assign(row, patch);
        }
        resolve({
          data: single ? matched[0] || null : matched.map((row) => ({ ...row })),
          error: null,
        });
      },
    };
    return query;
  }

  return { from, tables };
}

async function main() {
  assert(isC6CompanyOperationEnabled('', 'config') === false, 'sem empresa não configura');
  assert(isC6CompanyOperationEnabled(COMPANY_A, 'connection') === true, 'conexão da própria empresa');
  assert(isC6CompanyOperationEnabled(COMPANY_B, 'emission') === false, 'emissão não vem do código');
  assert(readC6EmissionEnabled({ c6: { emission_enabled: false } }) === false, 'flag falsa permanece desligada');
  throwIfC6EmissionAttempt('ASAAS_COMPANY', COMPANY_A);
  throwIfC6EmissionAttempt('INTER', COMPANY_A);
  let blocked = false;
  try {
    throwIfC6EmissionAttempt('C6', COMPANY_A);
  } catch {
    blocked = true;
  }
  assert(blocked, 'o fluxo Asaas continua recusando C6');

  const db = memory();
  assert((await isC6EmissionActivated(db as never, COMPANY_A)) === false, 'cadastro não liga emissão');
  let refused = false;
  try {
    await setC6CompanyEmissionEnabled(db as never, COMPANY_B, true);
  } catch {
    refused = true;
  }
  assert(refused, 'empresa sem credencial completa não ativa emissão');
  assert(readC6EmissionEnabled(db.tables.bank_integrations[1].metadata) === false, 'a outra empresa permanece desligada');

  await setC6CompanyEmissionEnabled(db as never, COMPANY_A, true);
  assert((await isC6EmissionActivated(db as never, COMPANY_A)) === true, 'a empresa completa ativa a própria emissão');
  assert((await isC6EmissionActivated(db as never, COMPANY_B)) === false, 'a ativação não vaza para outra empresa');
  const meta = db.tables.bank_integrations[0].metadata as { c6: Record<string, unknown> };
  assert(meta.c6.webhook_enabled === false && meta.c6.settlement_enabled === false, 'webhook e liquidação não são ligados');
  assert(db.tables.audit_logs.length === 1, 'a ativação gera auditoria');

  const requested = memory();
  let missingPix = false;
  try {
    await requestC6BolepixCompanyActivation(requested as never, COMPANY_A);
  } catch {
    missingPix = true;
  }
  assert(missingPix, 'sem EVP a solicitação não é gravada');
  assert(readC6EmissionEnabled(requested.tables.bank_integrations[0].metadata) === false, 'a solicitação recusada não liga emissão');
  requested.tables.c6_bolepix_pix_keys.push({
    company_id: COMPANY_A,
    integration_id: 'int-a',
    key_fingerprint: 'abc123def456',
  });
  await requestC6BolepixCompanyActivation(requested as never, COMPANY_A);
  const requestedMeta = requested.tables.bank_integrations[0].metadata as { c6: Record<string, unknown> };
  assert(readC6BolepixActivationRequested(requestedMeta) === true, 'a solicitação fica na empresa autenticada');
  assert(requestedMeta.c6.emission_enabled === false, 'solicitar não liga a emissão real');
  assert((await isC6EmissionActivated(requested as never, COMPANY_A)) === false, 'a solicitação não autoriza chamada bancária');
  let foreignRequest = false;
  try {
    await requestC6BolepixCompanyActivation(requested as never, COMPANY_B);
  } catch {
    foreignRequest = true;
  }
  assert(foreignRequest, 'outra empresa não recebe a solicitação');
  assert(
    readC6BolepixActivationRequested(requested.tables.bank_integrations[1].metadata) === false,
    'a solicitação não atravessa empresa',
  );

  const companyId = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
  const integrationId = 'b5cc1de3-172b-4926-a528-36cebc14db51';
  const entrada = '693281b1-4d61-4209-adcc-0b378968aed3';
  const siblings = [
    '25c9d7c7-fd95-43b1-97ba-8a1953469e0e',
    '4f1f6dea-53c1-4a96-91d3-c31d1dd1dca3',
    '10c81966-7ced-4e09-9f45-df04496dcefe',
    'fb76a549-399c-4f08-975a-0b0191b096b3',
  ];
  const homolog = memory();
  homolog.tables.bank_integrations.splice(0, homolog.tables.bank_integrations.length, {
    id: integrationId,
    company_id: companyId,
    provider: 'C6',
    status: 'DRAFT',
    client_id: 'client-homolog',
    metadata: { c6: { emission_enabled: false, webhook_enabled: false, settlement_enabled: false } },
  });
  homolog.tables.bank_credentials.splice(
    0,
    homolog.tables.bank_credentials.length,
    { integration_id: integrationId, credential_type: 'oauth' },
    { integration_id: integrationId, credential_type: 'certificate' },
  );
  homolog.tables.company_financial_accounts.splice(0, homolog.tables.company_financial_accounts.length, {
    id: '7b8663bb-8520-42d5-aa62-f2a30ec84464',
    company_id: companyId,
    bank_integration_id: integrationId,
    active: true,
  });
  homolog.tables.c6_bolepix_pix_keys.push({
    company_id: companyId,
    integration_id: integrationId,
    key_fingerprint: 'abc123def456',
  });
  const before = await filterC6BolepixAuthorizedReceipts(homolog as never, companyId, [entrada, ...siblings]);
  assert(before.length === 0, 'sem a senha confirmada nenhuma parcela fica autorizada');
  await requestC6BolepixCompanyActivation(homolog as never, companyId);
  const stored = homolog.tables.bank_integrations[0];
  assert(stored.status === 'DRAFT', 'o status DRAFT permanece');
  assert(readC6BolepixActivationRequested(stored.metadata) === true, 'a autorização permanece gravada');
  assert(readC6EmissionEnabled(stored.metadata) === false, 'a autorização não liga emission_enabled');
  const after = await filterC6BolepixAuthorizedReceipts(homolog as never, companyId, [entrada, ...siblings]);
  assert(after.length === 1 && after[0] === entrada, 'depois da autorização só a entrada habilita o botão');
  const otherCompany = await filterC6BolepixAuthorizedReceipts(homolog as never, COMPANY_B, [entrada]);
  assert(otherCompany.length === 0, 'outra empresa não herda a autorização');

  console.log('C6_COMPANY_EMISSION_AUTH_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
