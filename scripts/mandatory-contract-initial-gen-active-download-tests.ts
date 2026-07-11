/**
 * Testes obrigatórios — geração inicial, pagamento único futuro,
 * versão ativa e download (sem regenerar para nascer correto).
 *
 * npx tsx scripts/mandatory-contract-initial-gen-active-download-tests.ts
 */

import fs from 'node:fs';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildSvLotes2ClauseSegundaHtml } from '../lib/svLotes2ContractTerms';
import { buildSvLotes2ContractContext } from '../lib/svLotes2ContractContext';
import {
  assessGeneratedContractViability,
  assertGeneratedContractViable,
} from '../lib/contractGenerationGuard';
import {
  resolveSingleFuturePaymentDueDate,
  resolveSingleFuturePaymentDueDateFmt,
} from '../lib/resolveSingleFuturePaymentDueDate';
import {
  buildSaleContractPaymentSummaryHtml,
  resolveSaleContractPaymentBreakdown,
} from '../lib/saleContractPaymentSummary';
import { PAYMENT_TYPE_SINGLE_FUTURE } from '../lib/salePaymentMode';
import { formatContractDueDateLongBr } from '../lib/contractPaymentDates';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sale50 = {
  payment_type: PAYMENT_TYPE_SINGLE_FUTURE,
  total_value: 50,
  agreed_price: 50,
  lot_price: 50,
  discount: 0,
  down_payment: 0,
  installments_count: 1,
  sale_date: '2026-06-09',
  // Sem down_payment_due_date — fonte canônica é finance_receipts.
};

const receipts2032 = [
  {
    installment_number: 1,
    amount: 50,
    due_date: '2032-06-09',
    status: 'pendente',
  },
];

const blockOk = {
  block_name: '02',
  block: '02',
  number: 26,
  lot: '26',
  area: 1158.2,
};

const tenantPadrao = {
  id: 't1',
  name: 'SV TOPOGRAFIA E PROJETOS',
  contract_model: 'PADRAO',
  cnpj: '00.000.000/0001-00',
};

const tenantSv2 = {
  ...tenantPadrao,
  contract_model: 'SV_LOTES_2',
  sv_lotes_2_enabled: true,
};

const customer = {
  name: 'Cliente Homologacao',
  cpf_cnpj: '12345678901',
  document: '12345678901',
};

const project = {
  name: 'Projeto Teste',
  city: 'Goiania',
  uf: 'GO',
};

function testDueDateFromReceiptsNotEntryZero() {
  const withEntryNoise = [
    {
      installment_number: 0,
      amount: 0,
      due_date: '2026-01-01',
      status: 'pendente',
    },
    ...receipts2032,
  ];
  const raw = resolveSingleFuturePaymentDueDate({
    sale: sale50,
    financeReceipts: withEntryNoise,
  });
  assert(raw === '2032-06-09', `due from principal receipt, got ${raw}`);
  const fmt = resolveSingleFuturePaymentDueDateFmt({
    sale: sale50,
    financeReceipts: withEntryNoise,
  });
  assert(fmt.fmt === '09/06/2032', `fmt BR got ${fmt.fmt}`);
  assert(
    fmt.longFmt === '9 de junho de 2032',
    `longFmt got ${fmt.longFmt}`,
  );
  console.log('OK testDueDateFromReceiptsNotEntryZero');
}

function testInitialGenerationHasValues() {
  const html = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project,
    block: blockOk,
    sale: { ...sale50, finance_receipts: receipts2032 },
    financeReceipts: receipts2032,
  });
  assert(/R\$\s*50,00/.test(html), 'valor R$ 50,00 na 1ª versão');
  assert(/R\$\s*50,00/.test(html), 'valor presente (não só zeros)');
  assert(/02|quadra/i.test(html), 'quadra presente');
  assert(/26/.test(html), 'lote 26 presente');
  assert(/1\.158,20|1158,20/i.test(html), 'área presente');
  assert(/09\/06\/2032|9 de junho de 2032/i.test(html), 'vencimento presente');
  assert(!/vencimento em\s*<strong>—<\/strong>/i.test(html), 'sem vencimento em —');
  assert(!/vencimento em —/i.test(html), 'sem travessão na cláusula');

  const viability = assessGeneratedContractViability({
    html,
    sale: sale50,
    block: blockOk,
    receiptsSum: 50,
  });
  assert(viability.ok, `viability: ${viability.reasons.join('; ')}`);
  assertGeneratedContractViable(viability);
  console.log('OK testInitialGenerationHasValues');
}

