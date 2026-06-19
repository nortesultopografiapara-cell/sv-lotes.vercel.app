import { handleAsaasPaymentWebhook } from '@/lib/saasAsaasWebhook';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleAsaasPaymentWebhook(request);
}

export async function GET() {
  return Response.json({ ok: true, service: 'saas-payments-webhook' });
}
