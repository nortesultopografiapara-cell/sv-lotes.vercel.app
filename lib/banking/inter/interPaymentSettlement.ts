/**
 * Baixa idempotente de cobrança Inter paga (webhook ou refresh GET).
 * Não emite cobrança. Não duplica cash_movements.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCashMovementEntradaPayload } from '@/lib/finance/cashMovementsSchema';
import {
  mapInterOrigemRecebimento,
  type InterCobrancaDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { isInterSituacaoRecebido } from '@/lib/banking/inter/interStatus';

export type InterPaidSettlementResult = {
  paid: boolean;
  duplicate: boolean;
  bankChargeId: string;
  financeReceiptId: string | null;
  cashMovementId: string | null;
  origemRecebimento: 'BOLETO' | 'PIX' | 'UNKNOWN';
};

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

  if (!isInterSituacaoRecebido(confirmed.situacao) && String(charge.status).toUpperCase() !== 'PAID') {
    return {
      paid: false,
      duplicate: false,
      bankChargeId: chargeId,
      financeReceiptId: charge.finance_receipt_id ? String(charge.finance_receipt_id) : null,
      cashMovementId: null,
      origemRecebimento: origem,
    };
  }

  const alreadyPaid = String(charge.status).toUpperCase() === 'PAID';
  if (!alreadyPaid) {
    await admin
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
  }

  let financeReceiptId = charge.finance_receipt_id
    ? String(charge.finance_receipt_id)
    : null;
  let cashMovementId: string | null = null;

  if (financeReceiptId) {
    const { data: receipt } = await admin
      .from('finance_receipts')
      .select('id, status, company_id, sale_id, customer_id, project_id, installment_number, amount')
      .eq('id', financeReceiptId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (receipt?.id) {
      const receiptPaid = String(receipt.status || '').toLowerCase() === 'pago';
      if (!receiptPaid) {
        await admin
          .from('finance_receipts')
          .update({
            status: 'pago',
            paid_amount: paidAmount,
            paid_at: paidAt,
            payment_method:
              origem === 'PIX' ? 'pix' : origem === 'BOLETO' ? 'boleto' : 'banco_inter',
            updated_at: new Date().toISOString(),
          })
          .eq('id', receipt.id)
          .eq('company_id', companyId);
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

  return {
    paid: true,
    duplicate: alreadyPaid,
    bankChargeId: chargeId,
    financeReceiptId,
    cashMovementId,
    origemRecebimento: origem,
  };
}
