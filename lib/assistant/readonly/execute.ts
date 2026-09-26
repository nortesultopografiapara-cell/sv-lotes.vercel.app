import { computeInstallmentStatus } from '@/lib/charges/chargeInstallmentHelpers';
import { normalizeEnterpriseLotStatus } from '@/lib/enterpriseValueSummary';
import {
  getOwnerAllowedProjectIds,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
  resolveContractProjectId,
  resolveReceiptProjectId,
  type OwnerModuleKey,
} from '@/lib/ownerProjectAccess';
import { isSaleContractFullySigned } from '@/lib/saleContractDashboardStats';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import { isBrokerRole, isOwnerRole } from '@/lib/rolePermissions';
import { isAssistantReadonlyToolId } from './allowlist';
import { canRevealPendingSignerNames, canRevealSaleAmount, canRoleUseReadonlyTool } from './policy';
import { sanitizeReadonlyFacts } from './sanitize';
import type {
  AssistantReadonlyDb,
  AssistantReadonlyExecution,
  AssistantReadonlyRuntime,
  AssistantReadonlySignatureFacts,
  AssistantReadonlyToolArgs,
  AssistantReadonlyToolId,
} from './types';

const RECEIPT_PAGE = 1000;
const RECEIPT_MAX = 5000;

function todayIso(now?: Date): string {
  const date = now ? new Date(now) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function tenantOr(tenantId: string): string {
  return `tenant_id.eq.${tenantId},company_id.eq.${tenantId}`;
}

function firstAllowed(
  rows: Array<Record<string, unknown>>,
  allowedProjectIds: string[] | null,
  resolveProjectId: (row: Record<string, unknown>) => string | null,
): Record<string, unknown> | null {
  if (!allowedProjectIds) return rows[0] || null;
  const allowed = new Set(allowedProjectIds);
  return (
    rows.find((row) => {
      const projectId = resolveProjectId(row);
      return Boolean(projectId && allowed.has(projectId));
    }) || null
  );
}

async function resolveOwnerProjectIds(
  db: AssistantReadonlyDb,
  runtime: AssistantReadonlyRuntime,
  module: OwnerModuleKey | 'any',
): Promise<{ ok: true; projectIds: string[] | null } | { ok: false; execution: AssistantReadonlyExecution }> {
  if (!isOwnerRole(runtime.role)) return { ok: true, projectIds: null };
  const access = await loadOwnerAccessContext(
    db as { from: (table: string) => { select: (columns?: string) => any } },
    { id: runtime.userId, role: runtime.role, tenant_id: runtime.tenantId },
    runtime.tenantId,
  );
  const projectIds =
    module === 'any'
      ? getOwnerAllowedProjectIds(access.rows)
      : getOwnerAllowedProjectIdsForModule(access.rows, module);
  if (!projectIds.length) {
    return {
      ok: false,
      execution: { ok: false, reason: 'forbidden', forbiddenReason: 'profile' },
    };
  }
  return { ok: true, projectIds };
}

async function listRows(query: any): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'query_failed');
  return Array.isArray(data) ? data : [];
}

async function maybeRow(query: any): Promise<Record<string, unknown> | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'query_failed');
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

function pickName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickName(value[0]);
  if (typeof value === 'object' && value && 'name' in value) {
    return (value as { name?: unknown }).name ? String((value as { name: unknown }).name) : null;
  }
  return null;
}

function lotLabel(block: unknown): string | null {
  if (!block || typeof block !== 'object') return null;
  const row = Array.isArray(block) ? block[0] : block;
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, unknown>;
  const quadra = rec.block_name ?? rec.name;
  const lote = rec.number ?? rec.lot_number;
  const parts = [quadra != null ? `Quadra ${quadra}` : null, lote != null ? `Lote ${lote}` : null].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  return text.slice(0, 10) || null;
}