function testSingleFutureClauseAndQuadroSameDate() {
  const due = resolveSingleFuturePaymentDueDateFmt({
    sale: sale50,
    financeReceipts: receipts2032,
  });
  const breakdown = resolveSaleContractPaymentBreakdown(sale50, {
    financeReceipts: receipts2032,
  });
  assert(
    breakdown.singlePaymentDueRaw === '2032-06-09',
    'breakdown raw = receipt',
  );
  assert(breakdown.singlePaymentDueFmt === '09/06/2032', 'quadro fmt');
  assert(
    breakdown.singlePaymentDueLongFmt === due.longFmt,
    'quadro e cláusula compartilham longFmt',
  );

  const summary = buildSaleContractPaymentSummaryHtml(breakdown);
  assert(summary.includes('09/06/2032'), 'quadro com data');
  assert(
    summary.includes('Pagamento único com vencimento futuro'),
    'modalidade no quadro',
  );
  assert(summary.includes('Data de vencimento'), 'rótulo Data de vencimento');
  assert(!summary.includes('Entrada'), 'sem Entrada no único futuro');
  assert(!summary.includes('Saldo'), 'sem Saldo no único futuro');
  assert(!summary.includes('Parcela base'), 'sem Parcela base');
  assert(!summary.includes('Parcelamento'), 'sem título Parcelamento');
  assert(!summary.includes('Primeiro vencimento'), 'sem Primeiro vencimento');

  const ctx = buildSvLotes2ContractContext({
    tenant: tenantSv2,
    customer,
    project,
    block: blockOk,
    sale: { ...sale50, finance_receipts: receipts2032 },
    financeReceipts: receipts2032,
  });
  const finance = String(ctx.balloonFinanceHtml || '');
  assert(finance.includes('Data de vencimento'), 'SV2 quadro Data de vencimento');
  assert(finance.includes('09/06/2032'), 'SV2 quadro data');
  assert(!finance.includes('>Entrada<') && !/finance-label">Entrada/i.test(finance), 'SV2 sem Entrada');
  assert(!/Saldo financiado/i.test(finance), 'SV2 sem Saldo financiado');
  assert(!/Parcela base/i.test(finance), 'SV2 sem Parcela base');
  assert(!/>Parcelamento</i.test(finance) && !/finance-label">Parcelamento/i.test(finance), 'SV2 sem Parcelamento');
  assert(!/Primeiro vencimento/i.test(finance), 'SV2 sem Primeiro vencimento');

  const clause = buildSvLotes2ClauseSegundaHtml(ctx);
  assert(clause.includes('pagamento único'), 'cláusula pagamento único');
  assert(clause.includes(due.longFmt), `cláusula com ${due.longFmt}`);
  assert(!clause.includes('vencimento em <strong>—</strong>'), 'sem —');
  assert(!/na data da assinatura/i.test(clause), 'sem quitação na assinatura');
  assert(
    /somente será concedida após a efetiva confirmação/i.test(clause),
    'quitação após confirmação',
  );

  const { buildSvLotes2ClausesHtml } = require('../lib/svLotes2ContractClauses');
  const allClauses = buildSvLotes2ClausesHtml(ctx);
  assert(
    allClauses.includes('atraso no pagamento do valor na data de vencimento'),
    'inadimplência adaptada ao pagamento único',
  );
  assert(
    !allClauses.includes('atraso no pagamento de qualquer parcela'),
    'inadimplência sem referência a parcela',
  );
  console.log('OK testSingleFutureClauseAndQuadroSameDate');
}

function testGuardBlocksZeroedActive() {
  const bad = assessGeneratedContractViability({
    html: '<p>R$ 0,00</p>',
    sale: { total_value: 50 },
    block: { block_name: '', number: '' },
  });
  assert(!bad.ok, 'deve falhar');
  assert(bad.reasons.length >= 1, 'tem razões');
  let threw = false;
  try {
    assertGeneratedContractViable(bad);
  } catch {
    threw = true;
  }
  assert(threw, 'assert lança erro');
  console.log('OK testGuardBlocksZeroedActive');
}

function testCreateUsesFreshLoader() {
  const create = fs.readFileSync('lib/gisSaleCreateService.ts', 'utf8');
  assert(
    create.includes('buildFreshSaleContractHtml'),
    'criação usa loader da regeneração',
  );
  assert(
    create.includes('assessGeneratedContractViability'),
    'criação valida viabilidade',
  );
  assert(
    !create.includes('generateContractHTML({'),
    'criação não monta HTML com payload parcial local',
  );
  console.log('OK testCreateUsesFreshLoader');
}

function testViewAndRegenShareLoader() {
  const view = fs.readFileSync('lib/buildContractViewHtml.ts', 'utf8');
  assert(
    view.includes('buildFreshSaleContractHtml'),
    'preview/rebuild usa buildFreshSaleContractHtml',
  );
  const regen = fs.readFileSync('lib/contractRegeneration.ts', 'utf8');
  assert(
    regen.includes('assessGeneratedContractViability'),
    'regeneração bloqueia versão inviável',
  );
  assert(
    regen.includes('is_current: true'),
    'nova versão marcada is_current',
  );
  assert(
    regen.includes("status: 'superseded'"),
    'anterior superseded',
  );
  console.log('OK testViewAndRegenShareLoader');
}

function testDownloadUsesActiveSavedHtml() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const baixarStart = page.indexOf('const handleBaixarPDF');
  const baixarEnd = page.indexOf('const handleImprimir');
  assert(baixarStart > 0 && baixarEnd > baixarStart, 'handlers encontrados');
  const baixar = page.slice(baixarStart, baixarEnd);
  assert(
    baixar.includes('needs_regenerar'),
    'Baixar PDF só refresh com needs_regenerar',
  );
  assert(
    !baixar.includes('refresh: true'),
    'Baixar PDF não força refresh cego',
  );

  const imprimirStart = page.indexOf('const handleImprimir');
  const imprimir = page.slice(imprimirStart, imprimirStart + 900);
  assert(
    !imprimir.includes('refresh: true'),
    'Imprimir não força refresh cego',
  );

  const hist = page.indexOf('const handleDownloadVersion');
  const histBody = page.slice(hist, baixarStart);
  assert(
    histBody.includes('ver.generated_html'),
    'histórico baixa HTML da versão selecionada',
  );
  console.log('OK testDownloadUsesActiveSavedHtml');
}

function testRegressionsImmediateInstallmentModels() {
  const cashHtml = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project,
    block: blockOk,
    sale: {
      payment_type: 'À vista',
      total_value: 100,
      agreed_price: 100,
      down_payment: 0,
      installments_count: 1,
      sale_date: '2026-07-01',
    },
    financeReceipts: [
      {
        installment_number: 1,
        amount: 100,
        due_date: '2026-07-01',
        status: 'pago',
      },
    ],
  });
  assert(/R\$\s*100,00/.test(cashHtml), 'à vista imediato com valor');

  const instHtml = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project,
    block: blockOk,
    sale: {
      payment_type: 'Parcelado',
      total_value: 1200,
      agreed_price: 1200,
      down_payment: 0,
      installments_count: 12,
      sale_date: '2026-07-01',
    },
    financeReceipts: Array.from({ length: 12 }, (_, i) => ({
      installment_number: i + 1,
      amount: 100,
      due_date: `2026-${String(((i % 12) + 1)).padStart(2, '0')}-10`,
      status: 'pendente',
    })),
  });
  assert(/R\$\s*1\.200,00|1200/.test(instHtml), 'parcelado');

  const long = formatContractDueDateLongBr('2032-06-09');
  assert(long === '9 de junho de 2032', `extenso: ${long}`);
  console.log('OK testRegressionsImmediateInstallmentModels');
}

function main() {
  testDueDateFromReceiptsNotEntryZero();
  testInitialGenerationHasValues();
  testSingleFutureClauseAndQuadroSameDate();
  testGuardBlocksZeroedActive();
  testCreateUsesFreshLoader();
  testViewAndRegenShareLoader();
  testDownloadUsesActiveSavedHtml();
  testRegressionsImmediateInstallmentModels();
  console.log(
    'ALL mandatory-contract-initial-gen-active-download-tests PASSED',
  );
}

main();
