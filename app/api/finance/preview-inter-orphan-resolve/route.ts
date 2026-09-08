/**
 * DEVELOP/Preview — resolve somente as duas órfãs LT 22.
 * POST. Sem RPC. Sem vigentes/pagas. Remover após homologação.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { interExternalChargeProvider } from '@/lib/finance/externalCharges/interAdapter';
import { reduceTitleTransferExternalCharges } from '@/lib/finance/saleTitleTransferExternalCharges';
import { resolveTitleTransferClassifiedOrphanCharges } from '@/lib/finance/saleTitleTransferOrphanChargesService';
import {
  DEVELOP_PROJECT_REF,
  isProductionSupabaseRuntime,
  resolveSupabaseProjectRef,
} from '@/lib/homolog/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPANY = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const SALE_ID = '39ca3467-270e-4434-81b9-7ab145275f81';
const ALLOWED = new Set([
  'cb342d20-caf8-4b1d-b477-1590992e6a90',
  'dc092750-4759-4409-b8c2-1afd4aa93c4a',
]);

export async function POST() {
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production') {
    return NextResponse.json({ error: 'Not found', reason: 'vercel-production' }, { status: 404 });
  }
  if (isProductionSupabaseRuntime()) {
    return NextResponse.json({ error: 'Not found', reason: 'supabase-production' }, { status: 404 });
  }
  const ref = resolveSupabaseProjectRef();
  if (ref !== DEVELOP_PROJECT_REF) {
    return NextResponse.json(
      { error: 'Not found', reason: 'supabase-not-develop', ref: ref || null },
      { status: 404 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const receiptsRes = await admin
    .from('finance_receipts')
    .select('id, status')
    .eq('sale_id', SALE_ID);
  if (receiptsRes.error) {
    return NextResponse.json({ error: receiptsRes.error.message, writes: false }, { status: 500 });
  }
  const charges = await interExternalChargeProvider.listChargesForReceipts(admin, {
    companyId: COMPANY,
    saleId: SALE_ID,
    receiptIds: (receiptsRes.data || []).map((row) => String(row.id)),
  });
  const reduced = reduceTitleTransferExternalCharges({
    receipts: receiptsRes.data || [],
    charges,
  });
  const orphans = reduced.orphans.filter((row) => ALLOWED.has(row.chargeId));
  if (orphans.length !== reduced.orphans.length) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Há órfã fora do allowlist desta homologação.',
        executeTransfer: false,
      },
      { status: 409 },
    );
  }

  try {
    const protectedIds = [...reduced.paid, ...reduced.open].map((row) => row.chargeId);
    const beforeProtected = await admin
      .from('bank_charges')
      .select('id, status, external_id, finance_receipt_id')
      .in('id', protectedIds.length ? protectedIds : ['00000000-0000-0000-0000-000000000000']);

    const resolved = await resolveTitleTransferClassifiedOrphanCharges(admin, {
      companyId: COMPANY,
      saleId: SALE_ID,
      orphans,
      paid: reduced.paid,
      open: reduced.open,
    });
    const afterCharges = await interExternalChargeProvider.listChargesForReceipts(admin, {
      companyId: COMPANY,
      saleId: SALE_ID,
      receiptIds: (receiptsRes.data || []).map((row) => String(row.id)),
    });
    const after = reduceTitleTransferExternalCharges({
      receipts: receiptsRes.data || [],
      charges: afterCharges,
    });
    const afterProtected = await admin
      .from('bank_charges')
      .select('id, status, external_id, finance_receipt_id')
      .in('id', protectedIds.length ? protectedIds : ['00000000-0000-0000-0000-000000000000']);
    const afterOrphans = await admin
      .from('bank_charges')
      .select('id, status, external_id, finance_receipt_id, metadata')
      .in('id', [...ALLOWED]);

    return NextResponse.json(
      {
        ok: after.orphans.length === 0,
        executeTransfer: false,
        persistReceipts: false,
        persistSale: false,
        dbRef: ref,
        paid: after.paid.length,
        open: after.open.length,
        orphans: after.orphans.length,
        protectedPaidIds: reduced.paid.map((row) => row.chargeId),
        protectedOpenIds: reduced.open.map((row) => row.chargeId),
        protectedBefore: beforeProtected.data || [],
        protectedAfter: afterProtected.data || [],
        localOrphansAfter: afterOrphans.data || [],
        resolvedChargeIds: resolved.resolvedChargeIds,
        items: resolved.items,
      },
      { status: after.orphans.length === 0 ? 200 : 409 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        executeTransfer: false,
        error: message,
      },
      { status: 409 },
    );
  }
}
