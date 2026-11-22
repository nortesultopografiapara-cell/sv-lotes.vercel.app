import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { redactC6ErrorMessage } from '@/lib/banking/c6/c6ConfigRepository';
import {
  c6WebhookReceiptPath,
  ensureC6WebhookReceiptToken,
  readC6WebhookPanel,
} from '@/lib/banking/c6/c6WebhookReceipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Prepara a URL local. Não cadastra o endereço no Banco C6. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  try {
    const token = await ensureC6WebhookReceiptToken(auth.admin, auth.tenantId);
    const webhook = await readC6WebhookPanel(auth.admin, auth.tenantId);
    return NextResponse.json({
      webhook: {
        ...webhook,
        receiptPath: c6WebhookReceiptPath(token),
        registeredAtBank: false,
        registrationLabel: 'Não cadastrado no Banco C6',
        automaticReconciliation: 'Desligada',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: redactC6ErrorMessage(error, 'Não foi possível preparar a URL do C6.') },
      { status: 422 },
    );
  }
}
