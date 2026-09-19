import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isOwnerRole } from '@/lib/rolePermissions';
import { ownerWriteForbiddenResponse } from '@/lib/ownerWriteGuard';
import { chargeWhatsAppBatchRoleDeniedMessage } from '@/lib/charges/chargeWhatsAppBatch';
import {
  buildTenantChargeWhatsAppPreview,
  retryFailedChargeWhatsAppBatch,
  sendChargeWhatsAppBatch,
} from '@/lib/charges/chargeWhatsAppBatchService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  if (isOwnerRole(auth.role)) {
    return ownerWriteForbiddenResponse();
  }

  const denied = chargeWhatsAppBatchRoleDeniedMessage(auth.role);
  if (denied) return jsonError(denied, 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || 'preview').trim().toLowerCase();

  try {
    if (action === 'preview') {
      const preview = await buildTenantChargeWhatsAppPreview(auth.admin, {
        tenantId: auth.tenantId,
        installmentIds: body.installmentIds ?? body.installment_ids,
      });
      return NextResponse.json({
        ok: true,
        action: 'preview',
        preview,
        items: preview.customers.map((group) => ({
          customerId: group.customerId,
          customerName: group.customerName,
          phone: group.normalizedPhone || group.phone,
          status: group.sendable ? 'queued' : 'skipped',
          skipReason: group.skipReason,
          financeReceiptIds: group.sendable
            ? group.financeReceiptIds
            : group.skippedParcels.map((p) => p.installmentId),
          message: group.message,
        })),
      });
    }

    if (action === 'send') {
      const result = await sendChargeWhatsAppBatch(auth.admin, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        installmentIds: body.installmentIds ?? body.installment_ids,
        idempotencyKey: String(body.idempotencyKey || body.idempotency_key || ''),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'retry') {
      const result = await retryFailedChargeWhatsAppBatch(auth.admin, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        batchId: String(body.batchId || body.batch_id || ''),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return jsonError('Ação inválida. Use preview, send ou retry.', 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no lote de WhatsApp.';
    console.error('[finance/charges/whatsapp-batch]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
