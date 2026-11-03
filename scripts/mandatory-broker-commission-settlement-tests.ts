/**
 * Baixa global de comissão: PENDENTE → uma saída vinculada → recibo.
 * npx tsx scripts/mandatory-broker-commission-settlement-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isPendingBrokerCommission,
  isPaidBrokerCommission,
} from '../lib/brokerCommission';
import {
  buildCommissionCashMovementPayload,
  buildCommissionPaymentDescription,
  cashMovementSettlesCommission,
  COMMISSION_CASH_CATEGORY,
  COMMISSION_SETTLEMENT_FORBIDDEN_COLUMNS,
  normalizeCommissionPaymentMethod,
  pendingCommissionCreatesPaidCash,
  resolveCommissionCashFlowDisplay,
  shouldSkipDuplicateCommissionSettlement,
  assertCommissionTenantScope,
} from '../lib/brokerCommissionSettlement';
import {
  buildCashFlowItems,
  flowDisplayLabel,
} from '../lib/financeCashFlow';
import { buildNormalizedExpenseReceiptItem } from '../lib/expenseReceiptPdf';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

const GIRLENE_LINKS = {
  tenantId: 'tenant-lf',
  commissionId: 'comm-aezio-girlene',
  saleId: 'sale-girlene',
  brokerId: 'broker-aezio',
  customerId: 'cust-girlene',
  projectId: 'proj-estrela',
  contractId: 'ct-000000002',
  blockId: 'block-qd01-lt36',
  brokerName: 'AEZIO DA CONCEIÇÃO DA SILVA',
  brokerDocument: '00000000000',
  customerName: 'GIRLENE ALVES RODRIGUES',
  projectName: 'CHACREAMENTO ESTRELA DO SUL',
  contractNumber: '000000002/2026',
  locationLabel: 'QD 01 • LT 36',
  amount: 1000,
  paymentMethod: 'PIX',
  paidAt: '2026-10-04T12:00:00.000Z',
  userId: 'user-admin',
};

function testSaleCreatesPendingOnly() {
  assert(isPendingBrokerCommission('pendente') === true, 'status inicial pendente');
  assert(pendingCommissionCreatesPaidCash('pendente') === false, 'pendente não é saída paga');
  assert(isPaidBrokerCommission('pendente') === false, 'pendente ≠ pago');
  console.log('OK testSaleCreatesPendingOnly');
}

function testPendingDoesNotCreateCashItem() {
  const items = buildCashFlowItems(
    [],
    [],
    [
      {
        id: GIRLENE_LINKS.commissionId,
        sale_id: GIRLENE_LINKS.saleId,
        broker_id: GIRLENE_LINKS.brokerId,
        amount: 1000,
        status: 'pendente',
      },
    ],
  );
  assert(items.length === 0, 'comissão pendente não entra no fluxo como saída');
  console.log('OK testPendingDoesNotCreateCashItem');
}

function testSettlementCreatesOneLinkedCash() {
  const payload = buildCommissionCashMovementPayload(GIRLENE_LINKS);
  assert(payload.type === 'saida', 'tipo saída');
  assert(payload.category === COMMISSION_CASH_CATEGORY, 'categoria Comissão');
  assert(payload.amount === 1000, 'valor 1000');
  assert(payload.sale_id === GIRLENE_LINKS.saleId, 'sale_id');
  assert(payload.customer_id === GIRLENE_LINKS.customerId, 'customer_id');
  assert(payload.contract_id === GIRLENE_LINKS.contractId, 'contract_id');
  assert(payload.project_id === GIRLENE_LINKS.projectId, 'project_id');
  const md = payload.metadata as Record<string, string>;
  assert(md.commission_id === GIRLENE_LINKS.commissionId, 'metadata.commission_id');
  assert(md.broker_id === GIRLENE_LINKS.brokerId, 'metadata.broker_id');
  assert(md.payment_method === 'PIX', 'forma de pagamento');
  for (const col of COMMISSION_SETTLEMENT_FORBIDDEN_COLUMNS) {
    assert(!(col in payload), `não grava coluna quebrada ${col}`);
  }
  console.log('OK testSettlementCreatesOneLinkedCash');
}

function testModalResolvesGirleneLinks() {
  const display = resolveCommissionCashFlowDisplay(GIRLENE_LINKS);
  assert(display.category === 'Comissão', 'categoria');
  assert(
    display.description === 'Pagamento de comissão — AEZIO DA CONCEIÇÃO DA SILVA',
    `descrição: ${display.description}`,
  );
  assert(display.beneficiary === 'AEZIO DA CONCEIÇÃO DA SILVA', 'beneficiário');
  assert(display.customerName === 'GIRLENE ALVES RODRIGUES', 'cliente');
  assert(display.projectName === 'CHACREAMENTO ESTRELA DO SUL', 'projeto');
  assert(display.contractNumber.includes('000000002/2026'), 'contrato');
  assert(display.locationLabel.includes('01') && display.locationLabel.includes('36'), 'quadra/lote');
  assert(display.amount === 1000, 'valor');
  assert(display.paymentMethod === 'PIX', 'forma');
  assert(display.isManual === false, 'não é lançamento manual');
  console.log('OK testModalResolvesGirleneLinks');
}

function testCashFlowAndReceiptShareLinks() {
  const payload = buildCommissionCashMovementPayload(GIRLENE_LINKS);
  const items = buildCashFlowItems(
    [],
    [
      {
        id: 'cash-1',
        type: 'saida',
        status: 'ativo',
        category: 'Comissão',
        description: payload.description,
        amount: 1000,
        sale_id: payload.sale_id,
        contract_id: payload.contract_id,
        customer_id: payload.customer_id,
        project_id: payload.project_id,
        movement_date: '2026-10-04',
        metadata: payload.metadata,
        customers: { name: 'GIRLENE ALVES RODRIGUES' },
        projects: { name: 'CHACREAMENTO ESTRELA DO SUL' },
        contracts: { id: 'ct-000000002', contract_number: '000000002/2026' },
        sales: {
          blocks: { block_name: '01', lot_number: '36' },
        },
      },
    ],
    [
      {
        id: GIRLENE_LINKS.commissionId,
        sale_id: GIRLENE_LINKS.saleId,
        broker_id: GIRLENE_LINKS.brokerId,
        amount: 1000,
        status: 'pago',
        paid_at: '2026-10-04T12:00:00.000Z',
        brokers: { name: 'AEZIO DA CONCEIÇÃO DA SILVA' },
      },
    ],
  );
  const saidas = items.filter((i) => i.tipo === 'saida');
  assert(saidas.length === 1, `exatamente uma saída, got ${saidas.length}`);
  const item = saidas[0];
  assert(item.saleId === GIRLENE_LINKS.saleId, 'saída vinculada à venda');
  assert(item.commissionId === GIRLENE_LINKS.commissionId, 'saída vinculada à comissão');
  assert(item.brokerId === GIRLENE_LINKS.brokerId, 'saída vinculada ao corretor');
  assert(item.isManual === false, 'saída não é manual');
  assert(item.customerName === 'GIRLENE ALVES RODRIGUES', 'modal cliente');
  assert(item.projectName === 'CHACREAMENTO ESTRELA DO SUL', 'modal projeto');
  assert(String(item.contractNumber).includes('000000002'), 'modal contrato');
  assert(item.payment_method === 'PIX', 'forma no fluxo');

  const receipt = buildNormalizedExpenseReceiptItem(item);
  assert(receipt.customer_name === 'GIRLENE ALVES RODRIGUES', 'recibo cliente');
  assert(receipt.project_name === 'CHACREAMENTO ESTRELA DO SUL', 'recibo projeto');
  assert(String(receipt.contract_number).includes('000000002'), 'recibo contrato');
  assert(receipt.broker_name === 'AEZIO DA CONCEIÇÃO DA SILVA', 'recibo beneficiário');
  assert(receipt.payment_method === 'PIX', 'recibo forma de pagamento');
  assert(receipt.block_label.includes('01'), 'recibo quadra/lote');
  console.log('OK testCashFlowAndReceiptShareLinks');
}

function testDuplicateSettlementBlocked() {
  const existing = [
    {
      type: 'saida',
      status: 'ativo',
      amount: 1000,
      sale_id: GIRLENE_LINKS.saleId,
      metadata: { commission_id: GIRLENE_LINKS.commissionId },
    },
  ];
  assert(
    shouldSkipDuplicateCommissionSettlement({
      existingCash: existing,
      commission: {
        id: GIRLENE_LINKS.commissionId,
        sale_id: GIRLENE_LINKS.saleId,
        amount: 1000,
      },
    }) === true,
    'segunda baixa da mesma comissão é bloqueada',
  );
  assert(
    cashMovementSettlesCommission(existing[0], {
      id: 'outra-comissao',
      sale_id: GIRLENE_LINKS.saleId,
      amount: 1000,
    }) === false,
    'não bloqueia outra comissão só por valor',
  );
  console.log('OK testDuplicateSettlementBlocked');
}

function testReverseKeepsCommissionLink() {
  const page = read('app/finance/page.tsx');
  assert(
    page.includes("from('broker_commissions')") &&
      page.includes("status: 'pendente'") &&
      page.includes('item.cashMovementId'),
    'estorno da saída de caixa devolve a comissão para pendente',
  );
  console.log('OK testReverseKeepsCommissionLink');
}

function testSaleWithoutBrokerDoesNotCreateCommission() {
  const create = read('lib/gisSaleCreateService.ts');
  assert(
    create.includes('if (brokerId && saleId)'),
    'create só insere comissão quando há corretor',
  );
  assert(
    create.includes("status: 'pendente'"),
    'create grava comissão pendente',
  );
  console.log('OK testSaleWithoutBrokerDoesNotCreateCommission');
}

function testTenantIsolationAndGlobalScope() {
  let threw = false;
  try {
    assertCommissionTenantScope({
      actorTenantId: 'tenant-a',
      rowTenantId: 'tenant-b',
      rowCompanyId: 'tenant-b',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'bloqueia comissão de outro tenant');
  assertCommissionTenantScope({
    actorTenantId: 'tenant-a',
    rowTenantId: 'tenant-a',
    rowCompanyId: 'tenant-a',
  });
  const brokers = read('app/dashboard/brokers/page.tsx');
  assert(
    brokers.includes('settlePendingBrokerCommissions'),
    'baixa global usa o serviço, não regra LF',
  );
  assert(
    !brokers.includes('broker_commission_id: comm.id'),
    'baixa não grava coluna inexistente broker_commission_id',
  );
  assert(
    !read('lib/brokerCommissionSettlement.ts').includes('ESTRELA_DO_SUL'),
    'settle não é específico de modelo de contrato',
  );
  console.log('OK testTenantIsolationAndGlobalScope');
}

function testPaymentMethodNormalized() {
  assert(normalizeCommissionPaymentMethod('pix') === 'PIX', 'pix');
  assert(normalizeCommissionPaymentMethod('Dinheiro') === 'Dinheiro', 'dinheiro');
  assert(
    buildCommissionPaymentDescription('AEZIO DA CONCEIÇÃO DA SILVA').includes('AEZIO'),
    'descrição com beneficiário',
  );
  console.log('OK testPaymentMethodNormalized');
}

function testLinkedEmptyIsNotManualLabel() {
  assert(
    flowDisplayLabel('', false) === 'Não informado',
    'vínculo vazio não vira Lançamento manual',
  );
  assert(flowDisplayLabel('', true) === 'Lançamento manual', 'manual continua manual');
  console.log('OK testLinkedEmptyIsNotManualLabel');
}

function main() {
  testSaleCreatesPendingOnly();
  testPendingDoesNotCreateCashItem();
  testSettlementCreatesOneLinkedCash();
  testModalResolvesGirleneLinks();
  testCashFlowAndReceiptShareLinks();
  testDuplicateSettlementBlocked();
  testReverseKeepsCommissionLink();
  testSaleWithoutBrokerDoesNotCreateCommission();
  testTenantIsolationAndGlobalScope();
  testPaymentMethodNormalized();
  testLinkedEmptyIsNotManualLabel();
  console.log('OK — mandatory-broker-commission-settlement-tests passed');
}

main();
