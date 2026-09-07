/**
 * P5 — modelo financeiro histórico da Transferência de titularidade (mocks).
 * Sem transferência real. Sem HTTP Inter/Asaas.
 * npx tsx scripts/mandatory-sale-title-transfer-phase5-tests.ts
 */
import fs from 'node:fs';
import path from 'path';
import {
  installmentNeedsAsaasCharge,
  isCanceledFinanceReceipt,
  isEligibleInstallmentForAsaasCharge,
} from '../lib/finance/saleChargesShared';
import {
  formatCancelledChargeHistoryLabel,
  isRemotelyConfirmedCancelledCharge,
  resolveChargeActionVisibility,
  resolveAsaasStatusDisplayLabel,
} from '../lib/charges/chargeOperationsHelpers';
import { resolveInterIssuedChargeActions } from '../lib/charges/interChargeActions';
import { summarizeTitleTransferFinance, mapTitleTransferPreviewUserMessage } from '../lib/finance/saleTitleTransferPreview';
import {
  assertExternalChargeCancelConfirmed,
  titleTransferChargeNeedsCancel,
} from '../lib/finance/saleTitleTransferExecute';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testHomologReceiptModel() {
  const sql = read(
    'supabase/migrations/20261017120200_fix_execute_sale_title_transfer_receipts.sql',
  );
  assert(!/UPDATE public\.finance_receipts\s+SET customer_id = v_to_expected/.test(sql), 'pagas imutáveis');
  assert(sql.includes("status = 'cancelado'"), 'futuras A canceladas');
  assert(sql.includes("p_payload->'new_receipts'"), 'novas parcelas B');
  assert(sql.includes('v_new_contract_id := gen_random_uuid()'), 'contrato B id novo');
  assert(sql.includes("status = 'superseded'"), '018 superseded');
  assert(!sql.includes('DELETE FROM public.finance_receipts'), 'sem DELETE parcelas');
  assert(!sql.includes('bank_charges'), 'RPC não toca cobrança externa');

  const paidA = [
    { id: 'p1', status: 'pago', amount: 5, paid_at: '2026-08-08', customer_id: 'A' },
    { id: 'p2', status: 'pago', amount: 6.67, paid_at: '2026-09-08', customer_id: 'A' },
  ];
  const canceledA = [
    { id: 'f1', status: 'cancelado', amount: 6.67, due_date: '2026-10-08', customer_id: 'A' },
    { id: 'f2', status: 'cancelado', amount: 6.66, due_date: '2026-11-08', customer_id: 'A' },
  ];
  const pendingB = [
    { id: 'n1', status: 'pendente', amount: 6.67, due_date: '2026-10-08', customer_id: 'B' },
    { id: 'n2', status: 'pendente', amount: 6.66, due_date: '2026-11-08', customer_id: 'B' },
  ];
  for (const row of paidA) {
    assert(!isCanceledFinanceReceipt(row), 'paga não cancelada');
    assert(!isEligibleInstallmentForAsaasCharge(row as never), 'paga fora de faltantes');
  }
  for (const row of canceledA) {
    assert(isCanceledFinanceReceipt(row), 'futura antiga cancelada');
    assert(!isEligibleInstallmentForAsaasCharge(row as never), 'cancelada fora de faltantes');
  }
  for (const row of pendingB) {
    assert(
      installmentNeedsAsaasCharge({ installment: row as never, charge: null }) === true,
      'nova pendente B é faltante',
    );
  }
  const kpis = summarizeTitleTransferFinance({
    salePrice: 25,
    todayIso: '2026-09-07',
    receipts: [...paidA, ...canceledA, ...pendingB],
  });
  assert(kpis.totalPaid === 11.67, `pago preservado ${kpis.totalPaid}`);
  assert(kpis.pendingAmount === 13.33, `saldo B ${kpis.pendingAmount}`);
  assert(kpis.remainingBalance === 13.33, 'saldo = preço - pago');
  assert(kpis.canceledCount === 2, 'duas futuras A canceladas');
  assert(kpis.pendingCount === 2, 'duas vigentes B');
  console.log('OK testHomologReceiptModel');
}

