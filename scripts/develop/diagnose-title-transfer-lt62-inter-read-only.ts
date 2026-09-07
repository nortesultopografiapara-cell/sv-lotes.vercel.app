/**
 * Diagnóstico READ-ONLY — Transferência QD 02 / LT 62 no DEVELOP.
 * Sem UPDATE. Sem execute_sale_title_transfer. Sem HTTP Inter/Asaas.
 *
 * npx tsx scripts/develop/diagnose-title-transfer-lt62-inter-read-only.ts
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'path';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';
import { classifyRemoteInterSituacaoForRelease } from '../../lib/finance/releaseLotShared';

const SALE_ID = 'fdfc285c-d77a-460f-a1f6-6af4232e569b';
const BLOCK_ID = '1ecf703a-feaa-4d95-89e3-0bd59da27d0e';
const BANK_DOCS = [
  '587726044604763',
  '424880184857824',
  '130844781606788',
  '441499320177021',
];

function loadMergedEnv(): Record<string, string> {
  const files = ['.env.develop.apply', '.env.local', '.env.vercel.preview.live'];
  const merged: Record<string, string> = {};
  const root = path.join(__dirname, '..', '..');
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val || /SENSITIVE|REDACTED/i.test(val)) continue;
      if (!merged[key]) merged[key] = val;
    }
  }
  return merged;
}

function resolveDatabaseUrl(env: Record<string, string>): string | null {
  const keys = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL'];
  for (const key of keys) {
    const v = String(env[key] || process.env[key] || '').trim();
    if (v && /^postgres(ql)?:\/\//i.test(v) && !/SENSITIVE|REDACTED/i.test(v)) {
      return v;
    }
  }
  const sibling = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'sv-lotes.vercel.app',
    '.env.develop.apply.env',
  );
  if (!fs.existsSync(sibling)) return null;
  const raw = fs.readFileSync(sibling, 'utf8');
  const m = raw.match(
    /postgresql:\/\/postgres:([^@\s]+)@db\.zumwvcxgrpxggyxomzic\.supabase\.co:5432\/postgres/,
  );
  if (!m) return null;
  return `postgresql://postgres:${m[1]}@db.${DEVELOP_PROJECT_REF}.supabase.co:5432/postgres`;
}

function databaseUrlRef(url: string): string | null {
  try {
    const u = new URL(url.replace(/^postgresql:/i, 'postgres:'));
    const host = u.hostname.toLowerCase();
    const db = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (db) return db[1];
    const pool = host.match(/^([a-z0-9]+)\.pooler\.supabase\.com$/i);
    if (pool) return pool[1];
    const user = decodeURIComponent(u.username || '');
    const mm =
      user.match(/\.([a-z0-9]+)$/i) || user.match(/^postgres\.([a-z0-9]+)/i);
    return mm ? mm[1] : resolveSupabaseProjectRef(`https://${host}`);
  } catch {
    return null;
  }
}

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function pickMeta(meta: Record<string, unknown> | null) {
  if (!meta) return null;
  const keys = [
    'codigoSolicitacao',
    'seuNumero',
    'nossoNumero',
    'interSituacao',
    'remoteCancelConfirmed',
    'providerCancelledAt',
    'lotSwapCancelledAt',
    'numeroDocumento',
    'documento',
    'seu_numero',
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  return out;
}

function identifierKind(value: string | null): string {
  if (!value) return 'missing';
  if (looksLikeUuid(value)) return 'codigoSolicitacao_uuid';
  if (/^\d{10,20}$/.test(value)) return 'numeric_document_or_nosso_numero';
  return 'other';
}

async function main() {
  const env = loadMergedEnv();
  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    console.log(JSON.stringify({ ok: false, abort: 'NO_DATABASE_URL', httpInter: false }));
    process.exit(2);
  }
  const dbRef = databaseUrlRef(dbUrl);
  if (dbRef === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: DATABASE_URL aponta para Production.');
  }
  if (dbRef !== DEVELOP_PROJECT_REF) {
    throw new Error(`ABORT: DATABASE_URL ref=${dbRef || 'null'}`);
  }

  const require = createRequire(__filename);
  const { Client } = require('pg') as {
    Client: new (cfg: { connectionString: string; ssl?: object }) => {
      connect: () => Promise<void>;
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{ rows: Array<Record<string, unknown>> }>;
      end: () => Promise<void>;
    };
  };
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sale = await client.query(
      `select s.id, s.status, s.customer_id, s.block_id, c.name as titular_name, c.cpf_cnpj
       from public.sales s
       left join public.customers c on c.id = s.customer_id
       where s.id = $1`,
      [SALE_ID],
    );
    const block = await client.query(
      `select id, status, sale_id, customer_id from public.blocks where id = $1`,
      [BLOCK_ID],
    );
    const receipts = await client.query(
      `select id, installment_number, status, amount, due_date, paid_at, customer_id
       from public.finance_receipts
       where sale_id = $1
       order by installment_number nulls last, due_date nulls last`,
      [SALE_ID],
    );
    const charges = await client.query(
      `select id, finance_receipt_id, status, provider, charge_type, external_id, our_number,
              barcode, digitable_line, metadata, amount, due_date, updated_at
       from public.bank_charges
       where sale_id = $1
       order by due_date nulls last, created_at`,
      [SALE_ID],
    );
    const cancelledPeers = await client.query(
      `select id, sale_id, status, charge_type, external_id, our_number, metadata, updated_at
       from public.bank_charges
       where provider = 'INTER'
         and (
           status in ('CANCELLED','CANCELED','EXPIRED')
           or coalesce(metadata->>'interSituacao','') in ('CANCELADO','EXPIRADO')
         )
       order by updated_at desc
       limit 20`,
    );
    const transfers = await client.query(
      `select id, status, charges_phase, charges_error, from_customer_id, to_customer_id,
              executed_at, charges_snapshot, created_at
       from public.sale_title_transfers
       where sale_id = $1
       order by created_at desc`,
      [SALE_ID],
    );
    const contracts = await client.query(
      `select id, contract_number, status, customer_id, is_current
       from public.contracts
       where sale_id = $1
       order by created_at`,
      [SALE_ID],
    );

    const mappedCharges = charges.rows.map((row) => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      const externalId = row.external_id ? String(row.external_id).trim() : null;
      const metaCodigo = meta?.codigoSolicitacao
        ? String(meta.codigoSolicitacao).trim()
        : null;
      const nosso = String(row.our_number || meta?.nossoNumero || '').trim() || null;
      const seu = meta?.seuNumero ? String(meta.seuNumero).trim() : null;
      const allText = JSON.stringify({
        externalId,
        metaCodigo,
        nosso,
        seu,
        barcode: row.barcode || null,
        digitable_line: row.digitable_line || null,
      });
      const matchedDocs = BANK_DOCS.filter((doc) => allText.includes(doc));
      return {
        bank_charge_id: row.id,
        finance_receipt_id: row.finance_receipt_id,
        provider: row.provider,
        charge_type: row.charge_type || null,
        status_local: row.status,
        updated_at: row.updated_at,
        amount: row.amount,
        due_date: row.due_date,
        external_id: externalId,
        external_id_kind: identifierKind(externalId),
        metadata_codigoSolicitacao: metaCodigo,
        metadata_codigo_kind: identifierKind(metaCodigo),
        our_number: nosso,
        seuNumero: seu,
        barcode: row.barcode || null,
        digitable_line: row.digitable_line || null,
        interSituacao: meta?.interSituacao || null,
        remoteCancelConfirmed: meta?.remoteCancelConfirmed ?? null,
        metadata_keys: meta ? Object.keys(meta) : [],
        metadata_safe: pickMeta(meta),
        matchesInternetBankingDocs: matchedDocs,
        get_uses: externalId,
        post_cancel_uses: externalId,
        remote_disposition_if_situacao_local: classifyRemoteInterSituacaoForRelease(
          String(meta?.interSituacao || ''),
        ),
      };
    });

    const snapshotErrors = transfers.rows.map((row) => {
      const snap =
        row.charges_snapshot && typeof row.charges_snapshot === 'object'
          ? (row.charges_snapshot as Record<string, unknown>)
          : null;
      return {
        id: row.id,
        status: row.status,
        charges_phase: row.charges_phase,
        charges_error: row.charges_error,
        executed_at: row.executed_at,
        snapshot_failedStage: snap?.failedStage || null,
        snapshot_error: snap?.error || null,
        snapshot_canceledChargeIds: snap?.canceledChargeIds || null,
        created_at: row.created_at,
      };
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          ref: dbRef,
          productionUntouched: true,
          httpInter: false,
          httpAsaas: false,
          executeTransfer: false,
          sale: sale.rows[0] || null,
          block: block.rows[0] || null,
          contracts: contracts.rows,
          receipts: receipts.rows,
          charges: mappedCharges,
          transfers: snapshotErrors,
          locallyCancelledInterPeers: cancelledPeers.rows.map((row) => {
            const meta =
              row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
            return {
              id: row.id,
              sale_id: row.sale_id,
              status: row.status,
              charge_type: row.charge_type || null,
              external_id: row.external_id,
              our_number: row.our_number,
              seuNumero: meta.seuNumero || null,
              interSituacao: meta.interSituacao || null,
              remoteCancelConfirmed: meta.remoteCancelConfirmed ?? null,
              metadata_keys: Object.keys(meta),
              updated_at: row.updated_at,
            };
          }),
          bankDocsFromInternetBanking: BANK_DOCS,
          note:
            'GET e POST oficiais usam bank_charges.external_id como codigoSolicitacao. Documentos do Internet Banking são número/nosso número se não forem UUID.',
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
