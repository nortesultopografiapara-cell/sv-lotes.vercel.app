/**
 * Testes obrigatórios — exclusão de cobranças canceladas (soft delete).
 * npx tsx scripts/mandatory-saas-charge-delete-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  assertCanDeleteCancelledSaasCharge,
  canDeleteCancelledSaasCharge,
  isSaasChargeSoftDeleted,
} from '../lib/saasCharges';
import { buildSaasInvoiceChargeRows, pickBestChargeForInvoice } from '../lib/saasInvoiceChargeView';
import { deleteAsaasPayment, isAsaasConfigured } from '../lib/payments/providers/asaas';
import { MockPaymentProvider } from '../lib/payments/providers/mock';
import type { SaasCharge } from '../lib/saasCharges';
import type { MasterSaasInvoice } from '../lib/saasBilling';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  const full = path.join(ROOT, rel);
  assert(fs.existsSync(full), `arquivo ausente: ${rel}`);
  return fs.readFileSync(full, 'utf8');
}

function testCanDeleteOnlyCancelled() {
  assert(canDeleteCancelledSaasCharge('CANCELLED'), 'CANCELLED');
  assert(canDeleteCancelledSaasCharge('CANCELADA'), 'CANCELADA');
  assert(canDeleteCancelledSaasCharge('CANCELED'), 'CANCELED');
  assert(!canDeleteCancelledSaasCharge('PENDING'), 'PENDING bloqueado');
  assert(!canDeleteCancelledSaasCharge('PAID'), 'PAID bloqueado');
  assert(!canDeleteCancelledSaasCharge('OVERDUE'), 'OVERDUE bloqueado');
  assert(!canDeleteCancelledSaasCharge('RECEIVED'), 'RECEIVED bloqueado');
  assert(!canDeleteCancelledSaasCharge('CONFIRMED'), 'CONFIRMED bloqueado');

  let threw = false;
  try {
    assertCanDeleteCancelledSaasCharge({ status: 'PENDING', deleted_at: null });
  } catch {
    threw = true;
  }
  assert(threw, 'assertCanDeleteCancelled rejeita PENDING');

  threw = false;
  try {
    assertCanDeleteCancelledSaasCharge({
      status: 'CANCELLED',
      deleted_at: '2026-01-01T00:00:00Z',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'assertCanDeleteCancelled rejeita já excluída');

  assertCanDeleteCancelledSaasCharge({ status: 'CANCELLED', deleted_at: null });
  console.log('OK testCanDeleteOnlyCancelled');
}

function testSoftDeletedHiddenFromLists() {
  const charges: SaasCharge[] = [
    {
      id: 'c1',
      company_id: 'co1',
      amount: 100,
      due_date: '2026-07-01',
      status: 'CANCELLED',
      payment_provider: 'mock',
      invoice_id: 'inv1',
      deleted_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 'c2',
      company_id: 'co1',
      amount: 100,
      due_date: '2026-07-01',
      status: 'PENDING',
      payment_provider: 'mock',
      invoice_id: 'inv2',
    },
  ];
  assert(isSaasChargeSoftDeleted(charges[0]), 'deleted detectado');
  assert(!isSaasChargeSoftDeleted(charges[1]), 'ativa visível');
  assert(pickBestChargeForInvoice(charges, 'inv1') === null, 'deleted fora do pick');
  assert(pickBestChargeForInvoice(charges, 'inv2')?.id === 'c2', 'ativa no pick');
  console.log('OK testSoftDeletedHiddenFromLists');
}

function testBuildRowsHidesCancelledWithoutCharge() {
  const invoices: MasterSaasInvoice[] = [
    {
      id: 'inv1',
      company_id: 'co1',
      invoice_number: '00001/2026-06',
      reference_month: '2026-06',
      amount: 100,
      discount_amount: 0,
      final_amount: 100,
      due_date: '2026-06-01',
      issued_at: '2026-06-01',
      status: 'CANCELADO',
    },
    {
      id: 'inv2',
      company_id: 'co1',
      invoice_number: '00002/2026-07',
      reference_month: '2026-07',
      amount: 100,
      discount_amount: 0,
      final_amount: 100,
      due_date: '2026-07-01',
      issued_at: '2026-07-01',
      status: 'PENDENTE',
    },
  ];
  const rows = buildSaasInvoiceChargeRows(invoices, []);
  assert(rows.length === 1, 'cancelada sem cobrança oculta');
  assert(rows[0].invoiceId === 'inv2', 'pendente permanece');
  console.log('OK testBuildRowsHidesCancelledWithoutCharge');
}

async function testMockProviderDelete() {
  const provider = new MockPaymentProvider();
  assert(typeof provider.deleteCharge === 'function', 'mock deleteCharge');
  const result = await provider.deleteCharge!('pay_test');
  assert(result.ok && result.status === 'deleted', 'mock delete ok');
  console.log('OK testMockProviderDelete');
}

function testMigrationAndQueries() {
  const migration = read('supabase/migrations/20260809120000_saas_charges_soft_delete.sql');
  assert(migration.includes('deleted_at'), 'deleted_at');
  assert(migration.includes('deleted_by'), 'deleted_by');
  assert(migration.includes('delete_reason'), 'delete_reason');
  assert(migration.includes('asaas_delete_status'), 'asaas_delete_status');

  const lib = read('lib/saasCharges.ts');
  assert(lib.includes(".is('deleted_at', null)"), 'filtro deleted_at em listagens');
  assert(lib.includes('deleteCancelledSaasCharge'), 'função delete');
  assert(lib.includes('SAAS_CHARGE_DELETED'), 'auditoria delete');

  const billingRoute = read('app/api/billing/route.ts');
  assert(billingRoute.includes("is('deleted_at', null)"), 'billing ignora excluídas');

  console.log('OK testMigrationAndQueries');
}

function testApiAndUi() {
  const api = read('app/api/saas/billing/charges/[id]/route.ts');
  assert(api.includes('export async function DELETE'), 'DELETE endpoint');
  assert(api.includes('deleteCancelledSaasCharge'), 'usa deleteCancelledSaasCharge');
  assert(api.includes('assertSuperAdmin'), 'auth master');

  const masterRoute = read('app/api/master/saas-charges/route.ts');
  assert(masterRoute.includes("action === 'delete_cancelled'"), 'action master');

  const table = read('components/master/saas/SaasChargesTable.tsx');
  assert(table.includes('Excluir cobrança cancelada'), 'label UI');
  assert(table.includes('onDeleteCancelledCharge'), 'handler UI');
  assert(table.includes('isCancelled'), 'somente cancelada');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('handleDeleteCancelledCharge'), 'handler page');
  assert(
    page.includes(
      'Essa cobrança cancelada será removida do painel Master, do painel do cliente',
    ),
    'confirmação',
  );

  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes('deleteAsaasPayment'), 'delete Asaas');
  assert(asaas.includes('404'), '404 passa');

  console.log('OK testApiAndUi');
}

function testAsaasDeleteBlockingHeuristic() {
  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes('isBlockingAsaasDeleteError'), 'heurística bloqueio');
  assert(asaas.includes('blocking'), 'flag blocking');
  console.log('OK testAsaasDeleteBlockingHeuristic');
}

async function testAsaasDelete404Optional() {
  if (!isAsaasConfigured()) {
    console.log('SKIP testAsaasDelete404Live — ASAAS_API_KEY ausente');
    return;
  }
  const result = await deleteAsaasPayment('pay_nonexistent_charge_delete_test_000');
  assert(result.status === 'not_found' || result.httpStatus === 404, '404 tratado');
  console.log('OK testAsaasDelete404Live');
}

testCanDeleteOnlyCancelled();
testSoftDeletedHiddenFromLists();
testBuildRowsHidesCancelledWithoutCharge();
void testMockProviderDelete().then(() => {
  testMigrationAndQueries();
  testApiAndUi();
  testAsaasDeleteBlockingHeuristic();
  return testAsaasDelete404Optional();
}).then(() => {
  console.log('mandatory-saas-charge-delete-tests: all passed');
});
