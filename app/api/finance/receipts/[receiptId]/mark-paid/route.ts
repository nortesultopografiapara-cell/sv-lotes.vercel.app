import { NextResponse } from 'next/server';
import { decideManualReceiptMarkPaid } from '@/lib/finance/manualReceiptMarkPaid';
import {
  maskPrimaryAdminEmail,
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  primaryAdminDisplayName,
  readPrimaryAdminVerifyRequest,
  resolvePrimaryAdminForOperator,
  verifyPrimaryAdminPassword,
} from '@/lib/primaryAdminReauth';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const USER_SELECT = 'id, role, status, tenant_id';
const RECEIPT_SELECT =
  'id, tenant_id, company_id, status, amount, paid_amount, paid_at, installment_number, sale_id';

const rateLimitStore = new Map<string, number[]>();

function messageFor(code: string): string {
  if (code === 'already_paid') return 'Esta parcela já está paga.';
  if (code === 'cancelled') return 'Parcela cancelada não pode ser paga.';
  if (code === 'tenant_mismatch') return 'A parcela não pertence à empresa atual.';
  if (code === 'forbidden') return 'Sem permissão para registrar pagamento.';
  if (code === 'not_found') return 'Parcela não encontrada.';
  if (code === 'unauthenticated') return 'Não autenticado.';
  if (code === 'missing_primary') return 'Administrador principal não configurado.';
  if (code === 'password_rejected' || code === 'ephemeral_mismatch' || code === 'primary_invalid') {
    return PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE;
  }
  if (code === 'rate_limited') return 'Muitas tentativas. Aguarde para tentar novamente.';
  return 'Erro ao registrar pagamento.';
}

function statusFor(code: string): number {
  if (code === 'already_paid') return 409;
  if (code === 'not_found') return 404;
  if (code === 'rate_limited') return 429;
  if (
    code === 'tenant_mismatch'
    || code === 'forbidden'
    || code === 'cancelled'
    || code === 'missing_primary'
    || code === 'operator_invalid'
  ) {
    return 403;
  }
  if (code === 'password_rejected' || code === 'ephemeral_mismatch' || code === 'primary_invalid' || code === 'unauthenticated') {
    return 401;
  }
  return 422;
}

type ReceiptRow = {
  id: string;
  tenant_id?: string | null;
  company_id?: string | null;
  status?: string | null;
  paid_at?: string | null;
  amount?: number | null;
  installment_number?: number | null;
};

type OperatorRow = {
  role?: string | null;
  status?: string | null;
  tenant_id?: string | null;
};

async function loadMarkPaidContext(request: Request, receiptId: string) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return { error: NextResponse.json({ ok: false, error: messageFor('unauthenticated') }, { status: 401 }) };
  }

  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return { error: NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 503 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select(USER_SELECT)
    .eq('id', auth.user.id)
    .maybeSingle();
  if (profileError) {
    console.warn('[mark-paid] profile', profileError.code || 'profile_error');
    return { error: NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 503 }) };
  }
  if (!profile) {
    return { error: NextResponse.json({ ok: false, error: messageFor('unauthenticated') }, { status: 401 }) };
  }

  const { data: receipt, error: receiptError } = await admin
    .from('finance_receipts')
    .select(RECEIPT_SELECT)
    .eq('id', receiptId)
    .maybeSingle();
  if (receiptError || !receipt) {
    return { error: NextResponse.json({ ok: false, error: messageFor('not_found') }, { status: 404 }) };
  }

  const row = receipt as ReceiptRow;
  const operator = profile as OperatorRow;
  const decision = decideManualReceiptMarkPaid({
    operatorTenantId: operator.tenant_id,
    operatorRole: operator.role,
    operatorStatus: operator.status,
    receipt: {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      status: row.status,
      paidAt: row.paid_at,
      amount: row.amount,
    },
  });
  if (!decision.ok) {
    return {
      error: NextResponse.json(
        { ok: false, code: decision.code, error: messageFor(decision.code) },
        { status: statusFor(decision.code) },
      ),
    };
  }

  return { admin, userId: auth.user.id, operator, row, decision };
}

function receiptCompanyId(row: ReceiptRow): string {
  return String(row.tenant_id || row.company_id || '').trim();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await context.params;
  const loaded = await loadMarkPaidContext(request, receiptId);
  if ('error' in loaded) return loaded.error;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 503 });
  }
  const deps = createPrimaryAdminReauthDeps(loaded.admin, { url, anonKey }, rateLimitStore);
  const identity = await resolvePrimaryAdminForOperator(deps, loaded.userId, {
    companyId: receiptCompanyId(loaded.row),
  });
  if (!identity.ok) {
    const code = identity.reason === 'operator_invalid' ? 'forbidden' : identity.reason;
    return NextResponse.json(
      { ok: false, code, error: messageFor(code) },
      { status: statusFor(code) },
    );
  }

  return NextResponse.json({
    ok: true,
    receipt: {
      id: loaded.decision.receiptId,
      amount: loaded.decision.amount,
      installmentNumber: loaded.row.installment_number ?? null,
    },
    principal: {
      displayName: primaryAdminDisplayName(identity.primary),
      maskedEmail: maskPrimaryAdminEmail(identity.primary.email),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await context.params;
  const loaded = await loadMarkPaidContext(request, receiptId);
  if ('error' in loaded) return loaded.error;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { password } = readPrimaryAdminVerifyRequest(body);
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 503 });
  }

  const deps = createPrimaryAdminReauthDeps(loaded.admin, { url, anonKey }, rateLimitStore);
  const verify = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: loaded.userId,
    password,
    companyId: receiptCompanyId(loaded.row),
  });
  await persistPrimaryAdminVerifyAudit(loaded.admin, verify);
  if (!verify.ok) {
    const code = verify.reason === 'operator_invalid' ? 'forbidden' : verify.reason;
    return NextResponse.json(
      { ok: false, code, error: messageFor(code) },
      { status: statusFor(code) },
    );
  }

  const paidAt = new Date().toISOString();
  const { data, error } = await loaded.admin.rpc('execute_authorized_manual_receipt_payment', {
    p_receipt_id: loaded.decision.receiptId,
    p_operator_id: loaded.userId,
    p_paid_at: paidAt,
    p_amount: loaded.decision.amount,
  });
  if (error) {
    console.warn('[mark-paid] rpc', error.code || 'rpc_error');
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 422 });
  }

  const payload = (data || {}) as { ok?: boolean; code?: string; cashMovementId?: string | null };
  if (payload.code === 'already_paid' || payload.code === 'cancelled') {
    return NextResponse.json(
      { ok: false, code: payload.code, error: messageFor(payload.code) },
      { status: statusFor(payload.code) },
    );
  }
  if (payload.ok !== true) {
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    receiptId: loaded.decision.receiptId,
    cashMovementId: payload.cashMovementId || null,
    paidAt,
  });
}
