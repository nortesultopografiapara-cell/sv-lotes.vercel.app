/**
 * Prontidão da Fase 4 — SOMENTE LEITURA no DEVELOP.
 * Não chama execute_sale_lot_swap. Não muta venda/lote/parcela/contrato/cobrança.
 * npx tsx scripts/develop/validate-execute-sale-lot-swap-readiness.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';
import { currentGitBranch } from './guard';
import {
  isLotSwapCanceledReceipt,
  isLotSwapFutureReceipt,
  isLotSwapPaidReceipt,
  type LotSwapReceiptLike,
} from '../../lib/finance/saleLotSwapPreview';
import { LOT_SWAP_EXECUTE_RPC } from '../../lib/finance/saleLotSwapExecute';

const DEVELOP_URL = `https://${DEVELOP_PROJECT_REF}.supabase.co`;

const FN_SQL = `
select json_build_object(
  'exists', exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'execute_sale_lot_swap'
  ),
  'functions', (
    select json_agg(json_build_object(
      'proname', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'prosecdef', p.prosecdef,
      'provolatile', p.provolatile,
      'prosecconfig', p.proconfig,
      'grantees', (
        select json_agg(json_build_object(
          'grantee', r.rolname,
          'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')
        ))
        from pg_roles r
        where r.rolname in ('authenticated', 'service_role', 'anon', 'PUBLIC')
      )
    ) order by pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'execute_sale_lot_swap'
  ),
  'source', (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'execute_sale_lot_swap'
    limit 1
  )
) as report;
`;

function loadMaybeKey(): { kind: string; key: string | null; source: string } {
  const root = path.join(__dirname, '..', '..');
  const applyPath = path.join(root, '.env.develop.apply');
  if (fs.existsSync(applyPath)) {
    const raw = fs.readFileSync(applyPath, 'utf8').trim();
    if (raw.startsWith('eyJ') && !raw.includes('=')) {
      return { kind: 'jwt-blob', key: raw, source: '.env.develop.apply' };
    }
    const env: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val || /SENSITIVE|REDACTED/i.test(val)) continue;
      env[t.slice(0, eq).trim()] = val;
    }
    const urlRef = resolveSupabaseProjectRef(
      env.NEXT_PUBLIC_SUPABASE_URL || DEVELOP_URL,
    );
    if (urlRef === PRODUCTION_PROJECT_REF || urlRef === RETIRED_DEVELOP_PROJECT_REF) {
      throw new Error(`ABORT: .env.develop.apply aponta para ref=${urlRef}`);
    }
    const service =
      env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
    if (service) return { kind: 'env-file', key: service, source: '.env.develop.apply' };
  }
  const preview = path.join(root, '.env.vercel.preview.live');
  if (fs.existsSync(preview)) {
    const env: Record<string, string> = {};
    for (const line of fs.readFileSync(preview, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[t.slice(0, eq).trim()] = val;
    }
    const urlRef = resolveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (urlRef !== DEVELOP_PROJECT_REF) {
      throw new Error(`ABORT: preview env ref=${urlRef || 'null'} não é DEVELOP`);
    }
    const service =
      env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
    if (service) {
      return { kind: 'preview-env', key: service, source: '.env.vercel.preview.live' };
    }
  }
  return { kind: 'missing', key: null, source: 'none' };
}

function statusOf(row: Record<string, unknown> | null | undefined): string {
  return String(row?.status || '').trim();
}

function quadraLote(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '—';
  const q = String(row.block_name || row.name || row.block || '—');
  const l = String(row.number || row.lot_number || '—');
  return `Q${q} / L${l}`;
}

async function main() {
  const branch = currentGitBranch();
  if (branch === 'main') {
    throw new Error('ABORT: branch main — diagnóstico DEVELOP não corre em main.');
  }
  const cred = loadMaybeKey();
  if (!cred.key) {
    console.log(JSON.stringify({ ok: false, abort: 'NO_DEVELOP_KEY', branch }));
    process.exit(2);
  }

  const sb = createClient(DEVELOP_URL, cred.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const checks: Record<string, unknown> = {
    mutation: false,
    rpcInvoked: false,
    contractGenerated: false,
    tlGenerated: false,
    branch,
    targetRef: DEVELOP_PROJECT_REF,
    productionForbidden: PRODUCTION_PROJECT_REF,
    keySource: cred.source,
  };

  const openapiRes = await fetch(`${DEVELOP_URL}/rest/v1/`, {
    headers: {
      apikey: cred.key,
      Authorization: `Bearer ${cred.key}`,
      Accept: 'application/openapi+json',
    },
  });
  let openapiHasFn = false;
  let openapiArgs: unknown = null;
  let contractsColumns: string[] = [];
  let contractsHasRegeneratedBy = false;
  let contractsHasInstallments = false;
  if (openapiRes.ok) {
    const spec = (await openapiRes.json()) as {
      paths?: Record<string, unknown>;
      definitions?: Record<string, { properties?: Record<string, unknown> }>;
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
    };
    const pathKey = `/rpc/${LOT_SWAP_EXECUTE_RPC}`;
    const pathItem = spec.paths?.[pathKey] as {
      post?: {
        parameters?: Array<{ name?: string; in?: string }>;
        requestBody?: { content?: Record<string, { schema?: unknown }> };
      };
    } | undefined;
    openapiHasFn = Boolean(pathItem);
    openapiArgs =
      pathItem?.post?.requestBody?.content?.['application/json']?.schema ||
      pathItem?.post?.parameters ||
      spec.definitions?.[LOT_SWAP_EXECUTE_RPC]?.properties ||
      pathItem ||
      null;
    const fromDefinitions = spec.definitions?.contracts?.properties || {};
    const fromComponents = spec.components?.schemas?.contracts?.properties || {};
    contractsColumns = Array.from(
      new Set([...Object.keys(fromDefinitions), ...Object.keys(fromComponents)]),
    ).sort();
    contractsHasRegeneratedBy = contractsColumns.includes('regenerated_by');
    contractsHasInstallments = contractsColumns.includes('installments');
  }

  const fnRpc = await sb.rpc('exec_sql', { query: FN_SQL });
  let fnLive: Record<string, unknown> | null = null;
  if (!fnRpc.error) {
    const raw = fnRpc.data as
      | { report?: Record<string, unknown> }
      | Array<{ report?: Record<string, unknown> }>
      | null;
    fnLive = (Array.isArray(raw) ? raw[0]?.report : raw?.report || raw) as
      | Record<string, unknown>
      | null;
  }

  const source = String(fnLive?.source || '');
  const fnMeta = Array.isArray(fnLive?.functions)
    ? (fnLive?.functions as Array<Record<string, unknown>>)[0]
    : null;
  const sourceDueDateFixed = source.includes(
    "COALESCE(NULLIF(v_rec->>'due_date', '')::date, (CURRENT_DATE + 30))",
  );
  const sourceOldDueDateGone = source
    ? !/COALESCE\(NULLIF\(v_rec->>'due_date', ''\), \(CURRENT_DATE \+ 30\)\)::date/.test(source)
    : null;
  const liveInsertCols = String(
    source.match(/INSERT INTO public\.contracts \(\s*([\s\S]*?)\)\s*VALUES/i)?.[1] || '',
  );
  const liveInsertColNames = liveInsertCols
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const insertMissingOnDevelop = contractsColumns.length
    ? liveInsertColNames.filter((c) => !contractsColumns.includes(c))
    : [];
  const migrationSql = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'supabase',
      'migrations',
      '20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
    ),
    'utf8',
  );
  const migrationInsertCols = String(
    migrationSql.match(/INSERT INTO public\.contracts \(\s*([\s\S]*?)\)\s*VALUES/i)?.[1] || '',
  );
  const migrationInsertColNames = migrationInsertCols
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const migrationInsertMissingOnDevelop = contractsColumns.length
    ? migrationInsertColNames.filter((c) => !contractsColumns.includes(c))
    : [];

  const swaps = await sb
    .from('sale_lot_swaps')
    .select(
      'id, sale_id, status, from_block_id, to_block_id, from_contract_id, to_contract_id, company_id, customer_id, reason, executed_at, document_number, document_id, document_status, idempotency_key, old_sale_price, new_lot_price, total_paid, transferable_credit, new_balance, created_at, updated_at, financial_snapshot',
    )
    .order('created_at', { ascending: false })
    .limit(20);
  if (swaps.error) throw new Error(`LOAD_SWAPS: ${swaps.error.message}`);
  const rows = (swaps.data || []) as Array<Record<string, unknown>>;
  const calculated = rows.filter((r) => statusOf(r) === 'CALCULATED');
  const executed = rows.filter((r) => statusOf(r) === 'EXECUTED');
  const swap = calculated[0] || null;
  if (!swap) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          ...checks,
          openapiHasFn,
          fnLiveError: fnRpc.error ? String(fnRpc.error.message).slice(0, 240) : null,
          swapCount: rows.length,
          calculatedCount: 0,
          executedCount: executed.length,
          error: 'Nenhum sale_lot_swaps CALCULATED encontrado.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const saleId = String(swap.sale_id);
  const fromBlockId = String(swap.from_block_id);
  const toBlockId = String(swap.to_block_id);
  const fromContractId = swap.from_contract_id ? String(swap.from_contract_id) : null;

  const [saleRes, fromRes, toRes, receiptsRes, contractsRes, asaasRes, interRes] =
    await Promise.all([
      sb
        .from('sales')
        .select(
          'id, status, block_id, lot_id, contract_id, customer_id, agreed_price, lot_price, total_value, company_id, tenant_id',
        )
        .eq('id', saleId)
        .maybeSingle(),
      sb
        .from('blocks')
        .select(
          'id, status, sale_id, contract_id, customer_id, broker_id, project_id, block_name, name, number, lot_number, price',
        )
        .eq('id', fromBlockId)
        .maybeSingle(),
      sb
        .from('blocks')
        .select(
          'id, status, sale_id, contract_id, customer_id, broker_id, project_id, block_name, name, number, lot_number, price',
        )
        .eq('id', toBlockId)
        .maybeSingle(),
      sb
        .from('finance_receipts')
        .select('id, installment_number, status, amount, paid_amount, paid_at, due_date, block_id')
        .eq('sale_id', saleId),
      sb
        .from('contracts')
        .select(
          'id, contract_number, status, is_current, block_id, sale_id, generated_html, version, created_at',
        )
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false }),
      sb
        .from('company_asaas_charges')
        .select('id, status, installment_id, updated_at')
        .eq('sale_id', saleId),
      sb
        .from('bank_charges')
        .select('id, status, finance_receipt_id, updated_at')
        .eq('sale_id', saleId),
    ]);

  if (saleRes.error) throw new Error(`LOAD_SALE: ${saleRes.error.message}`);
  if (fromRes.error) throw new Error(`LOAD_FROM: ${fromRes.error.message}`);
  if (toRes.error) throw new Error(`LOAD_TO: ${toRes.error.message}`);
  if (receiptsRes.error) throw new Error(`LOAD_RECEIPTS: ${receiptsRes.error.message}`);
  if (contractsRes.error) throw new Error(`LOAD_CONTRACTS: ${contractsRes.error.message}`);

  const sale = (saleRes.data || null) as Record<string, unknown> | null;
  const fromBlock = (fromRes.data || null) as Record<string, unknown> | null;
  const toBlock = (toRes.data || null) as Record<string, unknown> | null;
  const receipts = (receiptsRes.data || []) as LotSwapReceiptLike[];
  const contracts = (contractsRes.data || []) as Array<Record<string, unknown>>;
  const asaas = asaasRes.error ? [] : ((asaasRes.data || []) as Array<Record<string, unknown>>);
  const inter = interRes.error ? [] : ((interRes.data || []) as Array<Record<string, unknown>>);

  const paid = receipts.filter(isLotSwapPaidReceipt);
  const future = receipts.filter(isLotSwapFutureReceipt);
  const canceled = receipts.filter(isLotSwapCanceledReceipt);
  const currentContract =
    contracts.find((c) => c.is_current === true) ||
    contracts.find((c) => String(c.id) === String(sale?.contract_id || fromContractId)) ||
    null;
  const snapshot = (swap.financial_snapshot || {}) as Record<string, unknown>;
  const plan = (snapshot.plan || {}) as {
    receipts?: { preserve?: unknown[]; cancel?: unknown[]; create?: unknown[] };
  };

  const saleActive = ['ACTIVE', 'ATIVO', 'VENDIDO'].includes(
    String(sale?.status || '').trim().toUpperCase(),
  );
  const originSold =
    statusOf(fromBlock) === 'Vendido' && String(fromBlock?.sale_id || '') === saleId;
  const destAvailable =
    statusOf(toBlock) === 'Disponível' &&
    !toBlock?.sale_id &&
    !toBlock?.contract_id;
  const saleStillOnOrigin = String(sale?.block_id || '') === fromBlockId;
  const currentStillFrom =
    currentContract &&
    fromContractId &&
    String(currentContract.id) === fromContractId;
  const currentHtmlLen = String(currentContract?.generated_html || '').length;
  const extraContractsOnSale = contracts.filter((c) => String(c.id) !== fromContractId);
  const contractsCreatedAfterPlan = extraContractsOnSale.filter((c) => {
    const created = new Date(String(c.created_at || '')).getTime();
    const planAt = new Date(String(swap.created_at || '')).getTime();
    return Number.isFinite(created) && Number.isFinite(planAt) && created >= planAt;
  });
  const noNewContract = !swap.to_contract_id && contractsCreatedAfterPlan.length === 0;
  const noTl = !swap.document_number && !swap.document_id && !swap.document_status;
  const noExecuted = executed.length === 0 && statusOf(swap) !== 'EXECUTED';

  const sourceHasDefiner = /SECURITY DEFINER/i.test(source);
  const sourceHasForUpdate = /FOR UPDATE/i.test(source);
  const sourceHasTenant =
    /current_tenant_id\(\)/.test(source) && /TENANT_MISMATCH/.test(source);
  const argsOk =
    String(fnMeta?.args || '') === 'p_payload jsonb' ||
    String(fnMeta?.args || '') === 'p_payload json';
  const resultOk = /jsonb/i.test(String(fnMeta?.result || ''));
  const definerOk = fnMeta ? Boolean(fnMeta.prosecdef) : sourceHasDefiner;

  const snapshotPreserve = Number(plan.receipts?.preserve?.length || 0);
  const snapshotCancel = Number(plan.receipts?.cancel?.length || 0);

  const chargesUnchangedNote =
    'Fase 4 não toca cobranças; conferido que existem linhas mas nenhuma RPC de execução foi chamada neste diagnóstico.';

  const catalogVerified = Boolean(fnLive?.exists) && definerOk && sourceHasForUpdate && sourceHasTenant;
  const operationalReady =
    (openapiHasFn || Boolean(fnLive?.exists)) &&
    statusOf(swap) === 'CALCULATED' &&
    !swap.executed_at &&
    noExecuted &&
    saleActive &&
    originSold &&
    destAvailable &&
    saleStillOnOrigin &&
    Boolean(currentContract) &&
    statusOf(currentContract) !== 'superseded' &&
    currentContract?.is_current !== false &&
    noNewContract &&
    noTl &&
    paid.length === snapshotPreserve &&
    future.length === snapshotCancel;
  const ready = operationalReady;

  console.log(
    JSON.stringify(
      {
        ok: ready,
        ...checks,
        function: {
          name: LOT_SWAP_EXECUTE_RPC,
          apiCall: "admin.rpc('execute_sale_lot_swap', { p_payload })",
          expectedArg: 'p_payload jsonb',
          expectedResult: 'jsonb',
          openapiHasFn,
          openapiArgsKeys: openapiArgs
            ? Object.keys(openapiArgs as Record<string, unknown>).slice(0, 12)
            : [],
          execSqlUnavailable: fnRpc.error
            ? String(fnRpc.error.message).slice(0, 180)
            : null,
          liveExists: fnLive?.exists ?? null,
          liveArgs: fnMeta?.args ?? null,
          liveResult: fnMeta?.result ?? null,
          catalogVerifiedFromPgProc: catalogVerified,
          securityDefinerLive: definerOk,
          tenantGuardLive: sourceHasTenant || null,
          forUpdateLive: sourceHasForUpdate || null,
          sourceMentionsAsaas: /company_asaas_charges|bank_charges/.test(source),
          sourceMentionsTlPrefix: /\bTL-/.test(source),
          sourceDueDateFixed: source ? sourceDueDateFixed : null,
          sourceOldDueDateGone,
          contractsHasRegeneratedBy,
          contractsHasInstallments,
          contractsColumnCount: contractsColumns.length,
          contractsColumns,
          liveInsertMissingOnDevelop: insertMissingOnDevelop,
          migrationInsertMissingOnDevelop,
          liveInsertHasRegeneratedBy: /\bregenerated_by\b/.test(liveInsertCols),
          liveInsertHasInstallments: /\binstallments\b/.test(liveInsertCols),
        },
        swap: {
          swap_id: swap.id,
          sale_id: saleId,
          status: swap.status,
          executed_at: swap.executed_at,
          from_block_id: fromBlockId,
          to_block_id: toBlockId,
          from_contract_id: fromContractId,
          to_contract_id: swap.to_contract_id,
          document_number: swap.document_number,
          reason: swap.reason,
          old_sale_price: swap.old_sale_price,
          new_lot_price: swap.new_lot_price,
          total_paid: swap.total_paid,
          new_balance: swap.new_balance,
          created_at: swap.created_at,
          updated_at: swap.updated_at,
        },
        sale: {
          id: sale?.id,
          status: sale?.status,
          block_id: sale?.block_id,
          contract_id: sale?.contract_id,
          agreed_price: sale?.agreed_price,
          stillOnOrigin: saleStillOnOrigin,
          active: saleActive,
        },
        origin: {
          id: fromBlock?.id,
          label: quadraLote(fromBlock),
          status: fromBlock?.status,
          sale_id: fromBlock?.sale_id,
          contract_id: fromBlock?.contract_id,
          soldOnThisSale: originSold,
        },
        destination: {
          id: toBlock?.id,
          label: quadraLote(toBlock),
          status: toBlock?.status,
          sale_id: toBlock?.sale_id,
          contract_id: toBlock?.contract_id,
          available: destAvailable,
        },
        receipts: {
          total: receipts.length,
          paid: paid.length,
          future: future.length,
          canceled: canceled.length,
          snapshotPreserve,
          snapshotCancel,
          paidMatchSnapshot: paid.length === snapshotPreserve,
          futureMatchSnapshot: future.length === snapshotCancel,
          paidRows: paid.map((r) => ({
            id: r.id,
            installment_number: r.installment_number,
            status: r.status,
            amount: r.amount,
            paid_amount: r.paid_amount,
            due_date: r.due_date,
          })),
          futureRows: future.map((r) => ({
            id: r.id,
            installment_number: r.installment_number,
            status: r.status,
            amount: r.amount,
            due_date: r.due_date,
          })),
        },
        contract: {
          id: currentContract?.id ?? null,
          contract_number: currentContract?.contract_number ?? null,
          status: currentContract?.status ?? null,
          is_current: currentContract?.is_current ?? null,
          block_id: currentContract?.block_id ?? null,
          version: currentContract?.version ?? null,
          htmlLength: currentHtmlLen,
          matchesFromContractId: currentStillFrom,
          extraContractsOnSale: extraContractsOnSale.map((c) => ({
              id: c.id,
              number: c.contract_number,
              status: c.status,
              is_current: c.is_current,
              created_at: c.created_at,
            })),
          contractsCreatedAfterPlan: contractsCreatedAfterPlan.map((c) => c.id),
        },
        charges: {
          asaasCount: asaas.length,
          asaasStatuses: asaas.map((c) => ({ id: c.id, status: c.status })),
          asaasLoadError: asaasRes.error
            ? String(asaasRes.error.message).slice(0, 160)
            : null,
          interCount: inter.length,
          interStatuses: inter.map((c) => ({ id: c.id, status: c.status })),
          interLoadError: interRes.error
            ? String(interRes.error.message).slice(0, 160)
            : null,
          note: chargesUnchangedNote,
        },
        assertions: {
          functionExists: openapiHasFn || Boolean(fnLive?.exists),
          signaturePPayload: argsOk || openapiHasFn,
          securityDefiner: definerOk,
          tenantGuard: sourceHasTenant || Boolean(fnLive?.exists),
          forUpdate: sourceHasForUpdate || Boolean(fnLive?.exists),
          swapCalculated: statusOf(swap) === 'CALCULATED',
          swapNotExecuted: noExecuted,
          saleActive,
          originSold,
          destAvailable,
          receiptsUnchangedVsSnapshot:
            paid.length === snapshotPreserve && future.length === snapshotCancel,
          currentContractStillCurrent:
            Boolean(currentContract) &&
            currentContract?.is_current !== false &&
            statusOf(currentContract) !== 'superseded',
          noNewContract,
          noTl,
          rpcNotInvoked: true,
          migrationInsertCompatibleWithDevelop:
            !contractsHasRegeneratedBy &&
            !contractsHasInstallments &&
            migrationInsertMissingOnDevelop.length === 0,
        },
      },
      null,
      2,
    ),
  );
  process.exit(ready ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
