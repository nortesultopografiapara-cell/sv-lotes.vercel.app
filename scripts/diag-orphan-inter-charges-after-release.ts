/**
 * Diagnóstico READ-ONLY: bank_charges Inter ativos ligados a vendas já CANCELLED.
 * NÃO cancela nada no Inter nem altera o banco.
 *
 * npx tsx scripts/diag-orphan-inter-charges-after-release.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

async function main() {
  if (!url || !key || key === '[SENSITIVE]') {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'Sem SUPABASE_URL/SERVICE_ROLE no ambiente — diagnóstico DB não executado.',
          proposal: [
            'Listar bank_charges INTER com status PENDING|REGISTERED|OVERDUE',
            'Join sales onde status CANCELLED/cancelado',
            'Para cada: anotar external_id (codigoSolicitacao), sale_id, finance_receipt_id',
            'Saneamento manual: cancelar no Internet Banking Inter OU via POST /cancelar admin; depois UPDATE local status=CANCELLED',
            'Nunca cancelar se situacao remota = RECEBIDO/PAGO',
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: openCharges, error } = await admin
    .from('bank_charges')
    .select(
      'id, company_id, sale_id, finance_receipt_id, external_id, status, amount, due_date, metadata, created_at',
    )
    .eq('provider', 'INTER')
    .in('status', ['PENDING', 'REGISTERED', 'OVERDUE'])
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('QUERY_FAILED', error.message);
    process.exit(1);
  }

  const saleIds = [
    ...new Set(
      (openCharges || [])
        .map((c) => String(c.sale_id || '').trim())
        .filter(Boolean),
    ),
  ];

  const cancelledSaleIds = new Set<string>();
  const saleStatus = new Map<string, string>();
  if (saleIds.length) {
    const { data: sales } = await admin
      .from('sales')
      .select('id, status')
      .in('id', saleIds);
    for (const s of sales || []) {
      const st = String(s.status || '');
      saleStatus.set(String(s.id), st);
      const low = st.toLowerCase();
      if (
        low === 'cancelled' ||
        low === 'canceled' ||
        low === 'cancelado' ||
        low === 'cancelada'
      ) {
        cancelledSaleIds.add(String(s.id));
      }
    }
  }

  const orphans = (openCharges || []).filter((c) => {
    const sid = String(c.sale_id || '').trim();
    return sid && cancelledSaleIds.has(sid);
  });

  const report = {
    ok: true,
    openInterChargesScanned: (openCharges || []).length,
    orphanCount: orphans.length,
    orphans: orphans.map((c) => ({
      bankChargeId: c.id,
      saleId: c.sale_id,
      saleStatus: saleStatus.get(String(c.sale_id)) || null,
      financeReceiptId: c.finance_receipt_id,
      externalId_codigoSolicitacao: c.external_id,
      localStatus: c.status,
      interSituacao:
        c.metadata && typeof c.metadata === 'object'
          ? (c.metadata as { interSituacao?: string }).interSituacao || null
          : null,
      amount: c.amount,
      dueDate: c.due_date,
      createdAt: c.created_at,
    })),
    safeSanitationProposal: [
      '1) Para cada orphan: GET /cobrancas/{codigoSolicitacao} e confirmar situacao.',
      '2) Se A_RECEBER/ATRASADO/EM_PROCESSAMENTO: POST /cancelar (motivo ACERTOS) no painel admin/manual.',
      '3) Se RECEBIDO/PAGO: NÃO cancelar — reconciliar parcela paga.',
      '4) Após cancel remoto OK: UPDATE bank_charges.status=CANCELLED.',
      '5) Não automatizar em massa nesta etapa (risco de baixa indevida).',
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
