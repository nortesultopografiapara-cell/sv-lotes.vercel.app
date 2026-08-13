/**
 * Baixa idempotente de cobrança Inter paga (webhook ou refresh GET).
 * Não emite cobrança. Não duplica cash_movements.
 * Parcela (finance_receipts) é a fonte de verdade para Central e Financeiro.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCashMovementEntradaPayload } from '@/lib/finance/cashMovementsSchema';
import {
  mapInterOrigemRecebimento,
  type InterCobrancaDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { isInterSituacaoRecebido } from '@/lib/banking/inter/interStatus';

export const INTER_FINANCE_RECEIPT_PAID_STATUS = 'pago' as const;

export type InterPaidSettlementResult = {
  paid: boolean;
  duplicate: boolean;
  bankChargeId: string;
  financeReceiptId: string | null;
  cashMovementId: string | null;
  origemRecebimento: 'BOLETO' | 'PIX' | 'UNKNOWN';
  receiptUpdated: boolean;
  receiptStatus: string | null;
  receiptPaidAt: string | null;
  receiptPaidAmount: number | null;
};

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isReceiptPaidStatus(status: unknown): boolean {
  const s = String(status || '').trim().toLowerCase();
  return s === INTER_FINANCE_RECEIPT_PAID_STATUS || s === 'paid';
}

async function loadFinanceReceiptForInterSettlement(
  admin: SupabaseClient,
  companyId: string,
  financeReceiptId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(
      'id, status, tenant_id, company_id, sale_id, customer_id, project_id, installment_number, amount, paid_amount, paid_at',
    )
    .eq('id', financeReceiptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  const owner = String(data.company_id || data.tenant_id || '').trim();
  if (owner && owner !== companyId) return null;
  return data as Record<string, unknown>;
}

/** Colunas reais de finance_receipts — sem payment_method/updated_at. */
export function buildInterFinanceReceiptPaidPatch(input: {
  paidAmount: number;
  paidAt: string;
}): { status: typeof INTER_FINANCE_RECEIPT_PAID_STATUS; paid_amount: number; paid_at: string } {
  return {
    status: INTER_FINANCE_RECEIPT_PAID_STATUS,
    paid_amount: input.paidAmount,
    paid_at: input.paidAt,
  };
}

