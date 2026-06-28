import { handleCompanyAsaasPaymentWebhook } from '@/lib/finance/companyAsaasWebhookHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleCompanyAsaasPaymentWebhook(request);
}

export async function GET() {
  return Response.json({ ok: true, service: 'company-asaas-webhook' });
}
