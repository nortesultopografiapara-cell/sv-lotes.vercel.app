/**
 * Recuperação autorizada — somente 2 cobranças Menezes / QD02 LT10 Canaã.
 * Usa rotina oficial getCompanyChargeStatus (Asaas → charge PAID → finance_receipts → cash_movements).
 * Preview-only; token obrigatório; allowlist rígida; sem recriar cobrança.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getCompanyChargeStatus } from '@/lib/finance/asaasCompanyChargeService';
import { loadAsaasApiKeyForFinancialAccount } from '@/lib/finance/companyFinancialAccountRepository';
import { asaasCompanyGetPayment } from '@/lib/finance/asaasCompanyClient';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const DIAG_TOKEN = 'sv-lotes-reconcile-canaa-20260716';
const COMPANY_ID = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';
const SALE_ID = 'e1c93632-776c-484e-80c0-7d13de7e8550';
const FINANCIAL_ACCOUNT_ID = 'b6653c5c-e77a-4895-9309-d0603e5c3093';

const ALLOWED = [
  {
    label: 'Entrada',
    installmentId: 'e348ae07-d631-4c53-9519-ff3768d742cd',
    asaasPaymentId: 'pay_38mg8w98fpvzh5h9',
  },
  {
    label: 'Parcela 1/1',
    installmentId: 'ca9160e1-6bfc-48bc-a500-b019667b9bc2',
    asaasPaymentId: 'pay_yaphvoyklu10tpuv',
  },
] as const;

type Snapshot = {
  installmentId: string;
  label: string;
  charge: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
  cashMovements: Array<Record<string, unknown>>;
  asaas: Record<string, unknown> | null;
  asaasError: string | null;
};

async function snapshotOne(admin: SupabaseClient, item: (typeof ALLOWED)[number]): Promise<Snapshot> {
  const { data: charge } = await admin
    .from('company_asaas_charges')
    .select(
      'id, company_id, sale_id, installment_id, asaas_payment_id, status, paid_at, billing_type, value, cash_movement_id, financial_account_id, created_at, updated_at',
    )
    .eq('company_id', COMPANY_ID)
    .eq('installment_id', item.installmentId)
    .eq('asaas_payment_id', item.asaasPaymentId)
    .maybeSingle();

  const { data: receipt } = await admin
    .from('finance_receipts')
    .select('id, status, amount, paid_amount, paid_at, installment_number, sale_id, company_id')
    .eq('id', item.installmentId)
    .maybeSingle();

  const chargeId = charge?.id ? String(charge.id) : null;
  let cashMovements: Array<Record<string, unknown>> = [];

  if (chargeId && charge?.cash_movement_id) {
    const { data } = await admin
      .from('cash_movements')
      .select('id, amount, movement_date, description, metadata, created_at')
      .eq('id', String(charge.cash_movement_id))
      .maybeSingle();
    if (data) cashMovements.push(data as Record<string, unknown>);
  }

  // Busca adicional por metadata (idempotência / histórico)
  const { data: byMeta } = await admin
    .from('cash_movements')
    .select('id, amount, movement_date, description, metadata, created_at')
    .eq('company_id', COMPANY_ID)
    .contains('metadata', { installment_id: item.installmentId })
    .order('created_at', { ascending: false })
    .limit(5);

  for (const row of byMeta || []) {
    if (!cashMovements.some((m) => String(m.id) === String(row.id))) {
      cashMovements.push(row as Record<string, unknown>);
    }
  }

  if (chargeId) {
    const { data: byCharge } = await admin
      .from('cash_movements')
      .select('id, amount, movement_date, description, metadata, created_at')
      .eq('company_id', COMPANY_ID)
      .contains('metadata', { charge_id: chargeId })
      .order('created_at', { ascending: false })
      .limit(5);
    for (const row of byCharge || []) {
      if (!cashMovements.some((m) => String(m.id) === String(row.id))) {
        cashMovements.push(row as Record<string, unknown>);
      }
    }
  }

  let asaas: Record<string, unknown> | null = null;
  let asaasError: string | null = null;
  try {
    const creds = await loadAsaasApiKeyForFinancialAccount(
      admin,
      FINANCIAL_ACCOUNT_ID,
      COMPANY_ID,
      'PRODUCTION',
    );
    const payment = await asaasCompanyGetPayment(creds.apiKey, 'PRODUCTION', item.asaasPaymentId);
    asaas = {
      id: payment.id ?? null,
      status: payment.status ?? null,
      value: payment.value ?? null,
      billingType: payment.billingType ?? null,
      paymentDate: payment.paymentDate ?? null,
      clientPaymentDate: payment.clientPaymentDate ?? null,
      creditDate: payment.creditDate ?? null,
      estimatedCreditDate: payment.estimatedCreditDate ?? null,
      dueDate: payment.dueDate ?? null,
    };
  } catch (e) {
    asaasError = e instanceof Error ? e.message : String(e);
  }

  return {
    installmentId: item.installmentId,
    label: item.label,
    charge: (charge as Record<string, unknown> | null) ?? null,
    receipt: (receipt as Record<string, unknown> | null) ?? null,
    cashMovements,
    asaas,
    asaasError,
  };
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const token = req.headers.get('x-diag-token') || req.nextUrl.searchParams.get('token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
    const { client: admin, error: configError } = createServiceSupabase();
    if (!admin || configError) {
      return NextResponse.json(
        { ok: false, error: configError || 'Service role não configurada.' },
        { status: 503 },
      );
    }

    const before: Snapshot[] = [];
    for (const item of ALLOWED) {
      before.push(await snapshotOne(admin, item));
    }

    const preflightIssues: string[] = [];
    for (const snap of before) {
      if (!snap.charge) {
        preflightIssues.push(`${snap.label}: vínculo local company_asaas_charges ausente`);
        continue;
      }
      const expectedPay = ALLOWED.find((a) => a.installmentId === snap.installmentId)?.asaasPaymentId;
      if (String(snap.charge.asaas_payment_id) !== expectedPay) {
        preflightIssues.push(`${snap.label}: asaas_payment_id divergente do autorizado`);
      }
      if (String(snap.charge.sale_id) !== SALE_ID) {
        preflightIssues.push(`${snap.label}: sale_id divergente do autorizado`);
      }
      if (String(snap.charge.company_id) !== COMPANY_ID) {
        preflightIssues.push(`${snap.label}: company_id divergente`);
      }
      if (snap.asaasError || !snap.asaas) {
        preflightIssues.push(`${snap.label}: falha ao consultar Asaas (${snap.asaasError ?? 'sem payload'})`);
        continue;
      }
      const status = String(snap.asaas.status || '').toUpperCase();
      if (!['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(status)) {
        preflightIssues.push(`${snap.label}: Asaas status=${status} (esperado RECEIVED)`);
      }
    }

    if (preflightIssues.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          aborted: true,
          reason: 'Pré-checagem falhou — nenhuma alteração aplicada',
          preflightIssues,
          before,
        },
        { status: 409 },
      );
    }

    // Risco de duplicidade de cobrança: mais de um asaas_payment_id ativo por parcela
    const { data: allChargesForInstallments } = await admin
      .from('company_asaas_charges')
      .select('id, installment_id, asaas_payment_id, status, created_at')
      .eq('company_id', COMPANY_ID)
      .in(
        'installment_id',
        ALLOWED.map((a) => a.installmentId),
      )
      .order('created_at', { ascending: true });

    const extraCharges = (allChargesForInstallments || []).filter(
      (c) =>
        !ALLOWED.some(
          (a) =>
            a.installmentId === String(c.installment_id) &&
            a.asaasPaymentId === String(c.asaas_payment_id),
        ),
    );
    if (extraCharges.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          aborted: true,
          reason: 'Detectadas cobranças extras para as parcelas — interrompido por risco',
          extraCharges,
          before,
        },
        { status: 409 },
      );
    }

    const reconcileResults: Array<Record<string, unknown>> = [];

    if (!dryRun) {
      for (const item of ALLOWED) {
        const snap = before.find((b) => b.installmentId === item.installmentId)!;
        const chargeId = String(snap.charge!.id);
        const cashBeforeIds = new Set(snap.cashMovements.map((m) => String(m.id)));

        const refreshed = await getCompanyChargeStatus(admin, COMPANY_ID, chargeId);

        const afterOne = await snapshotOne(admin, item);
        const cashAfterIds = afterOne.cashMovements.map((m) => String(m.id));
        const createdCash = cashAfterIds.filter((id) => !cashBeforeIds.has(id));
        const reusedCash = cashAfterIds.filter((id) => cashBeforeIds.has(id));

        reconcileResults.push({
          label: item.label,
          installmentId: item.installmentId,
          asaasPaymentId: item.asaasPaymentId,
          chargeId,
          refreshedStatus: refreshed.status,
          refreshedPaidAt: refreshed.paidAt,
          refreshedAsaasPaymentId: refreshed.asaasPaymentId,
          cashMovementIdsCreated: createdCash,
          cashMovementIdsReused: reusedCash,
          linkedCashMovementId: afterOne.charge?.cash_movement_id ?? null,
        });
      }
    }

    const after: Snapshot[] = [];
    for (const item of ALLOWED) {
      after.push(await snapshotOne(admin, item));
    }

    const paymentIds = ALLOWED.map((a) => a.asaasPaymentId);
    const { data: webhookEvents, count: webhookCount } = await admin
      .from('company_asaas_webhook_events')
      .select('id, event_type, asaas_payment_id, processing_status, created_at', { count: 'exact' })
      .eq('company_id', COMPANY_ID)
      .in('asaas_payment_id', paymentIds);

    // Idempotência: reexecutar dry lógica — se já PAID+pago+cash, segunda chamada só reaproveita
    let idempotencyCheck: Record<string, unknown> | null = null;
    if (!dryRun) {
      const secondPass: Array<Record<string, unknown>> = [];
      for (const item of ALLOWED) {
        const snap = after.find((b) => b.installmentId === item.installmentId)!;
        const chargeId = String(snap.charge!.id);
        const cashBeforeSecond = new Set(snap.cashMovements.map((m) => String(m.id)));
        const refreshed = await getCompanyChargeStatus(admin, COMPANY_ID, chargeId);
        const afterSecond = await snapshotOne(admin, item);
        const cashAfterSecond = afterSecond.cashMovements.map((m) => String(m.id));
        secondPass.push({
          label: item.label,
          status: refreshed.status,
          paidAt: refreshed.paidAt,
          newCashCreated: cashAfterSecond.filter((id) => !cashBeforeSecond.has(id)),
          cashCountBefore: cashBeforeSecond.size,
          cashCountAfter: cashAfterSecond.length,
        });
      }
      idempotencyCheck = {
        secondPassRan: true,
        secondPass,
        noNewCashOnSecondPass: secondPass.every(
          (p) => Array.isArray(p.newCashCreated) && (p.newCashCreated as string[]).length === 0,
        ),
      };
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      companyId: COMPANY_ID,
      saleId: SALE_ID,
      authorizedOnly: ALLOWED,
      before,
      reconcileResults,
      after,
      webhookEventsForThesePayments: webhookEvents ?? [],
      webhookEventCount: webhookCount ?? 0,
      allChargesForTheseInstallments: allChargesForInstallments ?? [],
      duplicateChargeDetected: false,
      idempotencyCheck,
      note: dryRun
        ? 'dryRun=1 — nenhuma escrita'
        : 'Conciliação via getCompanyChargeStatus (rotina oficial) + 2ª passagem de idempotência',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