export async function settleInterPaidCharge(admin: SupabaseClient, input: {
  companyId: string;
  charge: Record<string, unknown>;
  detail: InterCobrancaDetail;
  webhookEventId?: string | null;
}): Promise<InterPaidSettlementResult> {
  const companyId = input.companyId;
  const charge = input.charge;
  const confirmed = input.detail;
  const codigo = String(confirmed.codigoSolicitacao || charge.external_id || '').trim();
  const origem = mapInterOrigemRecebimento(confirmed.origemRecebimento);
  const paidAmount =
    confirmed.valorTotalRecebido ??
    confirmed.valorNominal ??
    Number(charge.amount) ??
    0;
  const paidAt = confirmed.dataHoraSituacao || new Date().toISOString();
  const prevMeta = asMeta(charge.metadata);
  const chargeId = String(charge.id);

  const empty: InterPaidSettlementResult = {
    paid: false,
    duplicate: false,
    bankChargeId: chargeId,
    financeReceiptId: charge.finance_receipt_id ? String(charge.finance_receipt_id) : null,
    cashMovementId: null,
    origemRecebimento: origem,
    receiptUpdated: false,
    receiptStatus: null,
    receiptPaidAt: null,
    receiptPaidAmount: null,
  };

  if (!isInterSituacaoRecebido(confirmed.situacao) && String(charge.status).toUpperCase() !== 'PAID') {
    return empty;
  }

  const alreadyChargePaid = String(charge.status).toUpperCase() === 'PAID';
  if (!alreadyChargePaid) {
    const { error: chargeErr } = await admin
      .from('bank_charges')
      .update({
        status: 'PAID',
        paid_at: paidAt,
        paid_amount: paidAmount,
        barcode: confirmed.codigoBarras || charge.barcode || null,
        digitable_line: confirmed.linhaDigitavel || charge.digitable_line || null,
        pix_copy_paste: confirmed.pixCopiaECola || charge.pix_copy_paste || null,
        our_number: confirmed.nossoNumero || charge.our_number || null,
        txid: confirmed.txid || charge.txid || null,
        metadata: {
          ...prevMeta,
          origemRecebimento: origem,
          interSituacao: confirmed.situacao,
          interConfirmedAt: new Date().toISOString(),
          interArtifacts: {
            codigoBarras: confirmed.codigoBarras,
            linhaDigitavel: confirmed.linhaDigitavel,
            pixCopiaECola: confirmed.pixCopiaECola,
            nossoNumero: confirmed.nossoNumero,
            txid: confirmed.txid,
            seuNumero: confirmed.seuNumero,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', chargeId)
      .eq('company_id', companyId);
    if (chargeErr) throw new Error(chargeErr.message);
  }

  let financeReceiptId = charge.finance_receipt_id
    ? String(charge.finance_receipt_id)
    : null;
  let cashMovementId: string | null = null;
  let receiptUpdated = false;
  let receiptStatus: string | null = null;
  let receiptPaidAt: string | null = null;
  let receiptPaidAmount: number | null = null;
  let receiptWasAlreadyPaid = false;
  let cashMovementExisted = false;

  if (financeReceiptId) {
    const receipt = await loadFinanceReceiptForInterSettlement(
      admin,
      companyId,
      financeReceiptId,
    );

    if (receipt?.id) {
      receiptStatus = String(receipt.status || '') || null;
      receiptPaidAt = receipt.paid_at ? String(receipt.paid_at) : null;
      receiptPaidAmount =
        receipt.paid_amount != null ? Number(receipt.paid_amount) : null;
      receiptWasAlreadyPaid = isReceiptPaidStatus(receipt.status);
      if (!isReceiptPaidStatus(receipt.status)) {
        const patch = buildInterFinanceReceiptPaidPatch({ paidAmount, paidAt });
        const { error: receiptErr } = await admin
          .from('finance_receipts')
          .update(patch)
          .eq('id', String(receipt.id));
        if (receiptErr) {
          throw new Error(
            `Falha ao baixar parcela finance_receipts (${String(receipt.id)}): ${receiptErr.message}`,
          );
        }
        const { data: updated, error: verifyErr } = await admin
          .from('finance_receipts')
          .select('id, status, paid_amount, paid_at')
          .eq('id', String(receipt.id))
          .maybeSingle();
        if (verifyErr) {
          throw new Error(
            `Falha ao conferir parcela finance_receipts (${String(receipt.id)}): ${verifyErr.message}`,
          );
        }
        if (!updated?.id || !isReceiptPaidStatus(updated.status)) {
          throw new Error(
            `UPDATE finance_receipts não liquidou a parcela (installment_id=${String(receipt.id)}).`,
          );
        }
        receiptUpdated = true;
        receiptStatus = INTER_FINANCE_RECEIPT_PAID_STATUS;
        receiptPaidAt = paidAt;
        receiptPaidAmount = paidAmount;
      }

      const { data: existingMv } = await admin
        .from('cash_movements')
        .select('id')
        .eq('company_id', companyId)
        .eq('type', 'entrada')
        .eq('status', 'ativo')
        .filter('metadata->>bank_charge_id', 'eq', chargeId)
        .filter('metadata->>provider', 'eq', 'INTER')
        .limit(1)
        .maybeSingle();

      if (existingMv?.id) {
        cashMovementId = String(existingMv.id);
        cashMovementExisted = true;
      } else {
        const movementDate = paidAt.slice(0, 10);
        const payload = buildCashMovementEntradaPayload({
          tenant_id: companyId,
          company_id: companyId,
          project_id: receipt.project_id || null,
          type: 'entrada',
          category: 'recebimento_parcela',
          description: `Recebimento Inter (${origem}) — parcela ${receipt.installment_number ?? ''}`.trim(),
          amount: paidAmount,
          customer_id: receipt.customer_id || charge.customer_id || null,
          sale_id: receipt.sale_id || charge.sale_id || null,
          movement_date: movementDate,
          status: 'ativo',
          metadata: {
            provider: 'INTER',
            bank_charge_id: chargeId,
            installment_id: financeReceiptId,
            codigo_solicitacao: codigo,
            origemRecebimento: origem,
          },
        });
        const { data: mv, error: mvErr } = await admin
          .from('cash_movements')
          .insert(payload)
          .select('id')
          .single();
        if (!mvErr && mv?.id) {
          cashMovementId = String(mv.id);
          await admin.from('bank_cash_movements').insert({
            company_id: companyId,
            cash_movement_id: cashMovementId,
            bank_charge_id: chargeId,
            webhook_event_id: input.webhookEventId || null,
            movement_kind: 'payment',
            bank_reference: codigo,
            amount: paidAmount,
            metadata: { origemRecebimento: origem },
          });
        } else if (mvErr) {
          console.error('[inter-settlement] cash_movements insert failed (parcela mantida paga)', {
            chargeId,
            error: mvErr.message,
          });
        }
      }
    }
  }

  const duplicate =
    alreadyChargePaid && receiptWasAlreadyPaid && cashMovementExisted;

  return {
    paid: true,
    duplicate,
    bankChargeId: chargeId,
    financeReceiptId,
    cashMovementId,
    origemRecebimento: origem,
    receiptUpdated,
    receiptStatus,
    receiptPaidAt,
    receiptPaidAmount,
  };
}
