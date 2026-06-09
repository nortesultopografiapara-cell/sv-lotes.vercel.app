/**
 * Validação de escrita segura em public.sales (campos oficiais vs órfãos).
 * npx tsx scripts/mandatory-sales-schema-validation-tests.ts
 */

import {
  buildOfficialSalesUpdatePatch,
  SALES_OFFICIAL_UPDATE_FIELDS,
  SALES_ORPHAN_ONLY_FIELDS,
  salePatchHasForbiddenFields,
  salePatchHasOrphanFields,
} from '../lib/salesWriteSchema';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testOfficialUpdatePatchFields() {
  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'cust-1',
    agreedPrice: 250000,
    lotPrice: 260000,
    discount: 10000,
    totalValue: 250000,
    paymentType: 'Parcelado',
    downPayment: 50000,
    installmentsCount: 12,
    brokerId: 'broker-1',
  });

  for (const field of SALES_OFFICIAL_UPDATE_FIELDS) {
    assert(field in patch, `campo oficial ausente: ${field}`);
  }
  for (const orphan of SALES_ORPHAN_ONLY_FIELDS) {
    assert(!(orphan in patch), `campo órfão no patch: ${orphan}`);
  }
  assert(salePatchHasOrphanFields(patch).length === 0, 'sem órfãos');
  assert(salePatchHasForbiddenFields(patch).length === 0, 'sem campos proibidos');
  console.log('OK testOfficialUpdatePatchFields');
}

function testDiscountMappedToOfficialColumn() {
  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'c',
    agreedPrice: 100,
    lotPrice: 110,
    discount: 10,
    totalValue: 100,
    paymentType: 'À vista',
    downPayment: 0,
    installmentsCount: 1,
    brokerId: null,
  });
  assert(patch.discount === 10, 'discount oficial');
  assert(!('discount_value' in patch), 'sem discount_value');
  console.log('OK testDiscountMappedToOfficialColumn');
}

function testDatesNotInUpdatePatch() {
  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'c',
    agreedPrice: 100,
    lotPrice: 100,
    discount: 0,
    totalValue: 100,
    paymentType: 'Parcelado',
    downPayment: 20,
    installmentsCount: 6,
    brokerId: null,
  });
  assert(!('down_payment_due_date' in patch), 'sem down_payment_due_date');
  assert(!('first_installment_due_date' in patch), 'sem first_installment_due_date');
  assert(!('final_value' in patch), 'sem final_value');
  assert(!('installment_value' in patch), 'sem installment_value');
  console.log('OK testDatesNotInUpdatePatch');
}

function testNotesNotInUpdatePatch() {
  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'c',
    agreedPrice: 100,
    lotPrice: 100,
    discount: 0,
    totalValue: 100,
    paymentType: 'Parcelado',
    downPayment: 20,
    installmentsCount: 6,
    brokerId: null,
  });
  assert(!('notes' in patch), 'sem notes no patch');
  assert(!SALES_OFFICIAL_UPDATE_FIELDS.includes('notes' as never), 'notes fora da lista oficial');
  console.log('OK testNotesNotInUpdatePatch');
}

function testOrphanDetector() {
  const bad = {
    discount: 1,
    discount_value: 1,
    down_payment_due_date: '2026-01-01',
  };
  const found = salePatchHasOrphanFields(bad);
  assert(found.includes('discount_value'), 'detecta discount_value');
  assert(found.includes('down_payment_due_date'), 'detecta down_payment_due_date');
  console.log('OK testOrphanDetector');
}

function testForbiddenDetectorIncludesNotes() {
  const bad = { discount: 1, notes: 'observação' };
  const found = salePatchHasForbiddenFields(bad);
  assert(found.includes('notes'), 'detecta notes');
  console.log('OK testForbiddenDetectorIncludesNotes');
}

function main() {
  testOfficialUpdatePatchFields();
  testDiscountMappedToOfficialColumn();
  testDatesNotInUpdatePatch();
  testNotesNotInUpdatePatch();
  testOrphanDetector();
  testForbiddenDetectorIncludesNotes();
  console.log('mandatory-sales-schema-validation-tests: all passed');
}

main();
