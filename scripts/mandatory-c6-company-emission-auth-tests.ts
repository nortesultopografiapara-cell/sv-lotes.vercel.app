/**
 * Emissão C6 fica na integração da própria empresa. Outra empresa não liga nem herda a flag.
 * npx tsx scripts/mandatory-c6-company-emission-auth-tests.ts
 */
import { isC6CompanyOperationEnabled } from '../lib/banking/c6/c6CompanyAccess';
import {
  isC6EmissionActivated,
  readC6EmissionEnabled,
  setC6CompanyEmissionEnabled,
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
    audit_logs: [],
  };

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let patch: Row | null = null;
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
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const matched = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
        if (patch) {
          for (const row of matched) Object.assign(row, patch);
        }
        resolve({ data: matched.map((row) => ({ ...row })), error: null });
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

  console.log('C6_COMPANY_EMISSION_AUTH_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
