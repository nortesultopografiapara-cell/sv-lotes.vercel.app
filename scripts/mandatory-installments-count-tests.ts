/**
 * SVL-CRM-028 / Etapa 10 — quantidade de parcelas (limite produto = 300).
 * npx tsx scripts/mandatory-installments-count-tests.ts
 */

import {
  INSTALLMENTS_MAX,
  MAX_SALE_INSTALLMENTS,
  buildInstallmentsOptions,
  filterInstallmentsOptions,
  sanitizeInstallmentsInput,
  validateInstallmentsCount,
} from '../lib/installmentsCount';
import { parseSaleInstallmentsCount } from '../lib/imports/modules/sales/normalize';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import { splitInstallmentAmounts } from '../lib/saleInstallmentCalc';
import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSanitizeAllowsEmpty() {
  assert(sanitizeInstallmentsInput('') === '', 'empty');
  assert(sanitizeInstallmentsInput('48a') === '48', 'digits only');
  console.log('OK testSanitizeAllowsEmpty');
}

function testValidateEmpty() {
  const result = validateInstallmentsCount('');
  assert(!result.valid, 'invalid');
  assert(result.message === 'Informe a quantidade de parcelas.', 'message');
  console.log('OK testValidateEmpty');
}

function testValidate48() {
  const result = validateInstallmentsCount('48');
  assert(result.valid, 'valid');
  assert(result.value === 48, 'value');
  console.log('OK testValidate48');
}

function testValidate160StillAccepted() {
  const result = validateInstallmentsCount('160');
  assert(result.valid, 'valid');
  assert(result.value === 160, 'value');
  console.log('OK testValidate160StillAccepted');
}

function testValidate220() {
  const result = validateInstallmentsCount('220');
  assert(result.valid, '220 aceita');
  assert(result.value === 220, 'value');
  console.log('OK testValidate220');
}

function testValidate300() {
  const result = validateInstallmentsCount('300');
  assert(result.valid, '300 aceita');
  assert(result.value === 300, 'value');
  console.log('OK testValidate300');
}

function testValidate301Rejected() {
  const result = validateInstallmentsCount('301');
  assert(!result.valid, '301 rejeita');
  assert(
    result.message === `Quantidade máxima: ${INSTALLMENTS_MAX} parcelas.`,
    'message',
  );
  console.log('OK testValidate301Rejected');
}

function testValidateMinBlocked() {
  const result = validateInstallmentsCount('0');
  assert(!result.valid, 'invalid');
  assert(result.message === 'Quantidade mínima: 1 parcela.', 'message');
  console.log('OK testValidateMinBlocked');
}

function testOptionsRange() {
  assert(MAX_SALE_INSTALLMENTS === 300, 'MAX_SALE_INSTALLMENTS');
  assert(INSTALLMENTS_MAX === MAX_SALE_INSTALLMENTS, 'alias');
  const options = buildInstallmentsOptions();
  assert(options.length === 300, `count ${options.length}`);
  assert(options[0] === '1', 'first');
  assert(options[159] === '160', '160 still present');
  assert(options[219] === '220', '220 present');
  assert(options[299] === '300', 'last');
  console.log('OK testOptionsRange');
}

function testFilterOptions() {
  const filtered = filterInstallmentsOptions('4');
  assert(filtered.includes('4'), 'exact');
  assert(filtered.includes('48'), 'prefix');
  assert(!filtered.includes('3'), 'no mismatch');
  assert(!filtered.includes('220'), '220 não começa com 4');
  const filtered2 = filterInstallmentsOptions('22');
  assert(filtered2.includes('22'), '22');
  assert(filtered2.includes('220'), '220');
  assert(filtered2.includes('221'), '221');
  console.log('OK testFilterOptions');
}

function testImportNormalizeUsesCentralMax() {
  assert(parseSaleInstallmentsCount('220') === 220, 'import 220');
  assert(parseSaleInstallmentsCount('300') === 300, 'import 300');
  assert(parseSaleInstallmentsCount('500') === 300, 'import cap 300');
  console.log('OK testImportNormalizeUsesCentralMax');
}

function baseInstallmentForm(count: number): LotFormConfirmPayload {
  return {
    payment_type: 'Parcelado',
    installments_count: String(count),
    final_value: 300_000,
    down_payment: '0',
    down_payment_due_date: '',
    first_installment_due_date: '2026-09-01',
    installment_correction_type: 'IGPM',
  } as LotFormConfirmPayload;
}

