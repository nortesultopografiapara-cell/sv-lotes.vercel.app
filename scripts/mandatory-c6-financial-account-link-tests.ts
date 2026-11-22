/**
 * A conta C6 nasce sem provedor e não reaproveita Asaas ou Inter.
 * npx tsx scripts/mandatory-c6-financial-account-link-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  C6_FINANCIAL_ACCOUNT_NOTE,
  createUnlinkedC6FinancialAccount,
  isPendingC6FinancialAccount,
} from '../lib/banking/c6/c6FinancialAccount';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

type Row = Record<string, unknown>;

function mockAdmin(rows: Row[]) {
  return {
    from(table: string) {
      if (table !== 'company_financial_accounts') throw new Error(`tabela inesperada: ${table}`);
      const filters: Array<{ key: string; value: unknown; op: 'eq' | 'is' }> = [];
      let insertRow: Row | null = null;
      const chain = {
        select() {
          return chain;
        },
        eq(key: string, value: unknown) {
          filters.push({ key, value, op: 'eq' });
          return chain;
        },
        is(key: string, value: unknown) {
          filters.push({ key, value, op: 'is' });
          return chain;
        },
        insert(row: Row) {
          insertRow = row;
          return chain;
        },
        single() {
          const row = { id: `fa-${rows.length + 1}`, ...insertRow };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          const data = rows.filter((row) =>
            filters.every((filter) =>
              filter.op === 'is' ? row[filter.key] == null : row[filter.key] === filter.value,
            ),
          );
          resolve({ data, error: null });
        },
      };
      return chain;
    },
  };
}

async function main() {
  const rows: Row[] = [
    {
      id: 'asaas-1',
      company_id: 'company-a',
      name: 'Conta Asaas',
      bank_integration_id: 'int-asaas',
      active: true,
      notes: 'Asaas',
    },
    {
      id: 'inter-1',
      company_id: 'company-a',
      name: 'Conta Inter',
      bank_integration_id: 'int-inter',
      active: true,
      notes: 'Inter',
    },
    {
      id: 'other-company',
      company_id: 'company-b',
      name: 'Conta C6',
      bank_integration_id: null,
      active: true,
      notes: C6_FINANCIAL_ACCOUNT_NOTE,
    },
  ];
  const admin = mockAdmin(rows) as never;
  const created = await createUnlinkedC6FinancialAccount(admin, 'company-a', 'PRODUCTION');
  assert(created.created, 'cria uma conta nova quando não há conta C6 livre');
  assert(created.id !== 'asaas-1' && created.id !== 'inter-1' && created.id !== 'other-company', 'não reutiliza outra conta');
  const inserted = rows.find((row) => row.id === created.id);
  assert(inserted?.company_id === 'company-a', 'a conta fica na empresa da sessão');
  assert(inserted?.bank_integration_id == null, 'a conta nasce sem vínculo');
  assert(inserted?.is_default === false, 'a conta não vira padrão');
  assert(rows.filter((row) => row.bank_integration_id === 'int-asaas').length === 1, 'a conta Asaas permanece');
  assert(rows.filter((row) => row.bank_integration_id === 'int-inter').length === 1, 'a conta Inter permanece');

  const reused = await createUnlinkedC6FinancialAccount(admin, 'company-a', 'PRODUCTION');
  assert(!reused.created && reused.id === created.id, 'reutiliza somente a conta C6 ainda sem vínculo');
  assert(rows.filter((row) => row.company_id === 'company-a' && row.bank_integration_id == null).length === 1, 'não duplica a conta');

  assert(!isPendingC6FinancialAccount({ provider: 'ASAAS_COMPANY', notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'Asaas não é tratado como C6');
  assert(!isPendingC6FinancialAccount({ provider: 'INTER', notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'Inter não é tratado como C6');
  assert(isPendingC6FinancialAccount({ provider: null, notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'conta sem provedor pode ser selecionada');

  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(path.join(root, 'lib/finance/companyFinancialAccountRepository.ts'), 'utf8');
  const resolver = fs.readFileSync(path.join(root, 'lib/banking/c6/c6ConfigRepository.ts'), 'utf8');
  assert(repository.includes("String(existing.provider || '').toUpperCase() === 'C6'"), 'salvar a conta não cria integração Asaas para o C6');
  assert(resolver.includes(".eq('bank_integration_id', integrationId)"), 'a leitura encontra a conta já vinculada');
  assert(!resolver.includes('emission_enabled\': true') && !repository.includes('emission_enabled'), 'o cadastro não ativa emissão');

  console.log('C6_FINANCIAL_ACCOUNT_LINK_OK');
}

void main();
