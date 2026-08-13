/**
 * ONE-SHOT Preview probe: routing + WRONG_PROVIDER without emitting charges.
 * Runtime service role only. VERCEL_ENV=preview required.
 * DELETE after homologation.
 *
 * GET/POST /api/finance/_preview-charges-routing-probe
 * Header: x-sv-preview-probe: <PREVIEW_CHARGES_ROUTING_PROBE_SECRET>
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CompanyAsaasWrongProviderError,
  createCompanyInstallmentCharge,
} from '@/lib/finance/asaasCompanyChargeService';
import { createInterInstallmentCharge } from '@/lib/banking/inter/interSaleChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMPANY = 'f26f2331-1885-4ac6-8d8e-4131cc8a8014';
const FAKE_INSTALLMENT = '00000000-0000-4000-8000-000000000099';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(request: Request): boolean {
  if (process.env.VERCEL_ENV !== 'preview') return false;
  const expected = String(process.env.PREVIEW_CHARGES_ROUTING_PROBE_SECRET || '').trim();
  if (!expected) return false;
  const got = String(request.headers.get('x-sv-preview-probe') || '').trim();
  return got.length > 0 && got === expected;
}

async function countExact(
  admin: ReturnType<typeof createClient>,
  table: string,
  filters: Record<string, string>,
): Promise<number> {
  let q = admin.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = getAdmin();

    const { data: accounts, error: accErr } = await admin
      .from('company_financial_accounts')
      .select('id, name, provider')
      .eq('company_id', COMPANY);
    if (accErr) throw new Error(accErr.message);

    const interAccount = (accounts || []).find(
      (a) => String(a.provider || '').toUpperCase() === 'INTER',
    );
    const asaasAccount = (accounts || []).find((a) => {
      const p = String(a.provider || '').toUpperCase();
      return p === 'ASAAS_COMPANY' || p === 'ASAAS';
    });

    const pickUnpaid = async (financialAccountId: string) => {
      const { data, error } = await admin
        .from('finance_receipts')
        .select('id, amount, status, financial_account_id')
        .eq('company_id', COMPANY)
        .eq('financial_account_id', financialAccountId)
        .not('status', 'in', '("pago","paid","cancelado","canceled")')
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw new Error(error.message);
      return data || [];
    };

    const pickPaid = async (financialAccountId: string) => {
      const { data, error } = await admin
        .from('finance_receipts')
        .select('id, amount, status')
        .eq('company_id', COMPANY)
        .eq('financial_account_id', financialAccountId)
        .in('status', ['pago', 'paid'])
        .limit(1);
      if (error) throw new Error(error.message);
      return data?.[0] || null;
    };

    const interRows = interAccount?.id ? await pickUnpaid(String(interAccount.id)) : [];
    const asaasRows = asaasAccount?.id ? await pickUnpaid(String(asaasAccount.id)) : [];
    const asaasPaid = asaasAccount?.id ? await pickPaid(String(asaasAccount.id)) : null;
    const interInstallmentId = interRows[0]?.id ? String(interRows[0].id) : null;

    const baseline = {
      bank_charges_inter: await countExact(admin, 'bank_charges', {
        company_id: COMPANY,
        provider: 'INTER',
      }),
      company_asaas_charges: await countExact(admin, 'company_asaas_charges', {
        company_id: COMPANY,
      }),
      cash_movements: await countExact(admin, 'cash_movements', {
        company_id: COMPANY,
      }),
    };

    // A) INTER endpoint/service with fake ID — early fail, no persist
    let interFake: Record<string, unknown>;
    try {
      await createInterInstallmentCharge(admin, {
        companyId: COMPANY,
        installmentId: FAKE_INSTALLMENT,
      });
      interFake = { unexpectedSuccess: true };
    } catch (err) {
      interFake = {
        ok: true,
        threw: true,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    // B) ASAAS endpoint/service with fake ID — early fail, no persist
    let asaasFake: Record<string, unknown>;
    try {
      await createCompanyInstallmentCharge(admin, {
        companyId: COMPANY,
        installmentId: FAKE_INSTALLMENT,
        billingType: 'BOLETO',
      });
      asaasFake = { unexpectedSuccess: true };
    } catch (err) {
      asaasFake = {
        ok: true,
        threw: true,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    // C) Guard: INTER installment forced through Asaas create — WRONG_PROVIDER, no emit
    let wrongProvider: Record<string, unknown>;
    if (!interInstallmentId) {
      wrongProvider = { skipped: true, reason: 'no_inter_unpaid_installment' };
    } else {
      try {
        await createCompanyInstallmentCharge(admin, {
          companyId: COMPANY,
          installmentId: interInstallmentId,
          billingType: 'BOLETO',
        });
        wrongProvider = { unexpectedSuccess: true, installmentIdPrefix: interInstallmentId.slice(0, 8) };
      } catch (err) {
        wrongProvider = {
          installmentIdPrefix: interInstallmentId.slice(0, 8),
          isWrongProvider: err instanceof CompanyAsaasWrongProviderError,
          name: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // D) ASAAS path reachable without emit — paid installment should refuse
    let asaasPaidProbe: Record<string, unknown>;
    if (!asaasPaid?.id) {
      asaasPaidProbe = {
        skipped: true,
        reason: 'no_paid_asaas_installment',
        note: 'ASAAS path already proven via fake installment early-fail',
      };
    } else {
      try {
        await createCompanyInstallmentCharge(admin, {
          companyId: COMPANY,
          installmentId: String(asaasPaid.id),
          billingType: 'BOLETO',
        });
        asaasPaidProbe = { unexpectedSuccess: true };
      } catch (err) {
        asaasPaidProbe = {
          installmentIdPrefix: String(asaasPaid.id).slice(0, 8),
          threw: true,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const after = {
      bank_charges_inter: await countExact(admin, 'bank_charges', {
        company_id: COMPANY,
        provider: 'INTER',
      }),
      company_asaas_charges: await countExact(admin, 'company_asaas_charges', {
        company_id: COMPANY,
      }),
      cash_movements: await countExact(admin, 'cash_movements', {
        company_id: COMPANY,
      }),
    };

    const noNewRecords =
      baseline.bank_charges_inter === after.bank_charges_inter &&
      baseline.company_asaas_charges === after.company_asaas_charges &&
      baseline.cash_movements === after.cash_movements;

    const verdicts = {
      inter_service_reached:
        Boolean(interFake.threw) &&
        /não encontrada|nao encontrada|parcela/i.test(String(interFake.message || '')),
      asaas_service_reached:
        Boolean(asaasFake.threw) &&
        /não encontrada|nao encontrada|parcela/i.test(String(asaasFake.message || '')),
      wrong_provider_guard: wrongProvider.isWrongProvider === true,
      no_new_charge_or_cash: noNewRecords,
      safe_for_real_emit_discussion:
        wrongProvider.isWrongProvider === true &&
        noNewRecords &&
        Boolean(interFake.threw) &&
        Boolean(asaasFake.threw) &&
        !interFake.unexpectedSuccess &&
        !asaasFake.unexpectedSuccess &&
        !wrongProvider.unexpectedSuccess,
    };

    return NextResponse.json({
      ok: true,
      mode: 'routing_guard_only_no_emit',
      companyId: COMPANY,
      accounts: (accounts || []).map((a) => ({
        id: a.id,
        provider: a.provider,
        name: a.name,
      })),
      interUnpaidSample: interRows.map((r) => ({
        idPrefix: String(r.id).slice(0, 8),
        amount: r.amount,
        status: r.status,
      })),
      asaasUnpaidSample: asaasRows.map((r) => ({
        idPrefix: String(r.id).slice(0, 8),
        amount: r.amount,
        status: r.status,
      })),
      probes: {
        interFake,
        asaasFake,
        wrongProvider,
        asaasPaidProbe,
      },
      baseline,
      after,
      noNewRecords,
      verdicts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