function classifyOverall(input: {
  status?: string | null;
  signatureStatus?: string | null;
  partyTotal: number;
  partySigned: number;
  partyPending: number;
}): AssistantReadonlySignatureFacts['overallState'] {
  const status = String(input.status || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled'].includes(status)) return 'cancelado';
  if (
    isSaleContractFullySigned({
      status: input.status,
      signature_status: input.signatureStatus,
    }) ||
    (input.partyTotal > 0 && input.partyPending === 0)
  ) {
    return 'assinado';
  }
  if (input.partySigned > 0 && input.partyPending > 0) return 'parcial';
  if (input.partyTotal > 0) return 'aguardando';
  return 'nao_enviado';
}

async function loadParties(db: AssistantReadonlyDb, contractId: string) {
  return listRows(
    db
      .from('contract_signature_parties')
      .select('role, status, signer_name, signature_data, signature_url, signature_token_hash, sent_at')
      .eq('contract_id', contractId),
  );
}

function summarizeParties(
  parties: Array<Record<string, unknown>>,
  includeNames: boolean,
): Pick<
  AssistantReadonlySignatureFacts,
  'partyTotal' | 'partySigned' | 'partyPending' | 'pendingRoles' | 'pendingParties' | 'awaitingInternalVendor'
> {
  const pendingRoles: string[] = [];
  const pendingParties: Array<{ name: string; role: string }> = [];
  let signed = 0;
  let awaitingInternalVendor = false;
  for (const party of parties) {
    const status = String(party.status || '').toUpperCase();
    const role = String(party.role || '').toUpperCase();
    const roleLabel = saleSignaturePartyRoleLabel(role);
    if (status === 'SIGNED') {
      signed += 1;
      continue;
    }
    if (status === 'CANCELLED' || status === 'EXPIRED') continue;
    pendingRoles.push(roleLabel);
    const signatureData =
      party.signature_data && typeof party.signature_data === 'object'
        ? (party.signature_data as Record<string, unknown>)
        : {};
    const flaggedInternal = signatureData.internalAdminSign === true || signatureData.estrelaCompanyVendor === true;
    const hasPublicLink = Boolean(party.signature_url || party.signature_token_hash);
    if (role === 'VENDOR' && (flaggedInternal || !hasPublicLink)) awaitingInternalVendor = true;
    if (includeNames) {
      const name = String(party.signer_name || '').trim();
      if (name) pendingParties.push({ name, role: roleLabel });
    }
  }
  const active = parties.filter((item) => {
    const status = String(item.status || '').toUpperCase();
    return status !== 'CANCELLED' && status !== 'EXPIRED';
  });
  return {
    partyTotal: active.length || parties.length,
    partySigned: signed,
    partyPending: Math.max(0, (active.length || parties.length) - signed),
    pendingRoles: Array.from(new Set(pendingRoles)),
    pendingParties,
    awaitingInternalVendor,
  };
}

async function queryOverdue(
  db: AssistantReadonlyDb,
  tenantId: string,
  now?: Date,
  allowedProjectIds?: string[] | null,
) {
  const referenceDate = todayIso(now);
  const customers = new Set<string>();
  const allowed = allowedProjectIds ? new Set(allowedProjectIds) : null;
  let overdueCount = 0;
  let overdueAmount = 0;
  let rowCount = 0;
  for (let offset = 0; offset < RECEIPT_MAX; offset += RECEIPT_PAGE) {
    const page = await listRows(
      db
        .from('finance_receipts')
        .select(
          'id, status, amount, due_date, customer_id, tenant_id, company_id, project_id, sales:sale_id(project_id)',
        )
        .or(tenantOr(tenantId))
        .in('status', ['pendente', 'pending', 'atrasado', 'overdue'])
        .range(offset, offset + RECEIPT_PAGE - 1),
    );
    rowCount += page.length;
    for (const row of page) {
      if (allowed) {
        const projectId = resolveReceiptProjectId(row);
        if (!projectId || !allowed.has(projectId)) continue;
      }
      const bucket = computeInstallmentStatus(row, referenceDate).toLowerCase();
      if (bucket !== 'atrasado' && bucket !== 'overdue') continue;
      overdueCount += 1;
      overdueAmount += Number(row.amount) || 0;
      if (row.customer_id) customers.add(String(row.customer_id));
    }
    if (page.length < RECEIPT_PAGE) break;
  }
  return {
    facts: sanitizeReadonlyFacts({
      toolId: 'finance.overdue_summary',
      referenceDate,
      overdueCount,
      overdueAmount,
      customerCount: customers.size,
    }),
    rowCount,
  };
}

async function buildSignatureFacts(
  db: AssistantReadonlyDb,
  contract: Record<string, unknown>,
  toolId: AssistantReadonlySignatureFacts['toolId'],
  includeNames: boolean,
): Promise<AssistantReadonlySignatureFacts> {
  const parties = await loadParties(db, String(contract.id));
  const summary = summarizeParties(parties, includeNames);
  const sentAt =
    dateOnly(contract.signature_sent_at) ||
    parties
      .map((item) => dateOnly(item.sent_at))
      .filter(Boolean)
      .sort()
      .at(-1) ||
    null;
  return sanitizeReadonlyFacts({
    toolId,
    found: true,
    contractNumber: contract.contract_number ? String(contract.contract_number) : null,
    overallState: classifyOverall({
      status: contract.status ? String(contract.status) : null,
      signatureStatus: contract.signature_status ? String(contract.signature_status) : null,
      partyTotal: summary.partyTotal,
      partySigned: summary.partySigned,
      partyPending: summary.partyPending,
    }),
    ...summary,
    sentAt,
  }) as AssistantReadonlySignatureFacts;
}

async function queryLatestSignature(
  db: AssistantReadonlyDb,
  tenantId: string,
  includeNames: boolean,
  allowedProjectIds?: string[] | null,
) {
  const take = allowedProjectIds ? 25 : 1;
  const contractSelect =
    'id, contract_number, status, signature_status, signature_sent_at, project_id, tenant_id, company_id';
  const sent = await listRows(
    db
      .from('contracts')
      .select(contractSelect)
      .or(tenantOr(tenantId))
      .not('signature_sent_at', 'is', 'null')
      .order('signature_sent_at', { ascending: false })
      .limit(take),
  );
  let contract = firstAllowed(sent, allowedProjectIds || null, resolveContractProjectId);
  if (!contract) {
    const fallback = await listRows(
      db
        .from('contracts')
        .select(contractSelect)
        .or(tenantOr(tenantId))
        .in('signature_status', ['SENT', 'PENDING', 'PARTIALLY_SIGNED', 'CLIENT_SIGNED', 'SIGNED', 'VIEWED'])
        .order('updated_at', { ascending: false })
        .limit(take),
    );
    contract = firstAllowed(fallback, allowedProjectIds || null, resolveContractProjectId);
  }
  if (!contract) {
    return {
      facts: sanitizeReadonlyFacts({
        toolId: 'contract.latest_signature_status',
        found: false,
        contractNumber: null,
        overallState: null,
        partyTotal: 0,
        partySigned: 0,
        partyPending: 0,
        pendingRoles: [],
        pendingParties: [],
        awaitingInternalVendor: false,
        sentAt: null,
      }),
      rowCount: 0,
    };
  }
  const facts = await buildSignatureFacts(db, contract, 'contract.latest_signature_status', includeNames);
  return { facts, rowCount: 1 };
}

async function querySignatureStatus(
  db: AssistantReadonlyDb,
  tenantId: string,
  args: AssistantReadonlyToolArgs,
  includeNames: boolean,
  allowedProjectIds?: string[] | null,
) {
  const contractSelect =
    'id, contract_number, status, signature_status, signature_sent_at, project_id, tenant_id, company_id';
  let contract: Record<string, unknown> | null = null;
  if (args.contractId) {
    contract = await maybeRow(
      db
        .from('contracts')
        .select(contractSelect)
        .eq('id', args.contractId)
        .or(tenantOr(tenantId))
        .maybeSingle(),
    );
  }
  if (!contract && args.contractNumber) {
    const rows = await listRows(
      db
        .from('contracts')
        .select(contractSelect)
        .or(tenantOr(tenantId))
        .eq('contract_number', args.contractNumber)
        .limit(1),
    );
    contract = rows[0] || null;
  }
  if (contract && allowedProjectIds) {
    const projectId = resolveContractProjectId(contract);
    if (!projectId || !allowedProjectIds.includes(projectId)) contract = null;
  }
  if (!contract) {
    return {
      facts: sanitizeReadonlyFacts({
        toolId: 'contract.signature_status',
        found: false,
        contractNumber: null,
        overallState: null,
        partyTotal: 0,
        partySigned: 0,
        partyPending: 0,
        pendingRoles: [],
        pendingParties: [],
        awaitingInternalVendor: false,
        sentAt: null,
      }),
      rowCount: 0,
    };
  }
  const facts = await buildSignatureFacts(db, contract, 'contract.signature_status', includeNames);
  return { facts, rowCount: 1 };
}

async function queryLatestSale(
  db: AssistantReadonlyDb,
  runtime: AssistantReadonlyRuntime,
  allowedProjectIds?: string[] | null,
) {
  const tenantId = String(runtime.tenantId);
  let query = db
    .from('sales')
    .select(
      'id, status, sale_date, created_at, total_value, final_value, agreed_price, broker_id, project_id, tenant_id, company_id, projects:project_id(name), blocks:block_id(block_name, name, number, lot_number)',
    )
    .or(tenantOr(tenantId));
  if (allowedProjectIds?.length) {
    query = query.in('project_id', allowedProjectIds);
  }
  if (isBrokerRole(runtime.role)) {
    const brokers = await listRows(
      db.from('brokers').select('id').or(tenantOr(tenantId)).eq('user_id', runtime.userId).limit(1),
    );
    const brokerId = brokers[0]?.id ? String(brokers[0].id) : '';
    if (!brokerId) {
      return {
        facts: sanitizeReadonlyFacts({
          toolId: 'sale.latest',
          found: false,
          saleDate: null,
          status: null,
          projectName: null,
          lotLabel: null,
          amount: null,
        }),
        rowCount: 0,
      };
    }
    query = query.eq('broker_id', brokerId);
  }
  const rows = await listRows(query.order('created_at', { ascending: false }).limit(1));
  const sale = rows[0];
  if (!sale) {
    return {
      facts: sanitizeReadonlyFacts({
        toolId: 'sale.latest',
        found: false,
        saleDate: null,
        status: null,
        projectName: null,
        lotLabel: null,
        amount: null,
      }),
      rowCount: 0,
    };
  }
  const rawAmount = Number(sale.total_value ?? sale.final_value ?? sale.agreed_price);
  return {
    facts: sanitizeReadonlyFacts({
      toolId: 'sale.latest',
      found: true,
      saleDate: dateOnly(sale.sale_date) || dateOnly(sale.created_at),
      status: sale.status ? String(sale.status) : null,
      projectName: pickName(sale.projects),
      lotLabel: lotLabel(sale.blocks),
      amount: canRevealSaleAmount(runtime.role) && Number.isFinite(rawAmount) ? rawAmount : null,
    }),
    rowCount: 1,
  };
}

async function queryInventory(
  db: AssistantReadonlyDb,
  tenantId: string,
  args: AssistantReadonlyToolArgs,
  allowedProjectIds?: string[] | null,
) {
  let project: Record<string, unknown> | null = null;
  if (args.projectId) {
    project = await maybeRow(
      db
        .from('projects')
        .select('id, name, tenant_id, company_id')
        .eq('id', args.projectId)
        .or(tenantOr(tenantId))
        .maybeSingle(),
    );
  }
  if (!project && args.projectName) {
    const rows = await listRows(
      db
        .from('projects')
        .select('id, name, tenant_id, company_id')
        .or(tenantOr(tenantId))
        .ilike('name', `%${args.projectName.replace(/[%_]/g, '')}%`)
        .limit(5),
    );
    project =
      rows.find((item) => String(item.name || '').toLowerCase() === args.projectName!.toLowerCase()) || rows[0] || null;
  }
  if (
    !project?.id ||
    (allowedProjectIds && !allowedProjectIds.includes(String(project.id)))
  ) {
    return {
      facts: sanitizeReadonlyFacts({
        toolId: 'project.inventory',
        found: false,
        projectName: args.projectName || null,
        available: 0,
        reserved: 0,
        sold: 0,
        paid: 0,
        total: 0,
      }),
      rowCount: 0,
    };
  }
  const blocks = await listRows(
    db
      .from('blocks')
      .select('id, status, project_id, tenant_id, company_id')
      .eq('project_id', String(project.id))
      .or(tenantOr(tenantId))
      .range(0, RECEIPT_MAX - 1),
  );
  let available = 0;
  let reserved = 0;
  let sold = 0;
  let paid = 0;
  for (const block of blocks) {
    const key = normalizeEnterpriseLotStatus(block.status ? String(block.status) : null);
    if (key === 'available') available += 1;
    else if (key === 'reserved') reserved += 1;
    else if (key === 'sold') sold += 1;
    else if (key === 'paid') paid += 1;
  }
  return {
    facts: sanitizeReadonlyFacts({
      toolId: 'project.inventory',
      found: true,
      projectName: project.name ? String(project.name) : args.projectName || null,
      available,
      reserved,
      sold,
      paid,
      total: available + reserved + sold + paid,
    }),
    rowCount: blocks.length,
  };
}

export async function executeAssistantReadonlyTool(input: {
  toolId: AssistantReadonlyToolId;
  args: AssistantReadonlyToolArgs;
  runtime: AssistantReadonlyRuntime;
}): Promise<AssistantReadonlyExecution> {
  const { toolId, args, runtime } = input;
  if (!isAssistantReadonlyToolId(toolId)) return { ok: false, reason: 'unknown_tool' };

  const policy = canRoleUseReadonlyTool(toolId, runtime.role, runtime.tenantId);
  if (!policy.allowed) {
    return {
      ok: false,
      reason: policy.reason === 'broker' || policy.reason === 'profile' ? 'forbidden' : 'no_tenant',
      forbiddenReason: policy.reason === 'broker' ? 'broker' : policy.reason === 'profile' ? 'profile' : undefined,
    };
  }

  if (runtime.execute) {
    return runtime.execute(toolId, args);
  }

  const db = runtime.client;
  if (!db || !runtime.tenantId) return { ok: false, reason: 'no_tenant' };

  const includeNames = Boolean(args.includePendingNames) && canRevealPendingSignerNames(runtime.role);
  const ownerModule: OwnerModuleKey | 'any' =
    toolId === 'finance.overdue_summary'
      ? 'finance'
      : toolId === 'contract.latest_signature_status' || toolId === 'contract.signature_status'
        ? 'contracts'
        : toolId === 'project.inventory'
          ? 'map'
          : 'any';
  const ownerScope = await resolveOwnerProjectIds(db, runtime, ownerModule);
  if (!ownerScope.ok) return ownerScope.execution;

  try {
    if (toolId === 'finance.overdue_summary') {
      const result = await queryOverdue(db, runtime.tenantId, runtime.now, ownerScope.projectIds);
      return { ok: true, facts: result.facts, rowCount: result.rowCount };
    }
    if (toolId === 'contract.latest_signature_status') {
      const result = await queryLatestSignature(db, runtime.tenantId, includeNames, ownerScope.projectIds);
      return { ok: true, facts: result.facts, rowCount: result.rowCount };
    }
    if (toolId === 'contract.signature_status') {
      const result = await querySignatureStatus(db, runtime.tenantId, args, includeNames, ownerScope.projectIds);
      return { ok: true, facts: result.facts, rowCount: result.rowCount };
    }
    if (toolId === 'sale.latest') {
      const result = await queryLatestSale(db, runtime, ownerScope.projectIds);
      return { ok: true, facts: result.facts, rowCount: result.rowCount };
    }
    const result = await queryInventory(db, runtime.tenantId, args, ownerScope.projectIds);
    return { ok: true, facts: result.facts, rowCount: result.rowCount };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
