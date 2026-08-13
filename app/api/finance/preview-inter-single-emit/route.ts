/**
 * ONE-SHOT Preview: single controlled Inter Cobrança V3 emit.
 * DELETE after homologation.
 *
 * GET/POST /api/finance/preview-inter-single-emit
 * Header: x-sv-preview-probe: <PREVIEW_INTER_SINGLE_EMIT_SECRET>
 * Query: mode=select|emit (default emit after select validations)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listCompanyFinancialAccounts } from '@/lib/finance/companyFinancialAccountRepository';
import {
  createInterInstallmentCharge,
  findActiveInterBankChargeForReceipt,
} from '@/lib/banking/inter/interSaleChargeService';
import { fetchInterCobrancaByCodigo } from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PREFERRED_COMPANY = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(request: Request): boolean {
  if (process.env.VERCEL_ENV !== 'preview') return false;
  const expected = String(process.env.PREVIEW_INTER_SINGLE_EMIT_SECRET || '').trim();
  if (!expected) return false;
  const got = String(request.headers.get('x-sv-preview-probe') || '').trim();
  return got.length > 0 && got === expected;
}

async function resolveCompany(admin: ReturnType<typeof createClient>) {
  const preferred = await listCompanyFinancialAccounts(admin, PREFERRED_COMPANY, {
    activeOnly: false,
  });
  if (preferred.some((a) => String(a.provider || '').toUpperCase() === 'INTER')) {
    return PREFERRED_COMPANY;
  }
  const { data: integrations } = await admin
    .from('bank_integrations')
    .select('id, company_id')
    .eq('provider', 'INTER')
    .limit(20);
  for (const row of integrations || []) {
    const companyId = String(row.company_id || '').trim();
    if (!companyId) continue;
    const accounts = await listCompanyFinancialAccounts(admin, companyId, {
      activeOnly: false,
    });
    if (accounts.some((a) => String(a.provider || '').toUpperCase() === 'INTER')) {
      return companyId;
    }
  }
  throw new Error('Nenhuma empresa com conta INTER encontrada.');
}

async function pickEligibleInstallment(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  interAccountId: string,
) {
  const { data: rows, error } = await admin
    .from('finance_receipts')
    .select('id, amount, status, due_date, financial_account_id, installment_number, sale_id')
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .eq('financial_account_id', interAccountId)
    .not('status', 'in', '("pago","paid","cancelado","canceled")')
    .neq('amount', 5)
    .order('due_date', { ascending: true })
    .limit(40);
  if (error) throw new Error(error.message);

  for (const row of rows || []) {
    const amount = Number(row.amount);
    if (!(amount > 0) || amount === 5) continue;

    const { data: charges, error: cErr } = await admin
      .from('bank_charges')
      .select('id, external_id, status, amount, created_at')
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .eq('finance_receipt_id', row.id);
    if (cErr) throw new Error(cErr.message);
    if ((charges || []).length > 0) continue;

    const active = await findActiveInterBankChargeForReceipt(admin, companyId, String(row.id));
    if (active?.id) continue;

    return {
      installment: row,
      priorCharges: charges || [],
    };
  }
  return null;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const mode = String(url.searchParams.get('mode') || 'emit').toLowerCase();

  try {
    const admin = getAdmin();
    const companyId = await resolveCompany(admin);
    const accounts = await listCompanyFinancialAccounts(admin, companyId, {
      activeOnly: false,
    });
    const interAccount = accounts.find(
      (a) => String(a.provider || '').toUpperCase() === 'INTER',
    );
    if (!interAccount?.id) {
      return NextResponse.json({ error: 'Conta INTER não encontrada.' }, { status: 404 });
    }

    const picked = await pickEligibleInstallment(admin, companyId, interAccount.id);
    if (!picked) {
      return NextResponse.json(
        {
          ok: false,
          fail: true,
          reason: 'Nenhuma parcela INTER pendente ≠ R$5 sem bank_charges prévio.',
          companyId,
          interAccount: { id: interAccount.id, name: interAccount.name, provider: interAccount.provider },
        },
        { status: 404 },
      );
    }

    const installmentId = String(picked.installment.id);
    const amount = Number(picked.installment.amount);
    const dueDate = String(picked.installment.due_date || '').slice(0, 10);

    const preChecks = {
      installmentId,
      amount,
      dueDate,
      status: picked.installment.status,
      installmentNumber: picked.installment.installment_number,
      financialAccountId: interAccount.id,
      financialAccountName: interAccount.name,
      provider: interAccount.provider,
      priorBankChargesCount: picked.priorCharges.length,
      activeChargeBefore: null as null | { id: string; external_id: string | null },
      amountIsNotFive: amount !== 5,
      providerIsInter: String(interAccount.provider || '').toUpperCase() === 'INTER',
    };

    const activeBefore = await findActiveInterBankChargeForReceipt(
      admin,
      companyId,
      installmentId,
    );
    if (activeBefore?.id) {
      preChecks.activeChargeBefore = {
        id: String(activeBefore.id),
        external_id: activeBefore.external_id ? String(activeBefore.external_id) : null,
      };
      return NextResponse.json({
        ok: false,
        fail: true,
        reason: 'Abortado: parcela já possui bank_charge Inter ativo.',
        preChecks,
      });
    }

    if (!preChecks.amountIsNotFive || !preChecks.providerIsInter || preChecks.priorBankChargesCount > 0) {
      return NextResponse.json({
        ok: false,
        fail: true,
        reason: 'Pré-checagens falharam.',
        preChecks,
      });
    }

    if (mode === 'select') {
      return NextResponse.json({
        ok: true,
        mode: 'select',
        companyId,
        preChecks,
        emit: null,
      });
    }

    const emitStartedAt = new Date().toISOString();
    let emitResult: Record<string, unknown>;
    try {
      const created = await createInterInstallmentCharge(admin, {
        companyId,
        installmentId,
      });
      emitResult = {
        ok: true,
        reused: created.reused,
        chargeId: created.chargeId,
        codigoSolicitacao: created.codigoSolicitacao,
        hasExternalId: Boolean(String(created.codigoSolicitacao || '').trim()),
      };
      if (created.reused) {
        return NextResponse.json({
          ok: false,
          fail: true,
          reason: 'Emissão retornou reused=true — cobrança prévia detectada; não é emissão nova.',
          companyId,
          preChecks,
          emit: emitResult,
        });
      }
      if (!created.chargeId || !created.codigoSolicitacao) {
        return NextResponse.json({
          ok: false,
          fail: true,
          reason: 'Emissão sem chargeId/codigoSolicitacao.',
          companyId,
          preChecks,
          emit: emitResult,
        });
      }
    } catch (err) {
      return NextResponse.json({
        ok: false,
        fail: true,
        reason: 'Falha na emissão Inter.',
        companyId,
        preChecks,
        emitError: err instanceof Error ? err.message : String(err),
      });
    }

    const { data: persisted, error: persErr } = await admin
      .from('bank_charges')
      .select(
        'id, finance_receipt_id, external_id, status, amount, due_date, digitable_line, barcode, pix_copy_paste, our_number, txid, created_at, metadata',
      )
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .eq('finance_receipt_id', installmentId)
      .order('created_at', { ascending: false })
      .limit(3);
    if (persErr) throw new Error(persErr.message);
    const primary = persisted?.[0] || null;

    const secrets = await loadInterSecretsForServer(admin, companyId);
    let interGet: Record<string, unknown> = { skipped: true };
    if (secrets && primary?.external_id) {
      const creds: InterOAuthCredentials = {
        companyId,
        environment: secrets.environment,
        clientId: secrets.clientId,
        clientSecret: secrets.clientSecret,
        certificatePem: secrets.certificatePem,
        privateKeyPem: secrets.privateKeyPem,
      };
      try {
        const detail = await fetchInterCobrancaByCodigo(
          creds,
          String(primary.external_id),
        );
        interGet = {
          ok: true,
          codigoSolicitacao: detail.codigoSolicitacao || primary.external_id,
          situacao: detail.situacao || null,
          seuNumero: detail.seuNumero || null,
          nossoNumero: detail.nossoNumero || null,
          valorNominal: detail.valorNominal ?? null,
          dataVencimento: detail.dataVencimento || null,
          hasPix: Boolean(detail.pixCopiaECola || detail.txid),
          hasBoletoFields: Boolean(detail.linhaDigitavel || detail.nossoNumero),
          linhaDigitavel: detail.linhaDigitavel || null,
          pixCopyPastePresent: Boolean(detail.pixCopiaECola),
        };
      } catch (err) {
        interGet = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const { data: webhookEvents, error: whErr } = await admin
      .from('bank_webhook_events')
      .select('id, processing_status, created_at, provider, external_event_id')
      .eq('company_id', companyId)
      .gte('created_at', emitStartedAt)
      .order('created_at', { ascending: false })
      .limit(10);

    let webhookAfter: Record<string, unknown>;
    if (whErr) {
      webhookAfter = { queryError: whErr.message, count: null, events: [] };
    } else {
      webhookAfter = {
        count: (webhookEvents || []).length,
        events: (webhookEvents || []).map((e) => ({
          id: e.id,
          processing_status: e.processing_status,
          created_at: e.created_at,
          provider: e.provider || null,
          external_event_id: e.external_event_id || null,
        })),
      };
    }

    const pass =
      Boolean(emitResult.ok) &&
      Boolean(emitResult.hasExternalId) &&
      Boolean(primary?.id) &&
      Boolean(String(primary?.external_id || '').trim()) &&
      Number(primary?.amount) === amount &&
      interGet.ok === true;

    return NextResponse.json({
      ok: pass,
      fail: !pass,
      mode: 'emit',
      companyId,
      preChecks,
      emit: emitResult,
      persisted: {
        count: (persisted || []).length,
        primary: primary
          ? {
              id: primary.id,
              finance_receipt_id: primary.finance_receipt_id,
              external_id: primary.external_id,
              status: primary.status,
              amount: primary.amount,
              due_date: primary.due_date,
              digitable_line: primary.digitable_line || null,
              barcode: primary.barcode || null,
              pix_copy_paste_present: Boolean(primary.pix_copy_paste),
              our_number: primary.our_number || null,
              txid: primary.txid || null,
              created_at: primary.created_at,
            }
          : null,
      },
      centralStatusHint: primary
        ? {
            chargeStatusLabelSource: primary.status,
            hasExternalId: Boolean(primary.external_id),
            note: 'Central usa bankChargeToSummaryLike → status + asaasPaymentId=external_id',
          }
        : null,
      interGet,
      webhookAfter,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        fail: true,
        verdict: 'FAIL',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
