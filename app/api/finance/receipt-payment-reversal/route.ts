import { NextResponse } from 'next/server';
import { planReceiptPaymentReversal } from '@/lib/finance/reverseReceiptPayment';
import { createRouteHandlerSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  return raw || null;
}

function missingRelation(message: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(message);
}

function safeTechnicalMessage(message: string): string {
  const clean = message
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, '[token]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[conexao]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return clean;
}

function functionNotInApi(error: { code?: string; message?: string } | null): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'PGRST202' || /schema cache|could not find the function/i.test(message);
}

export async function POST(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return NextResponse.json({ success: false, message: 'Sessão inválida.' }, { status: 401 });
  }
  const { client, configError: clientError } = await createRouteHandlerSupabase();
  if (!client || clientError) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Row;
  const receiptId = text(body.receiptId);
  const reason = String(body.reason || '');
  const confirm = body.confirm === true;
  if (!receiptId) {
    return NextResponse.json({ success: false, message: 'Informe a parcela.' }, { status: 400 });
  }

  const roleQuery = await client.from('users').select('role').eq('id', user.id).maybeSingle();
  const role = text(roleQuery.data?.role) || text(user.user_metadata?.role);
  if (role?.toUpperCase() === 'OWNER') {
    return NextResponse.json({ success: false, message: 'Perfil somente leitura.' }, { status: 403 });
  }

  const receiptQuery = await client
    .from('finance_receipts')
    .select('id, sale_id, amount, paid_amount, paid_at, status, installment_number, block_id, tenant_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (receiptQuery.error || !receiptQuery.data) {
    return NextResponse.json({ success: false, message: 'Parcela não encontrada.' }, { status: 404 });
  }
  const receipt = receiptQuery.data as Row;
  const saleId = text(receipt.sale_id);

  const [cashByColumn, cashBySale, bank, asaas, commissions] = await Promise.all([
    client.from('cash_movements').select('id, status, finance_receipt_id, metadata').eq('finance_receipt_id', receiptId),
    saleId
      ? client.from('cash_movements').select('id, status, finance_receipt_id, metadata, sale_id').eq('sale_id', saleId)
      : Promise.resolve({ data: [], error: null }),
    client.from('bank_charges').select('id, status, finance_receipt_id').eq('finance_receipt_id', receiptId),
    client.from('company_asaas_charges').select('id, status, installment_id').eq('installment_id', receiptId),
    saleId
      ? client.from('broker_commissions').select('id, status, sale_id').eq('sale_id', saleId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const rows = (result: { data: unknown; error: { message?: string } | null }) => {
    if (result.error && !missingRelation(result.error.message || '')) return null;
    return (Array.isArray(result.data) ? result.data : []) as Row[];
  };
  const cashRows = rows(cashByColumn);
  const saleCashRows = rows(cashBySale);
  const bankRows = rows(bank);
  const asaasRows = rows(asaas);
  if (!cashRows || !saleCashRows || !bankRows || !asaasRows) {
    return NextResponse.json({ success: false, message: 'Não foi possível consultar os vínculos da parcela.' }, { status: 503 });
  }

  const cash = [...cashRows, ...saleCashRows].filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index);
  const linkedCash = cash.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
    const linkedId = text(row.finance_receipt_id) || text(metadata.installment_id) || text(metadata.receipt_id) || text(metadata.finance_receipt_id);
    return linkedId === receiptId;
  });

  const plan = planReceiptPaymentReversal({
    receipt: {
      id: receiptId,
      amount: Number(receipt.amount) || 0,
      paidAmount: receipt.paid_amount == null ? null : Number(receipt.paid_amount),
      paidAt: text(receipt.paid_at),
      status: text(receipt.status) || '',
    },
    cash: linkedCash.map((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
      return {
        id: String(row.id),
        receiptId,
        status: text(row.status),
        hasReceiptDocument: Boolean(text(metadata.receipt_number) || text(metadata.receipt_url) || text(metadata.validation_code)),
        provider: text(metadata.provider),
      };
    }),
    bankCharges: bankRows.map((row) => ({ id: String(row.id), receiptId, status: text(row.status) })),
    asaasCharges: asaasRows.map((row) => ({ id: String(row.id), receiptId, status: text(row.status) })),
    commissions: ((rows(commissions) || []) as Row[])
      .filter((row) => text(row.installment_id) === receiptId || text(row.finance_receipt_id) === receiptId)
      .map((row) => ({ id: String(row.id), receiptId, status: text(row.status) })),
    reason,
  });

  if (!plan.ok || !confirm) {
    return NextResponse.json({ success: plan.ok, ...plan, mutation: false });
  }

  const executed = await client.rpc('execute_receipt_payment_reversal', {
    p_receipt_id: receiptId,
    p_reason: reason.trim(),
    p_confirm: true,
  });
  const payload = (executed.data || {}) as Row;
  if (executed.error || payload.ok !== true) {
    const unavailable = functionNotInApi(executed.error);
    const technical = safeTechnicalMessage(String(executed.error?.message || ''));
    if (executed.error) {
      console.error('[receipt-payment-reversal]', {
        code: executed.error.code || null,
        message: technical || null,
      });
    }
    return NextResponse.json({
      success: false,
      message: unavailable
        ? 'O estorno seguro ainda não está visível para o aplicativo. Nenhuma parcela foi alterada.'
        : String(payload.message || technical || 'O estorno não foi concluído. Nenhuma parcela foi alterada.'),
      code: executed.error?.code || payload.code || null,
      mutation: false,
    }, { status: unavailable ? 503 : 409 });
  }

  return NextResponse.json({
    success: true,
    message: String(payload.message || plan.message),
    mutation: payload.replayed !== true,
    replayed: payload.replayed === true,
  });
}
