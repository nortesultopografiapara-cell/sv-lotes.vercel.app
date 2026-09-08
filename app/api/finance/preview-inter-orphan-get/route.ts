/**
 * Preview GET-only: consulta Inter das duas órfãs LT 22.
 * Sem persistência. Sem POST /cancelar. Remover após o diagnóstico.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchInterCobrancaByCodigo,
  sanitizeInterOperatorDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import { classifyRemoteInterSituacaoForRelease } from '@/lib/finance/releaseLotShared';
import {
  DEVELOP_PROJECT_REF,
  isProductionSupabaseRuntime,
  resolveSupabaseProjectRef,
} from '@/lib/homolog/env';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPANY = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const ALLOWED = new Set([
  'b17a8b34-6fe5-4b5b-b6fd-b6f153e17708',
  '2bbda860-bc31-4359-bfbd-cb397fca4bdb',
]);

const CLASSIFICATION_LABEL: Record<string, string> = {
  cancel: 'cancelável',
  preserve_paid: 'preservar',
  already_cancelled: 'já encerrada',
  block_non_removable: 'bloqueada',
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (Array.isArray(v)) {
      const joined = v.map((x) => String(x || '').trim()).filter(Boolean);
      if (joined.length) return joined.join(',');
    }
    const s = v == null ? '' : String(v).trim();
    if (s) return s;
  }
  return null;
}

function extractViolacoes(raw: Record<string, unknown>): Array<{
  razao: string | null;
  propriedade: string | null;
  valor: string | null;
}> {
  const cobranca = asRecord(raw.cobranca) || raw;
  const list = [raw.violacoes, cobranca.violacoes]
    .find((item) => Array.isArray(item)) as unknown[] | undefined;
  if (!list) return [];
  return list.slice(0, 20).map((item) => {
    const row = asRecord(item) || {};
    return {
      razao: pickString(row.razao),
      propriedade: pickString(row.propriedade),
      valor: pickString(row.valor),
    };
  });
}

export async function GET(request: Request) {
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

  const codigo = String(new URL(request.url).searchParams.get('codigo') || '').trim();
  if (!ALLOWED.has(codigo)) {
    return NextResponse.json({ error: 'codigo não autorizado neste diagnóstico.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const local = await admin
    .from('bank_charges')
    .select('id, financial_account_id, integration_id')
    .eq('company_id', COMPANY)
    .eq('provider', 'INTER')
    .eq('external_id', codigo)
    .maybeSingle();
  if (local.error) {
    return NextResponse.json({ error: local.error.message, writes: false }, { status: 500 });
  }

  try {
    const secrets = await loadInterSecretsForServer(admin, COMPANY, {
      integrationId: local.data?.integration_id ? String(local.data.integration_id) : null,
      financialAccountId: local.data?.financial_account_id
        ? String(local.data.financial_account_id)
        : null,
    });
    if (!secrets) {
      return NextResponse.json({ error: 'Credenciais Inter ausentes.' }, { status: 500 });
    }

    const creds: InterOAuthCredentials = {
      companyId: COMPANY,
      integrationId: secrets.integrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };

    const detail = await fetchInterCobrancaByCodigo(creds, codigo);
    const raw = (detail.raw || {}) as Record<string, unknown>;
    const cobranca = asRecord(raw.cobranca) || raw;
    const boleto = asRecord(raw.boleto) || asRecord(cobranca.boleto) || {};
    const situacao = String(detail.situacao || '').trim().toUpperCase();
    const disposition = classifyRemoteInterSituacaoForRelease(situacao);
    const origem = asRecord(cobranca.origem) || asRecord(raw.origem);
    const mensagem = pickString(cobranca.mensagem, raw.mensagem, cobranca.observacao, raw.observacao);
    const falha = pickString(cobranca.falha, raw.falha, origem?.falha);

    return NextResponse.json({
      ok: true,
      writes: false,
      persistAttempted: false,
      refreshAttempted: false,
      cancelAttempted: false,
      emitAttempted: false,
      asaasAttempted: false,
      transferAttempted: false,
      httpMethod: 'GET',
      path: `/cobrancas/${codigo}`,
      dbRef: ref,
      interEnvironment: secrets.environment,
      codigoSolicitacao: detail.codigoSolicitacao || codigo,
      nossoNumero: detail.nossoNumero || null,
      seuNumero: detail.seuNumero || null,
      situacao: situacao || null,
      valorNominal: detail.valorNominal ?? null,
      vencimento: pickString(
        cobranca.dataVencimento,
        cobranca.dataDeVencimento,
        raw.dataVencimento,
        boleto.dataVencimento,
      ),
      tipo: pickString(cobranca.tipoCobranca, cobranca.tipo, raw.tipoCobranca, raw.tipo),
      formasRecebimento: pickString(
        cobranca.formasRecebimento,
        raw.formasRecebimento,
        cobranca.formaRecebimento,
      ),
      dataHoraSituacao: detail.dataHoraSituacao || null,
      processingError: detail.processingError
        ? sanitizeInterOperatorDetail(detail.processingError)
        : null,
      mensagem: mensagem ? sanitizeInterOperatorDetail(mensagem) : null,
      falha: falha ? sanitizeInterOperatorDetail(falha) : null,
      violacoes: extractViolacoes(raw),
      disposition,
      classificacao: CLASSIFICATION_LABEL[disposition] || 'bloqueada',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        writes: false,
        persistAttempted: false,
        refreshAttempted: false,
        cancelAttempted: false,
        error: sanitizeInterOperatorDetail(message) || 'Falha ao consultar cobrança Inter.',
      },
      { status: 500 },
    );
  }
}