function testCancelledChargeActions() {
  const hidden = resolveChargeActionVisibility({
    charge: {
      status: 'CANCELLED',
      asaasPaymentId: 'ext-1',
      bankSlipIdentification: '23790.12345 67890.123456 78901.234567 8 99990000000667',
      pixCopyPaste: '00020126',
      bankSlipUrl: 'https://example.test/boleto.pdf',
    } as never,
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
  });
  assert(!hidden.showCopyPix, 'sem Copiar Pix');
  assert(!hidden.showCopyBarcodeLine, 'sem linha digitável');
  assert(!hidden.showOpenBoleto, 'sem Ver boleto');
  assert(!hidden.showWhatsApp, 'sem WhatsApp');
  assert(!hidden.showGenerate, 'sem Gerar');
  assert(!hidden.showCancel, 'sem cancelar de novo');

  const interHidden = resolveInterIssuedChargeActions({
    charge: {
      status: 'CANCELLED',
      asaasPaymentId: 'inter-1',
      bankSlipIdentification: '07790.00000 00000.000000 00000.000000 0 00000000000667',
      pixCopyPaste: '00020126',
    } as never,
    installmentPaid: false,
    customerEmail: 'a@test.com',
    customerPhone: '63999999999',
  });
  assert(!interHidden.showCopyPix, 'Inter sem Pix');
  assert(!interHidden.showCopyLinha, 'Inter sem linha');
  assert(!interHidden.showOfficialPdf, 'Inter sem PDF');
  assert(!interHidden.showWhatsApp, 'Inter sem WhatsApp');
  assert(!interHidden.showEmail, 'Inter sem e-mail');

  const unconfirmed = {
    status: 'CANCELLED' as const,
    asaasRemoteStatus: 'CANCELADO',
    asaasPaymentId: 'inter-stale',
    remoteCancelConfirmed: false,
  };
  assert(
    isRemotelyConfirmedCancelledCharge(unconfirmed as never) === false,
    'CANCELADO local sem flag não confirma',
  );
  assert(
    formatCancelledChargeHistoryLabel({
      charge: unconfirmed as never,
      provider: 'INTER',
    }) === null,
    'não exibe Cancelado sem confirmação remota',
  );
  assert(
    resolveAsaasStatusDisplayLabel(unconfirmed as never) === 'Confirmação remota pendente',
    'rótulo sem Cancelado',
  );

  const confirmed = {
    status: 'CANCELLED' as const,
    asaasRemoteStatus: 'CANCELADO',
    asaasPaymentId: 'inter-ok',
    remoteCancelConfirmed: true,
    cancelledAt: '2026-09-07T12:00:00.000Z',
  };
  const label = formatCancelledChargeHistoryLabel({
    charge: confirmed as never,
    provider: 'INTER',
  });
  assert(Boolean(label && label.includes('Cancelado no Banco Inter')), `label=${label}`);
  console.log('OK testCancelledChargeActions');
}

function testCancelConfirmHelpers() {
  assert(
    titleTransferChargeNeedsCancel({
      classification: 'absent',
      status: 'CANCELLED',
      externalId: 'ext-1',
    }),
    'CANCELLED local com externalId ainda precisa confirmar',
  );
  assert(
    !titleTransferChargeNeedsCancel({
      classification: 'paid',
      status: 'PAID',
      externalId: 'ext-paid',
    }),
    'paga não cancela',
  );
  try {
    assertExternalChargeCancelConfirmed({ ok: true, remoteConfirmed: false });
    throw new Error('deveria recusar remoteConfirmed false');
  } catch (err) {
    assert(/não confirmou/.test((err as Error).message), 'mensagem de não confirmação');
  }
  assertExternalChargeCancelConfirmed({ ok: true, remoteConfirmed: true });
  assertExternalChargeCancelConfirmed({ ok: true });
  console.log('OK testCancelConfirmHelpers');
}

function testOperationalCancelMessage() {
  const labeled =
    'Inter — Parcela 2/4 — cancelamento não confirmado. POST aceito, porém consulta permaneceu A_RECEBER. HTTP 202. codigoSolicitacao: dcd8ceee-a72f-4a2c-bd38-f23eb64d0923 A transferência local não foi executada.';
  assert(
    mapTitleTransferPreviewUserMessage({
      code: 'TITLE_TRANSFER_CHARGES_CANCEL_FAILED',
      message: labeled,
    }) === labeled,
    'UI mostra erro operacional sanitizado',
  );
  assert(
    mapTitleTransferPreviewUserMessage({
      code: 'TITLE_TRANSFER_CHARGES_CANCEL_FAILED',
      message: 'Bearer secret',
    }).includes('Falha ao cancelar cobrança bancária'),
    'não vaza segredo',
  );
  console.log('OK testOperationalCancelMessage');
}

function testProtectedModulesUntouched() {
  const files = [
    'lib/mundoNovoContractSellers.ts',
    'lib/finance/saleLotSwapChargesExecuteService.ts',
    'lib/finance/releaseLotService.ts',
    'lib/finance/saleLotSwapExecute.ts',
  ];
  for (const rel of files) {
    const abs = path.join(__dirname, '..', rel);
    assert(fs.existsSync(abs), `${rel} existe`);
  }
  const rpc = read(
    'supabase/migrations/20261017120200_fix_execute_sale_title_transfer_receipts.sql',
  );
  assert(!rpc.includes('execute_sale_lot_swap'), 'sem RPC da troca');
  assert(!rpc.includes('seller_parties_json'), 'sem Mundo Novo');
  assert(!rpc.includes('release_lot'), 'sem ReleaseLot');
  console.log('OK testProtectedModulesUntouched');
}

function main() {
  testHomologReceiptModel();
  testCancelledChargeActions();
  testCancelConfirmHelpers();
  testOperationalCancelMessage();
  testProtectedModulesUntouched();
  console.log('OK mandatory-sale-title-transfer-phase5-tests');
}

main();
