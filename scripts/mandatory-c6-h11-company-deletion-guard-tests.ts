/**
 * A empresa piloto C6 não pode ser excluída. As demais empresas de teste seguem.
 * npx tsx scripts/mandatory-c6-h11-company-deletion-guard-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import { COMPANY_DELETION_PROTECTED_COMPANY_ID } from '../lib/companyDeletionGuard';
import { executeCompanyCleanup } from '../app/api/companies/cleanup/route';
import { executeCompanyDeleteTest } from '../app/api/companies/delete-test/route';
import { executeCompanyPermanentDelete } from '../app/api/companies/delete/route';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const PROTECTED = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const OTHER_TEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const EMPTY_REAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

type Op = { op: string; table: string; val?: string };

function mockDb(companies: Array<Record<string, unknown>>, users: Array<Record<string, unknown>> = []) {
  const ops: Op[] = [];
  function from(table: string) {
    const state = { filters: {} as Record<string, string>, head: false };
    const query: Record<string, unknown> = {};
    const api = {
      select(_columns?: string, options?: { head?: boolean }) {
        state.head = Boolean(options?.head);
        return api;
      },
      eq(column: string, value: string) {
        state.filters[column] = value;
        return api;
      },
      async single() {
        if (table === 'companies') {
          const row = companies.find((item) => item.id === state.filters.id) ?? null;
          return { data: row, error: row ? null : { message: 'missing' } };
        }
        return { data: null, error: null };
      },
      update() {
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => ({ error: null }),
      delete() {
        return {
          eq: async (_column: string, value: string) => {
            ops.push({ op: 'delete', table, val: value });
            return { error: null };
          },
        };
      },
      then(resolve: (value: { data: unknown; error: null; count: number }) => void) {
        if (state.head) {
          resolve({ data: null, error: null, count: 0 });
          return;
        }
        if (table === 'companies') {
          resolve({ data: companies, error: null, count: companies.length });
          return;
        }
        if (table === 'users') {
          const tenantId = state.filters.tenant_id;
          const data = tenantId ? users.filter((user) => user.tenant_id === tenantId) : users;
          resolve({ data, error: null, count: data.length });
          return;
        }
        resolve({ data: [], error: null, count: 0 });
      },
    };
    Object.assign(query, api);
    return api;
  }
  return {
    ops,
    client: {
      from,
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: [] }, error: null }),
          deleteUser: async (id: string) => {
            ops.push({ op: 'auth-delete', table: 'auth.users', val: id });
            return { error: null };
          },
        },
      },
    },
  };
}

function deletedCompanyIds(ops: Op[]) {
  return ops.filter((op) => op.op === 'delete' && op.table === 'companies').map((op) => op.val);
}

async function main() {
  assert(COMPANY_DELETION_PROTECTED_COMPANY_ID === PROTECTED, 'a proteção usa o UUID confirmado');
  assert(TOPOGRAFIA_COMPANY_ID === '5ebfe934-e1ae-4252-b3dd-808390c32551', 'a constante antiga permanece');
  const staleCompanyId: string = TOPOGRAFIA_COMPANY_ID;
  const protectedCompanyId: string = COMPANY_DELETION_PROTECTED_COMPANY_ID;
  assert(staleCompanyId !== protectedCompanyId, 'a proteção não reutiliza a constante antiga');

  const cleanup = mockDb([
    { id: PROTECTED, name: 'S.V TOPOGRAFIA E PROJETO LTDA', is_test_company: true, is_test: false },
    { id: OTHER_TEST, name: 'Empresa teste comum', is_test_company: true, is_test: false },
    { id: EMPTY_REAL, name: 'Empresa sem usuários', is_test_company: false, is_test: false },
  ]);
  const cleanupResponse = await executeCompanyCleanup(
    new Request('http://localhost/api/companies/cleanup', { method: 'POST' }),
    cleanup.client as never,
  );
  const cleanupBody = await cleanupResponse.json();
  const removed = deletedCompanyIds(cleanup.ops);
  assert(cleanupResponse.status === 200, 'a limpeza geral continua concluindo');
  assert(!removed.includes(PROTECTED), 'a limpeza não apaga a empresa protegida');
  assert(removed.includes(OTHER_TEST), 'a limpeza ainda apaga outra empresa de teste');
  assert(removed.includes(EMPTY_REAL), 'a limpeza ainda apaga empresa vazia não protegida');
  assert(cleanupBody.stats.testCompaniesRemoved === 1, 'só uma empresa de teste elegível sai na contagem');

  const deleteTest = mockDb([
    { id: PROTECTED, name: 'S.V TOPOGRAFIA E PROJETO LTDA', is_test_company: true },
  ]);
  const deleteTestResponse = await executeCompanyDeleteTest(
    new Request('http://localhost/api/companies/delete-test', {
      method: 'POST',
      body: JSON.stringify({ companyId: PROTECTED }),
    }),
    deleteTest.client as never,
  );
  assert(deleteTestResponse.status === 403, 'delete-test recusa a empresa protegida');
  assert(deleteTest.ops.length === 0, 'delete-test não chega a nenhuma exclusão');

  const otherDeleteTest = mockDb([
    { id: OTHER_TEST, name: 'Empresa teste comum', is_test_company: true },
  ]);
  const otherDeleteTestResponse = await executeCompanyDeleteTest(
    new Request('http://localhost/api/companies/delete-test', {
      method: 'POST',
      body: JSON.stringify({ companyId: OTHER_TEST }),
    }),
    otherDeleteTest.client as never,
  );
  assert(otherDeleteTestResponse.status === 200, 'outra empresa de teste ainda pode seguir o fluxo');
  assert(deletedCompanyIds(otherDeleteTest.ops).includes(OTHER_TEST), 'a exclusão da outra empresa de teste permanece');

  const permanent = mockDb([
    {
      id: PROTECTED,
      name: 'S.V TOPOGRAFIA E PROJETO LTDA',
      is_test_company: true,
      is_master: false,
      slug: 'sv-topografia',
      email: 'contato@example.com',
    },
  ]);
  const permanentResponse = await executeCompanyPermanentDelete(permanent.client as never, {
    companyId: PROTECTED,
    confirmationName: 'S.V TOPOGRAFIA E PROJETO LTDA',
    destructiveConfirmation: 'APAGAR DEFINITIVAMENTE',
    adminUserId: 'admin-1',
  });
  assert(permanentResponse.status === 403, 'a exclusão definitiva recusa a empresa protegida');
  assert(permanent.ops.length === 0, 'nome e frase de autorização não liberam a exclusão');

  const otherPermanent = mockDb([
    {
      id: OTHER_TEST,
      name: 'Empresa teste comum',
      is_test_company: true,
      is_master: false,
      slug: 'teste',
      email: 'teste@example.com',
    },
  ]);
  const otherPermanentResponse = await executeCompanyPermanentDelete(otherPermanent.client as never, {
    companyId: OTHER_TEST,
    confirmationName: 'Empresa teste comum',
    adminUserId: 'admin-1',
  });
  assert(otherPermanentResponse.status === 200, 'outra empresa continua excluível com o nome confirmado');
  assert(deletedCompanyIds(otherPermanent.ops).includes(OTHER_TEST), 'a exclusão definitiva da outra empresa permanece');

  const root = path.resolve(__dirname, '..');
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
  const cleanupSource = read('app/api/companies/cleanup/route.ts');
  const deleteSource = read('app/api/companies/delete/route.ts');
  const deleteTestSource = read('app/api/companies/delete-test/route.ts');
  assert(cleanupSource.indexOf('authorizeCompanyAdminRequest') < cleanupSource.indexOf('executeCompanyCleanup'), 'a limpeza continua exigindo superadministrador');
  const deleteHandler = deleteSource.slice(deleteSource.indexOf('export async function DELETE'));
  assert(deleteHandler.indexOf('signInWithPassword') < deleteHandler.indexOf('protectedCompanyRefusal('), 'a senha continua antes da proteção');
  assert(deleteSource.includes("userData.role !== 'SUPER_ADMIN'"), 'a exclusão definitiva continua restrita ao superadministrador');
  assert(deleteTestSource.indexOf('authorizeCompanyAdminRequest') < deleteTestSource.indexOf('executeCompanyDeleteTest'), 'delete-test continua exigindo superadministrador');
  assert(!read('lib/finance/asaasIntegrationRepository.ts').includes('companyDeletionGuard'), 'Asaas não depende da proteção');
  assert(!read('lib/banking/inter/interConfigRepository.ts').includes('companyDeletionGuard'), 'Inter não depende da proteção');
  assert(!read('lib/companySettingsLayout.ts').includes(PROTECTED), 'a constante antiga não recebe o UUID protegido');

  console.log('C6_H11_DELETION_GUARD_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