function assertSchedule(count: number) {
  const t0 = Date.now();
  const payloads = buildSaleEditFinancePayloads(
    'tenant-t',
    'sale-s',
    'cust-c',
    null,
    { id: 'lot-l', project_id: 'proj-p' },
    baseInstallmentForm(count),
    { contractModel: 'ARAGUAIA' },
  );
  const ms = Date.now() - t0;

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === count, `${count}: gerou ${monthly.length}`);

  const numbers = monthly.map((p) => Number(p.installment_number));
  assert(numbers[0] === 1, `${count}: primeira = 1`);
  assert(numbers[count - 1] === count, `${count}: última = ${count}`);
  assert(
    new Set(numbers).size === count,
    `${count}: sem duplicatas de número`,
  );

  const amounts = monthly.map((p) => Number(p.amount));
  const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  assert(sum === 300_000, `${count}: soma ${sum}`);

  const expectedSplit = splitInstallmentAmounts(300_000, count);
  assert(
    amounts.every((a, i) => a === expectedSplit[i]),
    `${count}: valores = splitInstallmentAmounts`,
  );

  const dues = monthly.map((p) => String(p.due_date));
  assert(dues[0] === '2026-09-01', `${count}: 1º vencimento`);
  for (let i = 1; i < dues.length; i++) {
    const prev = new Date(`${dues[i - 1]}T12:00:00`);
    const cur = new Date(`${dues[i]}T12:00:00`);
    const diffDays = (cur.getTime() - prev.getTime()) / (24 * 3600 * 1000);
    assert(
      diffDays >= 28 && diffDays <= 31,
      `${count}: vencimento ${i} sequencial (${dues[i - 1]} → ${dues[i]}, ${diffDays}d)`,
    );
  }

  console.log(
    `OK schedule ${count}: ${ms}ms, 1ª=${dues[0]}, última=${dues[count - 1]}, soma=${sum}`,
  );
  return { ms, payloads: monthly };
}

function testSchedules160_220_300() {
  const r160 = assertSchedule(160);
  const r220 = assertSchedule(220);
  const r300 = assertSchedule(300);
  // Diagnóstico: payload em memória é rápido; insert real ainda é 1x1 no GIS create.
  assert(r160.ms < 5_000, '160 geração payload < 5s');
  assert(r220.ms < 5_000, '220 geração payload < 5s');
  assert(r300.ms < 5_000, '300 geração payload < 5s');
  console.log('OK testSchedules160_220_300', {
    ms160: r160.ms,
    ms220: r220.ms,
    ms300: r300.ms,
  });
}

function testNoHardcoded160InCentralModule() {
  // Garante que a mensagem e o max vêm da constante (300).
  const blocked = validateInstallmentsCount('161');
  assert(blocked.valid, '161 agora aceito (era o antigo teto+1)');
  assert(blocked.value === 161, '161 value');
  console.log('OK testNoHardcoded160InCentralModule');
}

function testContractWritesParcelCount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateContractHTML } = require('../lib/contractTemplate') as {
    generateContractHTML: (input: Record<string, unknown>) => string;
  };
  const tenant = {
    contract_model: 'ARAGUAIA',
    name: 'S.V TOPOGRAFIA E PROJETO LTDA',
    cnpj: '12345678000190',
    address: 'Rua T',
    city: 'Parauapebas',
    state: 'PA',
    legal_representative: 'JOAO',
    representative_cpf: '39053344705',
  };
  const customer = {
    name: 'Cliente',
    cpf_cnpj: '11144477735',
    nationality: 'Brasileira',
    civil_state: 'Solteiro',
    profession: 'Comerciante',
    email: 'a@b.com',
    phone: '94',
    address: 'Rua A',
    city: 'Parauapebas',
    state: 'PA',
  };
  const project = {
    name: 'Araguaia',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: 'ARAGUAIA',
  };
  const block = {
    id: 'b1',
    number: '1',
    block_name: '01',
    area: 1000,
    frente: 20,
    fundo: 20,
    'Lado Dir.': 50,
    'Lado Esq.': 50,
  };

  for (const n of [220, 300] as const) {
    const html = generateContractHTML({
      tenant,
      customer,
      project,
      block,
      sale: {
        total_value: 300000,
        down_payment: 0,
        installments_count: n,
        installment_value: 300000 / n,
        payment_type: 'Parcelado',
        installment_correction_type: 'IGPM',
        sale_date: '2026-08-21',
        first_installment_due_date: '2026-09-01',
      },
      financeReceipts: Array.from({ length: Math.min(n, 3) }, (_, i) => ({
        installment_number: i + 1,
        amount: Math.round((300000 / n) * 100) / 100,
        due_date: '2026-09-01',
      })),
    });
    // ARAGUAIA: <strong>220</strong> (duzentos e vinte) parcelas
    assert(
      html.includes(`>${n}</strong>`) || html.includes(String(n)),
      `contrato contém ${n}`,
    );
    assert(/parcelas/i.test(html), `contrato menciona parcelas (${n})`);
    if (n === 220) {
      assert(/duzentos\s+e\s+vinte/i.test(html), '220 por extenso');
    }
    if (n === 300) {
      assert(/trezentos/i.test(html), '300 por extenso');
    }
  }
  console.log('OK testContractWritesParcelCount');
}

function main() {
  testSanitizeAllowsEmpty();
  testValidateEmpty();
  testValidate48();
  testValidate160StillAccepted();
  testValidate220();
  testValidate300();
  testValidate301Rejected();
  testValidateMinBlocked();
  testOptionsRange();
  testFilterOptions();
  testImportNormalizeUsesCentralMax();
  testNoHardcoded160InCentralModule();
  testSchedules160_220_300();
  testContractWritesParcelCount();
  console.log('mandatory-installments-count-tests: all passed');
}

main();
