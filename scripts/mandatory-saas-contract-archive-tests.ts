/**
 * Testes — arquivamento soft de contratos SaaS (Master).
 * npx tsx scripts/mandatory-saas-contract-archive-tests.ts
 */

import {
  filterVisibleSaasContracts,
  findActiveVisibleSaasContract,
  isArchivedSaasContract,
} from '../lib/saasContractArchive';
import { formatMasterAuditAction } from '../lib/masterAudit';
import type { CompanyContractRow } from '../lib/saasContractService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fixture(overrides: Partial<CompanyContractRow>): CompanyContractRow {
  return {
    id: overrides.id || 'c1',
    company_id: 'co1',
    subscription_id: null,
    contract_url: 'https://example.com/a.pdf',
    contract_number: '00001/2026',
    version: 1,
    generated_at: '2026-06-01T00:00:00Z',
    status: 'superseded',
    ...overrides,
  };
}

function testArchiveHelpers() {
  const archived = fixture({
    id: 'a1',
    archived_at: '2026-06-02T00:00:00Z',
    archive_kind: 'test',
  });
  const active = fixture({ id: 'v2', status: 'generated', version: 2 });
  const superseded = fixture({ id: 'v1', status: 'superseded', version: 1 });

  assert(isArchivedSaasContract(archived), 'detecta arquivado');
  assert(!isArchivedSaasContract(active), 'ativo não arquivado');
  assert(filterVisibleSaasContracts([archived, active, superseded], false).length === 2, 'filtra arquivados');
  assert(filterVisibleSaasContracts([archived, active], true).length === 2, 'mostra arquivados');
  assert(findActiveVisibleSaasContract([archived, active, superseded])?.id === 'v2', 'ativa visível');
  assert(findActiveVisibleSaasContract([archived, superseded]) === null, 'sem ativa visível');
  console.log('OK testArchiveHelpers');
}

function testAuditLabel() {
  assert(
    formatMasterAuditAction('CONTRACT_ARCHIVED') === 'Contrato SaaS arquivado',
    'label auditoria',
  );
  console.log('OK testAuditLabel');
}

function main() {
  testArchiveHelpers();
  testAuditLabel();
  console.log('\nTodos os testes de arquivamento SaaS passaram.');
}

main();
