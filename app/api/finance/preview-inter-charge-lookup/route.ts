/**
 * ONE-SHOT Preview: GET-only consult of existing Inter charge + webhook.
 * Does NOT create charges. DELETE after homologation.
 *
 * GET /api/finance/preview-inter-charge-lookup
 * Header: x-sv-preview-probe
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchInterCobrancaByCodigo,
  getInterCobrancaWebhook,
  normalizeInterCobrancaDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import { refreshInterChargeArtifacts, bankChargeToSummaryLike } from '@/lib/banking/inter/interSaleChargeService';
import { buildInterCarnePdfBytes } from '@/lib/banking/inter/interCarnePdf';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPANY = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const CODIGO = '937fb876-9e2f-4cf2-a2aa-d6be84923b7f';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(request: Request): boolean {
  if (process.env.VERCEL_ENV !== 'preview') return false;
  const expected = String(process.env.PREVIEW_INTER_LOOKUP_SECRET || '').trim();
  if (!expected) return false;
  const got = String(request.headers.get('x-sv-preview-probe') || '').trim();
  return got.length > 0 && got === expected;
}

function inventory(
  value: unknown,
  prefix = '',
  depth = 0,
  out: Record<string, { type: string; len?: number; preview?: string }> = {},
): Record<string, { type: string; len?: number; preview?: string }> {
  if (depth > 5 || value == null) return out;
  if (Array.isArray(value)) {
    out[prefix || '$'] = { type: `array(${value.length})` };
    if (value[0] && typeof value[0] === 'object') inventory(value[0], `${prefix}[0]`, depth + 1, out);
    return out;
  }
  if (typeof value !== 'object') {
    const s = String(value);
    out[prefix || '$'] = {
      type: typeof value,
      len: s.length,
      preview: s.length <= 24 ? s : `${s.slice(0, 8)}…len=${s.length}`,
    };
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      out[path] = { type: Array.isArray(v) ? 'array' : 'object' };
      inventory(v, path, depth + 1, out);
    } else {
      const s = v == null ? '' : String(v);
      out[path] = {
        type: v == null ? 'null' : typeof v,
        len: s.length,
        preview: s.length <= 32 ? s : `${s.slice(0, 10)}…len=${s.length}`,
      };
    }
  }
  return out;
}

function siblingArtifacts(raw: Record<string, unknown>) {
  const boleto =
    raw.boleto && typeof raw.boleto === 'object' ? (raw.boleto as Record<string, unknown>) : {};
  const pix = raw.pix && typeof raw.pix === 'object' ? (raw.pix as Record<string, unknown>) : {};
  const cobranca =
    raw.cobranca && typeof raw.cobranca === 'object'
      ? (raw.cobranca as Record<string, unknown>)
      : raw;
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      const s = v != null ? String(v).trim() : '';
      if (s) return { present: true, len: s.length };
    }
    return { present: false, len: 0 };
  };
  return {
    linhaDigitavel: pick(
      cobranca.linhaDigitavel,
      boleto.linhaDigitavel,
      raw.linhaDigitavel,
    ),
    codigoBarras: pick(cobranca.codigoBarras, boleto.codigoBarras, raw.codigoBarras),
    pixCopiaECola: pick(
      cobranca.pixCopiaECola,
      cobranca.pixCopiaCola,
      pix.pixCopiaECola,
      pix.pixCopiaCola,
      raw.pixCopiaECola,
    ),
    nossoNumero: pick(cobranca.nossoNumero, boleto.nossoNumero, raw.nossoNumero),
  };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const codigo = String(url.searchParams.get('codigo') || CODIGO).trim() || CODIGO;
    const includeList = url.searchParams.get('list') === '1';
    const includeCarne = url.searchParams.get('carne') === '1';

    const admin = getAdmin();
    const secrets = await loadInterSecretsForServer(admin, COMPANY);
    if (!secrets) {
      return NextResponse.json({ error: 'Credenciais Inter ausentes.' }, { status: 500 });
    }
    const creds: InterOAuthCredentials = {
      companyId: COMPANY,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };

    const { data: local, error: localErr } = await admin
      .from('bank_charges')
      .select(
        'id, finance_receipt_id, sale_id, external_id, status, amount, due_date, digitable_line, barcode, pix_copy_paste, our_number, txid, paid_at, paid_amount, created_at, updated_at',
      )
      .eq('company_id', COMPANY)
      .eq('provider', 'INTER')
      .eq('external_id', codigo)
      .maybeSingle();
    if (localErr) throw new Error(localErr.message);

    const detail = await fetchInterCobrancaByCodigo(creds, codigo);
    const raw = (detail.raw || {}) as Record<string, unknown>;
    const normalized = normalizeInterCobrancaDetail(raw, codigo);
    const fromSiblings = siblingArtifacts(raw);

    let persist: {
      inserted: boolean;
      created: boolean;
      paid?: boolean;
      bankChargeId?: string;
      error?: string;
    } = { inserted: false, created: false };
    try {
      const refreshed = await refreshInterChargeArtifacts(admin, {
        companyId: COMPANY,
        externalId: codigo,
        detail: normalized,
      });
      persist = {
        inserted: refreshed.inserted,
        created: refreshed.created,
        paid: Boolean(refreshed.paid),
        bankChargeId: refreshed.bankChargeId,
      };
    } catch (err) {
      persist = {
        inserted: false,
        created: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const { data: localAfter } = await admin
      .from('bank_charges')
      .select(
        'id, finance_receipt_id, sale_id, external_id, status, amount, due_date, digitable_line, barcode, pix_copy_paste, our_number, txid, paid_at, paid_amount, created_at, updated_at',
      )
      .eq('company_id', COMPANY)
      .eq('provider', 'INTER')
      .eq('external_id', codigo)
      .maybeSingle();
    const localRow = localAfter || local;

    const { data: webhookEvents, error: whErr } = await admin
      .from('bank_webhook_events')
      .select('id, processing_status, created_at, provider, event_type, external_event_id')
      .eq('company_id', COMPANY)
      .order('created_at', { ascending: false })
      .limit(20);

    const createdAt = local?.created_at ? String(local.created_at) : null;
    const events = (webhookEvents || []).map((e) => ({
      id: e.id,
      processing_status: e.processing_status,
      created_at: e.created_at,
      provider: e.provider || null,
      event_type: e.event_type || null,
      external_event_id: e.external_event_id || null,
      afterChargeCreated: createdAt ? String(e.created_at) >= createdAt : null,
      mentionsCodigo:
        String(e.external_event_id || '').includes(codigo) ||
        String(e.event_type || '').includes(codigo),
    }));

    let webhookReg: { webhookUrlHost?: string; criacao?: string | null } | null = null;
    try {
      const reg = await getInterCobrancaWebhook(creds);
      if (reg?.webhookUrl) {
        const u = new URL(reg.webhookUrl);
        webhookReg = { webhookUrlHost: u.host, criacao: reg.criacao || null };
      }
    } catch (err) {
      webhookReg = { webhookUrlHost: `error:${err instanceof Error ? err.message : String(err)}` };
    }

    const artifacts = {
      linhaDigitavel: Boolean(normalized.linhaDigitavel) || fromSiblings.linhaDigitavel.present,
      codigoBarras: Boolean(normalized.codigoBarras) || fromSiblings.codigoBarras.present,
      pixCopiaECola: Boolean(normalized.pixCopiaECola) || fromSiblings.pixCopiaECola.present,
      nossoNumero: Boolean(normalized.nossoNumero) || fromSiblings.nossoNumero.present,
    };
    const allMaterialized =
      artifacts.linhaDigitavel &&
      artifacts.codigoBarras &&
      artifacts.pixCopiaECola &&
      artifacts.nossoNumero;

    const { count: bankChargesCount } = await admin
      .from('bank_charges')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', COMPANY)
      .eq('provider', 'INTER');
    const { data: cashRows } = await admin
      .from('cash_movements')
      .select('id, amount, metadata, status')
      .eq('company_id', COMPANY)
      .eq('status', 'ativo')
      .limit(1000);
    const interCash = (cashRows || []).filter((row) => {
      const md = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
      return String(md.provider || '') === 'INTER';
    });
    let list: Array<Record<string, unknown>> | null = null;
    if (includeList) {
      const { data: allCharges } = await admin
        .from('bank_charges')
        .select('id, amount, status, external_id, paid_at, finance_receipt_id, sale_id')
        .eq('company_id', COMPANY)
        .eq('provider', 'INTER')
        .order('created_at', { ascending: false })
        .limit(50);
      list = (allCharges || []) as Array<Record<string, unknown>>;
    }

    let carneLayout: Record<string, unknown> | null = null;
    if (includeCarne) {
      const saleId = String(
        (localRow as { sale_id?: string } | null)?.sale_id || '',
      ).trim();
      const { data: saleCharges } = await admin
        .from('bank_charges')
        .select('*')
        .eq('company_id', COMPANY)
        .eq('provider', 'INTER')
        .eq('sale_id', saleId || '00000000-0000-0000-0000-000000000000')
        .order('due_date', { ascending: true })
        .limit(20);
      const items = [];
      for (const row of saleCharges || []) {
        const rec = row as Record<string, unknown>;
        const ext = String(rec.external_id || '').trim();
        if (!ext) continue;
        const status = String(rec.status || '').toUpperCase();
        if (status === 'CANCELLED' || status === 'FAILED' || status === 'EXPIRED') continue;
        items.push({
          charge: bankChargeToSummaryLike(rec, COMPANY),
          parcelLabel: `Parcela ${items.length + 1}`,
        });
      }
      const built = await buildInterCarnePdfBytes({
        items,
        emittedCount: items.length,
        totalParcels: Math.max(items.length, 10),
        customerName: 'Preview GET-only',
      });
      carneLayout = {
        saleId: saleId || null,
        boletos: items.length,
        officialPdfs: built.includedOfficialPdfs,
        skippedWithoutPdf: built.skippedWithoutPdf,
        pageCount: built.pageCount,
        boletoSheetCount: built.boletoSheetCount,
        coverPages: built.coverPages,
        createAttempted: false,
      };
    }

    return NextResponse.json({
      ok: true,
      mode: 'lookup_only',
      codigoSolicitacao: codigo,
      inter: {
        situacao: normalized.situacao,
        valorNominal: normalized.valorNominal,
        artifactsNormalized: {
          linhaDigitavel: Boolean(normalized.linhaDigitavel),
          codigoBarras: Boolean(normalized.codigoBarras),
          pixCopiaECola: Boolean(normalized.pixCopiaECola),
          nossoNumero: Boolean(normalized.nossoNumero),
        },
        artifactsIncludingSiblings: artifacts,
        siblingScan: fromSiblings,
        rawKeyInventory: inventory(raw),
      },
      local: localRow
        ? {
            id: localRow.id,
            finance_receipt_id: localRow.finance_receipt_id,
            status: localRow.status,
            amount: localRow.amount,
            due_date: localRow.due_date,
            digitable_line: Boolean(localRow.digitable_line),
            barcode: Boolean(localRow.barcode),
            pix_copy_paste: Boolean(localRow.pix_copy_paste),
            our_number: Boolean(localRow.our_number),
            txid: Boolean(localRow.txid),
            paid_at: localRow.paid_at || null,
            paid_amount: localRow.paid_amount ?? null,
            created_at: localRow.created_at,
            updated_at: localRow.updated_at,
          }
        : null,
      persist,
      counts: {
        bankChargesInter: bankChargesCount ?? 0,
        cashMovementsInter: interCash.length,
      },
      list,
      carneLayout,
      webhook: {
        registration: webhookReg,
        queryError: whErr?.message || null,
        recentCount: events.length,
        afterChargeCount: events.filter((e) => e.afterChargeCreated).length,
        mentionsCodigoCount: events.filter((e) => e.mentionsCodigo).length,
        events: events.slice(0, 8),
      },
      verdict: allMaterialized && localRow?.digitable_line && localRow?.pix_copy_paste
        ? 'PASS'
        : 'PENDING_OR_FAIL',
      createAttempted: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        createAttempted: false,
      },
      { status: 500 },
    );
  }
}
