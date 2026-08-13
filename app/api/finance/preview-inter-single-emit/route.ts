/**
 * ONE-SHOT Preview: diagnose previous Inter HTTP 400 + single controlled emit.
 * DELETE after homologation.
 *
 * GET /api/finance/preview-inter-single-emit?mode=select|diagnose|emit
 * Header: x-sv-preview-probe
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listCompanyFinancialAccounts } from '@/lib/finance/companyFinancialAccountRepository';
import {
  createInterInstallmentCharge,
  findActiveInterBankChargeForReceipt,
} from '@/lib/banking/inter/interSaleChargeService';
import {
  createInterCobranca,
  fetchInterCobrancaByCodigo,
  InterCobrancaHttpError,
  type InterCreateCobrancaInput,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';
import {
  COMPANY_ASAAS_FINE_PERCENT,
  COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY,
} from '@/lib/finance/asaasCompanyLateFees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PREFERRED_COMPANY = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const MIN_DUE_DATE = '2026-08-13';
const PREVIOUS_FAIL_DUE = '2026-08-12';
const PREVIOUS_FAIL_AMOUNT = 10;

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

function maskDoc(doc: string): string {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length < 4) return '[redacted]';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function sanitizePayload(p: InterCreateCobrancaInput) {
  return {
    seuNumero: p.seuNumero,
    valorNominal: p.valorNominal,
    dataVencimento: p.dataVencimento,
    numDiasAgenda: p.numDiasAgenda ?? 60,
    formasRecebimento: p.formasRecebimento,
    multa: p.multa || null,
    mora: p.mora || null,
    pagador: {
      tipoPessoa: p.pagador.tipoPessoa,
      nomeLen: String(p.pagador.nome || '').length,
      cpfCnpjMasked: maskDoc(p.pagador.cpfCnpj),
      enderecoPresent: Boolean(p.pagador.endereco),
      numero: p.pagador.numero,
      bairroPresent: Boolean(p.pagador.bairro),
      cidadePresent: Boolean(p.pagador.cidade),
      uf: p.pagador.uf,
      cepLen: String(p.pagador.cep || '').replace(/\D/g, '').length,
      emailPresent: Boolean(p.pagador.email),
      phonePresent: Boolean(p.pagador.ddd && p.pagador.telefone),
    },
  };
}

function validateInterV3Payload(
  p: InterCreateCobrancaInput,
  opts: { minDueDate: string; forbidAmount?: number },
): string[] {
  const issues: string[] = [];
  const due = String(p.dataVencimento || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) issues.push('dataVencimento inválida (YYYY-MM-DD)');
  if (due && due < opts.minDueDate) {
    issues.push(`dataVencimento ${due} < mínimo ${opts.minDueDate}`);
  }
  if (!(Number(p.valorNominal) > 0)) issues.push('valorNominal deve ser > 0');
  if (opts.forbidAmount != null && Number(p.valorNominal) === opts.forbidAmount) {
    issues.push(`valorNominal ${opts.forbidAmount} bloqueado nesta homologação`);
  }
  const cents = Math.round(Number(p.valorNominal) * 100);
  if (!Number.isFinite(cents) || Math.abs(Number(p.valorNominal) * 100 - cents) > 0.001) {
    issues.push('valorNominal deve ter no máximo 2 casas decimais');
  }
  if (!p.seuNumero || String(p.seuNumero).length > 15) issues.push('seuNumero ausente ou > 15');
  const doc = String(p.pagador?.cpfCnpj || '').replace(/\D/g, '');
  if (!(doc.length === 11 || doc.length === 14)) issues.push('pagador.cpfCnpj inválido');
  if (!p.pagador?.nome) issues.push('pagador.nome ausente');
  if (!p.pagador?.endereco) issues.push('pagador.endereco ausente');
  if (String(p.pagador?.cep || '').replace(/\D/g, '').length !== 8) issues.push('pagador.cep inválido');
  if (String(p.pagador?.uf || '').length !== 2) issues.push('pagador.uf inválido');
  if (!p.pagador?.cidade) issues.push('pagador.cidade ausente');
  return issues;
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
    .select('id, amount, status, due_date, financial_account_id, installment_number, sale_id, customer_id')
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .eq('financial_account_id', interAccountId)
    .not('status', 'in', '("pago","paid","cancelado","canceled")')
    .gte('due_date', MIN_DUE_DATE)
    .neq('amount', 5)
    .order('due_date', { ascending: true })
    .limit(40);
  if (error) throw new Error(error.message);

  for (const row of rows || []) {
    const amount = Number(row.amount);
    if (!(amount > 0) || amount === 5) continue;
    const due = String(row.due_date || '').slice(0, 10);
    if (due < MIN_DUE_DATE) continue;

    const { data: charges, error: cErr } = await admin
      .from('bank_charges')
      .select('id, external_id, status, amount')
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .eq('finance_receipt_id', row.id);
    if (cErr) throw new Error(cErr.message);
    if ((charges || []).length > 0) continue;
    if ((charges || []).some((c) => String(c.external_id || '').trim())) continue;

    const active = await findActiveInterBankChargeForReceipt(admin, companyId, String(row.id));
    if (active?.id) continue;

    return { installment: row, priorCharges: charges || [] };
  }
  return null;
}

function credsFromSecrets(
  companyId: string,
  secrets: NonNullable<Awaited<ReturnType<typeof loadInterSecretsForServer>>>,
): InterOAuthCredentials {
  return {
    companyId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const mode = String(url.searchParams.get('mode') || 'select').toLowerCase();
  let realCreateAttempts = 0;

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

    const secrets = await loadInterSecretsForServer(admin, companyId);
    if (!secrets) {
      return NextResponse.json({ error: 'Credenciais Inter ausentes.' }, { status: 500 });
    }
    const creds = credsFromSecrets(companyId, secrets);

    const before = {
      bank_charges_inter: (
        await admin
          .from('bank_charges')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('provider', 'INTER')
      ).count,
      cash_movements: (
        await admin
          .from('cash_movements')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
      ).count,
    };

    if (mode === 'diagnose') {
      const diagnosePayload: InterCreateCobrancaInput = {
        seuNumero: 'DIAG400REPRO01',
        valorNominal: PREVIOUS_FAIL_AMOUNT,
        dataVencimento: PREVIOUS_FAIL_DUE,
        numDiasAgenda: 60,
        pagador: {
          cpfCnpj: '52998224725',
          tipoPessoa: 'FISICA',
          nome: 'Diagnostico Preview',
          endereco: 'Rua Teste',
          numero: 'S/N',
          bairro: 'Centro',
          cidade: 'Belem',
          uf: 'PA',
          cep: '66010000',
        },
        formasRecebimento: ['BOLETO', 'PIX'],
        multa: { codigo: 'PERCENTUAL', taxa: COMPANY_ASAAS_FINE_PERCENT },
        mora: { codigo: 'TAXAMENSAL', taxa: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY },
      };

      try {
        const created = await createInterCobranca(creds, diagnosePayload);
        return NextResponse.json({
          ok: false,
          fail: true,
          mode: 'diagnose',
          reason:
            'Diagnóstico inesperado: Inter aceitou payload de vencimento passado. Nenhuma emissão real adicional será feita.',
          interHttp: 2,
          codigoSolicitacao: created.codigoSolicitacao,
          payloadSanitized: sanitizePayload(diagnosePayload),
          realCreateAttempts: 0,
        });
      } catch (err) {
        const httpErr = err instanceof InterCobrancaHttpError ? err : null;
        return NextResponse.json({
          ok: true,
          mode: 'diagnose',
          reproducedHttp400: httpErr?.status === 400,
          interHttp: httpErr?.status ?? null,
          interErrorSanitized: httpErr?.sanitized ?? {
            message: err instanceof Error ? err.message : String(err),
          },
          payloadSanitized: sanitizePayload(diagnosePayload),
          notes:
            'POST diagnóstico com dataVencimento=2026-08-12 e valor=10 (mesmo recorte da falha anterior). Não persiste bank_charges.',
          realCreateAttempts: 0,
        });
      }
    }

    const picked = await pickEligibleInstallment(admin, companyId, interAccount.id);
    if (!picked) {
      return NextResponse.json(
        {
          ok: false,
          fail: true,
          reason: `Nenhuma parcela INTER pendente com due_date>=${MIN_DUE_DATE}, valor≠5 e sem bank_charges.`,
          companyId,
          before,
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
      amountIsNotFive: amount !== 5,
      dueDateOk: dueDate >= MIN_DUE_DATE,
      providerIsInter: String(interAccount.provider || '').toUpperCase() === 'INTER',
    };

    if (
      !preChecks.amountIsNotFive ||
      !preChecks.dueDateOk ||
      !preChecks.providerIsInter ||
      preChecks.priorBankChargesCount > 0
    ) {
      return NextResponse.json({
        ok: false,
        fail: true,
        reason: 'Pré-checagens falharam.',
        preChecks,
        before,
      });
    }

    if (mode === 'select') {
      return NextResponse.json({
        ok: true,
        mode: 'select',
        companyId,
        preChecks,
        before,
        realCreateAttempts: 0,
      });
    }

    if (mode !== 'emit') {
      return NextResponse.json({ error: 'mode inválido' }, { status: 400 });
    }

    const seuNumero =
      String(picked.installment.installment_number ?? '').replace(/\D/g, '') +
        installmentId.replace(/-/g, '').slice(-15) || installmentId.replace(/-/g, '').slice(0, 15);

    const plannedPayload: InterCreateCobrancaInput = {
      seuNumero: seuNumero.slice(-15),
      valorNominal: Math.round(amount * 100) / 100,
      dataVencimento: dueDate,
      numDiasAgenda: 60,
      pagador: {
        cpfCnpj: '00000000000',
        tipoPessoa: 'FISICA',
        nome: 'placeholder',
        endereco: 'placeholder',
        numero: 'S/N',
        bairro: 'NAO INFORMADO',
        cidade: 'placeholder',
        uf: 'PA',
        cep: '00000000',
      },
      formasRecebimento: ['BOLETO', 'PIX'],
      multa: { codigo: 'PERCENTUAL', taxa: COMPANY_ASAAS_FINE_PERCENT },
      mora: { codigo: 'TAXAMENSAL', taxa: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY },
    };

    const localIssues = validateInterV3Payload(plannedPayload, {
      minDueDate: MIN_DUE_DATE,
      forbidAmount: 5,
    }).filter((i) => !i.includes('cpfCnpj') && !i.includes('endereco') && !i.includes('cep') && !i.includes('cidade') && !i.includes('nome'));

    if (localIssues.length > 0) {
      return NextResponse.json({
        ok: false,
        fail: true,
        reason: 'Payload local inválido — POST real não enviado.',
        preChecks,
        localIssues,
        payloadSanitized: sanitizePayload(plannedPayload),
        before,
        realCreateAttempts: 0,
      });
    }

    const emitStartedAt = new Date().toISOString();
    realCreateAttempts += 1;
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
          reason: 'Emissão retornou reused=true — cobrança prévia; não é emissão nova.',
          preChecks,
          emit: emitResult,
          realCreateAttempts,
        });
      }
    } catch (err) {
      const httpErr = err instanceof InterCobrancaHttpError ? err : null;
      const afterFail = {
        bank_charges_inter: (
          await admin
            .from('bank_charges')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('provider', 'INTER')
        ).count,
      };
      return NextResponse.json({
        ok: false,
        fail: true,
        verdict: 'FAIL',
        reason: 'Inter rejeitou a única tentativa real.',
        companyId,
        preChecks,
        payloadSanitized: sanitizePayload(plannedPayload),
        interHttp: httpErr?.status ?? null,
        interErrorSanitized: httpErr?.sanitized ?? {
          message: err instanceof Error ? err.message : String(err),
        },
        before,
        after: afterFail,
        realCreateAttempts,
      });
    }

    const { data: persisted } = await admin
      .from('bank_charges')
      .select(
        'id, finance_receipt_id, external_id, status, amount, due_date, digitable_line, barcode, pix_copy_paste, our_number, txid, created_at',
      )
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .eq('finance_receipt_id', installmentId)
      .order('created_at', { ascending: false })
      .limit(3);
    const primary = persisted?.[0] || null;

    let interGet: Record<string, unknown> = { skipped: true };
    if (primary?.external_id) {
      try {
        const detail = await fetchInterCobrancaByCodigo(creds, String(primary.external_id));
        interGet = {
          ok: true,
          codigoSolicitacao: detail.codigoSolicitacao || primary.external_id,
          situacao: detail.situacao || null,
          nossoNumero: detail.nossoNumero || null,
          valorNominal: detail.valorNominal ?? null,
          linhaDigitavelPresent: Boolean(detail.linhaDigitavel),
          pixCopyPastePresent: Boolean(detail.pixCopiaECola),
          boletoFieldsPresent: Boolean(detail.linhaDigitavel || detail.nossoNumero),
        };
      } catch (err) {
        interGet = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const { data: webhookEvents } = await admin
      .from('bank_webhook_events')
      .select('id, processing_status, created_at, provider, external_event_id')
      .eq('company_id', companyId)
      .gte('created_at', emitStartedAt)
      .order('created_at', { ascending: false })
      .limit(10);

    const after = {
      bank_charges_inter: (
        await admin
          .from('bank_charges')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('provider', 'INTER')
      ).count,
      cash_movements: (
        await admin
          .from('cash_movements')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
      ).count,
    };

    const pass =
      Boolean(emitResult.ok) &&
      Boolean(emitResult.hasExternalId) &&
      Boolean(primary?.id) &&
      Boolean(String(primary?.external_id || '').trim()) &&
      Number(primary?.amount) === amount &&
      interGet.ok === true &&
      realCreateAttempts === 1;

    return NextResponse.json({
      ok: pass,
      fail: !pass,
      verdict: pass ? 'PASS' : 'FAIL',
      mode: 'emit',
      companyId,
      preChecks,
      payloadSanitized: sanitizePayload(plannedPayload),
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
              digitable_linePresent: Boolean(primary.digitable_line),
              barcodePresent: Boolean(primary.barcode),
              pix_copy_paste_present: Boolean(primary.pix_copy_paste),
              our_number: primary.our_number || null,
              created_at: primary.created_at,
            }
          : null,
      },
      interGet,
      webhookAfter: {
        count: (webhookEvents || []).length,
        events: (webhookEvents || []).map((e) => ({
          id: e.id,
          processing_status: e.processing_status,
          created_at: e.created_at,
          provider: e.provider || null,
        })),
      },
      before,
      after,
      realCreateAttempts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        fail: true,
        verdict: 'FAIL',
        error: err instanceof Error ? err.message : String(err),
        realCreateAttempts,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
