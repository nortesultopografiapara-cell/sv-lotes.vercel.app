/**
 * Desconto e correção de parcelas — formulário padrão (não Recanto Primavera).
 * npx tsx scripts/mandatory-sale-discount-correction-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import { generateSvLotes2Contract } from '../lib/svLotes2ContractTemplate';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  formatInstallmentCorrectionLabel,
  normalizeInstallmentCorrectionType,
} from '../lib/installmentCorrectionType';
import {
  buildSaleEditFinancePayloads,
  type FinanceReceiptPayload,
} from '../lib/saleEditFinanceRecalc';
import {
  computeInstallmentDisplayValue,
  resolveInstallmentPrincipal,
} from '../lib/saleInstallmentCalc';
import {
  buildOfficialSalesUpdatePatch,
  SALES_OFFICIAL_UPDATE_FIELDS,
} from '../lib/salesWriteSchema';
import { resolveSaleContractPaymentBreakdown } from '../lib/saleContractPaymentSummary';
import fs from 'fs';
import path from 'path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const tenantPadrao = {
  name: 'Meneses Imobiliária',
  cnpj: '12345678000199',
  city: 'Parauapebas',
  state: 'PA',
  address: 'Rua A, 100',
  zip_code: '68515000',
  contract_model: 'PADRAO',
};

const tenantSv2 = { ...tenantPadrao, contract_model: 'SV_LOTES_2' };

const tenantRecanto = {
  ...tenantPadrao,
  name: 'RECANTO PRIMAVERA',
  contract_model: 'RECANTO_PRIMAVERA',
};

const customer = {
  name: 'JOÃO DA SILVA',
  document: '12345678901',
  cpf: '12345678901',
  profession: 'Engenheiro',
  civil_state: 'Solteiro',
  address: 'Rua B, 20',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state_uf: 'PA',
  zip_code: '68515000',
  rg: '1234567',
};

const block = { block_name: 'A', number: '12', area: 300 };

function parcelAmounts(payloads: FinanceReceiptPayload[]): number[] {
  return payloads
    .filter((item) => Number(item.installment_number) >= 1)
    .map((item) => Number(item.amount));
}

function testInstallmentsWithDiscount() {
  const saleForm = {
    payment_type: 'Parcelado',
    discount_value: '5000',
    down_payment: '0',
    installments_count: '10',
    first_installment_due_date: '2026-08-01',
    down_payment_due_date: '',
    final_value: 80000,
    lot_value: 85000,
    installment_correction_type: 'IPCA',
  };

  const principal = resolveInstallmentPrincipal({
    totalValue: 80000,
    downPayment: 0,
    contractModel: 'PADRAO',
  });
  assert(principal === 80000, 'parcelas devem usar lote - desconto - entrada');

  const display = computeInstallmentDisplayValue({
    finalValue: 80000,
    downPayment: 0,
    installmentsCount: 10,
    contractModel: 'PADRAO',
  });
  assert(display === 8000, `parcela esperada 8000, obtida ${display}`);

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    { id: 'block-1', project_id: 'proj-1' },
    saleForm as never,
    { contractModel: 'PADRAO' },
  );
  const amounts = parcelAmounts(payloads);
  assert(amounts.length === 10, '10 parcelas geradas');
  assert(
    Math.abs(amounts.reduce((sum, value) => sum + value, 0) - 80000) < 0.05,
    'soma das parcelas deve ser 80.000',
  );

  console.log('OK testInstallmentsWithDiscount');
}

function testZeroDiscountPreservesLegacyBehavior() {
  const principal = resolveInstallmentPrincipal({
    totalValue: 85000,
    downPayment: 5000,
    contractModel: 'PADRAO',
  });
  assert(principal === 80000, 'comportamento legado com desconto 0');

  const display = computeInstallmentDisplayValue({
    finalValue: 85000,
    downPayment: 5000,
    installmentsCount: 10,
    contractModel: 'PADRAO',
  });
  assert(display === 8000, 'parcela legado 8000');

  console.log('OK testZeroDiscountPreservesLegacyBehavior');
}

function testStandardContractShowsPaymentBreakdown() {
  const sale = {
    lot_price: 85000,
    discount: 5000,
    total_value: 80000,
    down_payment: 0,
    installments_count: 10,
    payment_type: 'Parcelado',
    installment_correction_type: 'IPCA',
  };

  const padraoHtml = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project: { name: 'Projeto Teste', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractSnapshot: { contract_number: '000000001/2026' },
  });

  assert(padraoHtml.includes('Valor do lote'), 'contrato padrão exibe valor do lote');
  assert(padraoHtml.includes('Desconto concedido'), 'contrato padrão exibe desconto');
  assert(padraoHtml.includes('Saldo parcelado'), 'contrato padrão exibe saldo parcelado');
  assert(padraoHtml.includes('Correção das parcelas'), 'contrato padrão exibe correção');
  assert(padraoHtml.includes('IPCA'), 'contrato padrão exibe IPCA');

  const sv2Html = generateSvLotes2Contract({
    tenant: tenantSv2,
    customer,
    project: { name: 'Projeto Teste', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractSnapshot: { contract_number: '000000002/2026' },
  });

  assert(sv2Html.includes('VALOR DO LOTE'), 'SV2 exibe valor do lote');
  assert(sv2Html.includes('DESCONTO'), 'SV2 exibe desconto');
  assert(sv2Html.includes('CORREÇÃO'), 'SV2 exibe correção');

  const breakdown = resolveSaleContractPaymentBreakdown(sale, { isCashPayment: false });
  assert(breakdown.discountAmount === 5000, 'breakdown desconto 5000');
  assert(breakdown.installmentBalance === 80000, 'breakdown saldo 80000');
  assert(breakdown.correctionLabel === 'IPCA', 'breakdown correção IPCA');

  console.log('OK testStandardContractShowsPaymentBreakdown');
}

function testRecantoPrimaveraUnchanged() {
  const sale = {
    lot_price: 85000,
    discount: 0,
    total_value: 85000,
    down_payment: 10000,
    installments_count: 10,
    payment_type: 'Parcelado',
    installment_correction_type: 'IPCA',
  };

  const html = generateRecantoPrimaveraContract({
    tenant: tenantRecanto,
    customer,
    project: { name: 'Recanto', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractSnapshot: { contract_number: '000000003/2026' },
  });

  assert(!html.includes('Correção das parcelas'), 'Recanto sem correção de parcelas');
  assert(!html.includes('Desconto concedido'), 'Recanto sem quadro de desconto padrão');
  assert(html.includes('SINAL') || html.toLowerCase().includes('sinal'), 'Recanto mantém SINAL');

  const principal = resolveInstallmentPrincipal({
    totalValue: 85000,
    downPayment: 10000,
    contractModel: 'RECANTO_PRIMAVERA',
  });
  assert(principal === 85000, 'Recanto: sinal não abate parcelas');

  console.log('OK testRecantoPrimaveraUnchanged');
}

function testLegacySalesDefaultValues() {
  assert(
    normalizeInstallmentCorrectionType(undefined) === DEFAULT_INSTALLMENT_CORRECTION_TYPE,
    'venda antiga assume FIXED',
  );
  assert(formatInstallmentCorrectionLabel(null) === 'Parcelas fixas', 'label FIXED legado');

  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'cust-1',
    agreedPrice: 80000,
    lotPrice: 85000,
    discount: 0,
    totalValue: 80000,
    paymentType: 'Parcelado',
    downPayment: 0,
    installmentsCount: 10,
    brokerId: null,
  });
  assert(patch.installment_correction_type === 'FIXED', 'patch default FIXED');

  console.log('OK testLegacySalesDefaultValues');
}

function testMigrationFile() {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260823120000_sales_installment_correction_type.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert(sql.includes('installment_correction_type'), 'migration cria installment_correction_type');
  assert(sql.includes("DEFAULT 'FIXED'"), 'migration default FIXED');
  console.log('OK testMigrationFile');
}

function testSchemaIncludesCorrectionField() {
  assert(
    SALES_OFFICIAL_UPDATE_FIELDS.includes('installment_correction_type'),
    'schema oficial inclui installment_correction_type',
  );
  console.log('OK testSchemaIncludesCorrectionField');
}

function main() {
  testInstallmentsWithDiscount();
  testZeroDiscountPreservesLegacyBehavior();
  testStandardContractShowsPaymentBreakdown();
  testRecantoPrimaveraUnchanged();
  testLegacySalesDefaultValues();
  testMigrationFile();
  testSchemaIncludesCorrectionField();
  console.log('\nTodos os testes de desconto/correção passaram.');
}

main();
