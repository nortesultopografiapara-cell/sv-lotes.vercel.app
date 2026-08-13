import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getInterWebhookHmacSecretFromEnv,
  validateInterWebhookHmac,
} from '@/lib/banking/inter/interWebhookHmac';
import {
  extractInterCallbackItems,
  processInterWebhookCallbackItem,
} from '@/lib/banking/inter/interWebhookProcessor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Endpoint interno: receptor mTLS → SV LOTES.
 * Exige HMAC-SHA256 (X-SV-Timestamp, X-SV-Nonce, X-SV-Signature).
 * NÃO é o endpoint público cadastrado no Inter.
 */
export async function POST(request: Request) {
  const secret = getInterWebhookHmacSecretFromEnv();
  if (!secret) {
    return NextResponse.json(
      { error: 'INTER_WEBHOOK_HMAC_SECRET não configurado.' },
      { status: 503 },
    );
  }

  const bodyText = await request.text();
  const hmac = validateInterWebhookHmac({
    secret,
    timestamp: request.headers.get('x-sv-timestamp'),
    nonce: request.headers.get('x-sv-nonce'),
    signature: request.headers.get('x-sv-signature'),
    body: bodyText,
  });
  if (!hmac.ok) {
    return NextResponse.json({ error: hmac.message, code: hmac.code }, { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const companyId = String(parsed.companyId || '').trim();
  if (!companyId) {
    return NextResponse.json({ error: 'companyId obrigatório.' }, { status: 400 });
  }

  const items = extractInterCallbackItems(parsed.payload ?? parsed.items ?? parsed);
  if (!items.length) {
    return NextResponse.json({ error: 'Payload sem itens de cobrança.' }, { status: 400 });
  }

  try {
    const admin = getAdmin();
    const results = [];
    for (const item of items) {
      const result = await processInterWebhookCallbackItem(admin, {
        companyId,
        item,
        receiverMeta: {
          receivedAt: parsed.receivedAt || null,
          receiverNonce: parsed.receiverNonce || null,
          contaCorrente: parsed.contaCorrente || null,
        },
      });
      results.push(result);
    }

    // Nunca ecoar payload bruto
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      results: results.map((r) => ({
        ok: r.ok,
        duplicate: r.duplicate,
        ignored: r.ignored,
        paid: r.paid,
        message: r.message,
        codigoSolicitacao: r.codigoSolicitacao,
        origemRecebimento: r.origemRecebimento,
      })),
    });
  } catch (err) {
    console.error(
      '[finance/inter/webhook/internal]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno Inter webhook.' },
      { status: 500 },
    );
  }
}
