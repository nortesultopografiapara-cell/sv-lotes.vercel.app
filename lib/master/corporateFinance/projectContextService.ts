import type { SupabaseClient } from '@supabase/supabase-js';
import {
  incomeCategoryHintsForTopography,
  mapProjectPaymentMethod,
} from './incomeCategoryHints';
import { roundMoney } from './arApMath';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field = 'id'): string {
  const s = String(value || '').trim();
  if (!UUID_RE.test(s)) throw new Error(`${field} inválido.`);
  return s;
}

export type ReceivableProjectContext = {
  project: {
    id: string;
    code: string;
    title: string;
    client_name: string;
    client_contact_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    category: string;
    service_type: string;
    city: string | null;
    state: string | null;
    contract_value: number;
    valor_recebido: number;
    saldo_receber: number;
    payment_terms: string | null;
    internal_manager: string | null;
    is_archived: boolean;
  };
  quote: {
    id: string;
    code: string;
    status: string;
    payment_method: string | null;
  } | null;
  suggested_description: string;
  suggested_payment_method: string | null;
  suggested_category_id: string | null;
  suggested_category_name: string | null;
  suggested_cost_center_id: string | null;
  suggested_cost_center_code: string | null;
  suggested_financial_account_id: string | null;
  suggested_financial_account_name: string | null;
  contract_value: number;
  valor_recebido: number;
  saldo_receber: number;
  provisioned_total: number;
  provisioned_remaining: number;
  receivables_count: number;
  unprovisioned_balance: number;
};

/**
 * Provisionado = soma dos net_amount de recebíveis válidos do projeto
 * (não cancelados, não arquivados). Usa net (não só remaining) para
 * impedir recriar título já liquidado sem bridge de valor_recebido.
 */
export async function sumProjectProvisioned(
  supabase: SupabaseClient,
  projectId: string,
  excludeReceivableId?: string | null,
): Promise<{ provisionedTotal: number; provisionedRemaining: number; count: number }> {
  let q = supabase
    .from('master_corporate_receivables')
    .select('id, net_amount, remaining_amount, status, is_archived, canceled_at')
    .eq('project_id', projectId)
    .eq('is_archived', false)
    .is('canceled_at', null)
    .neq('status', 'CANCELED')
    .neq('status', 'ARCHIVED');

  if (excludeReceivableId) q = q.neq('id', excludeReceivableId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data || [];
  let provisionedTotal = 0;
  let provisionedRemaining = 0;
  for (const r of rows) {
    provisionedTotal = roundMoney(provisionedTotal + Number(r.net_amount || 0));
    provisionedRemaining = roundMoney(
      provisionedRemaining + Number(r.remaining_amount || 0),
    );
  }
  return { provisionedTotal, provisionedRemaining, count: rows.length };
}

export function computeUnprovisionedBalance(params: {
  contractValue: number;
  valorRecebido: number;
  provisionedTotal: number;
}): number {
  return roundMoney(
    Math.max(0, params.contractValue - params.valorRecebido - params.provisionedTotal),
  );
}

async function resolveIncomeCategoryId(
  supabase: SupabaseClient,
  topographyCategory: string,
): Promise<{ id: string; name: string } | null> {
  const hints = incomeCategoryHintsForTopography(topographyCategory);
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .select('id, name, type, is_active')
    .eq('type', 'INCOME')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  const list = data || [];
  for (const hint of hints) {
    const found = list.find(
      (c) => String(c.name).trim().toLowerCase() === hint.trim().toLowerCase(),
    );
    if (found) return { id: String(found.id), name: String(found.name) };
  }
  for (const hint of hints) {
    const found = list.find((c) =>
      String(c.name).toLowerCase().includes(hint.trim().toLowerCase()),
    );
    if (found) return { id: String(found.id), name: String(found.name) };
  }
  return null;
}

export async function getReceivableProjectContext(
  supabase: SupabaseClient,
  projectIdRaw: string,
): Promise<ReceivableProjectContext> {
  const projectId = assertUuid(projectIdRaw, 'projectId');

  const { data: project, error: pErr } = await supabase
    .from('master_topography_projects')
    .select(
      'id, code, title, client_name, client_contact_name, client_phone, client_email, category, service_type, city, state, contract_value, valor_recebido, payment_terms, internal_manager, is_archived, origin_budget_number',
    )
    .eq('id', projectId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!project) throw new Error('Projeto Master não encontrado.');
  if (project.is_archived) throw new Error('Projeto arquivado não pode gerar cobrança.');

  const contractValue = roundMoney(Number(project.contract_value || 0));
  const valorRecebido = roundMoney(Number(project.valor_recebido || 0));
  const saldoReceber = roundMoney(Math.max(0, contractValue - valorRecebido));

  let quote: ReceivableProjectContext['quote'] = null;
  const { data: quoteRow } = await supabase
    .from('master_topography_quotes')
    .select('id, code, status, payment_method, converted_project_id')
    .eq('converted_project_id', projectId)
    .maybeSingle();

  if (quoteRow) {
    quote = {
      id: String(quoteRow.id),
      code: String(quoteRow.code),
      status: String(quoteRow.status),
      payment_method: quoteRow.payment_method ? String(quoteRow.payment_method) : null,
    };
  } else if (project.origin_budget_number) {
    const { data: byCode } = await supabase
      .from('master_topography_quotes')
      .select('id, code, status, payment_method')
      .eq('code', String(project.origin_budget_number))
      .in('status', ['APROVADO', 'CONVERTIDO'])
      .maybeSingle();
    if (byCode) {
      quote = {
        id: String(byCode.id),
        code: String(byCode.code),
        status: String(byCode.status),
        payment_method: byCode.payment_method ? String(byCode.payment_method) : null,
      };
    }
  }

  const { data: costCenter } = await supabase
    .from('master_corporate_cost_centers')
    .select('id, code, name')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: defaultAccount } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle();

  let account = defaultAccount;
  if (!account) {
    const { data: anyAccount } = await supabase
      .from('master_corporate_financial_accounts')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(1)
      .maybeSingle();
    account = anyAccount;
  }

  const category = await resolveIncomeCategoryId(supabase, String(project.category || ''));
  const { provisionedTotal, provisionedRemaining, count } = await sumProjectProvisioned(
    supabase,
    projectId,
  );
  const unprovisioned = computeUnprovisionedBalance({
    contractValue,
    valorRecebido,
    provisionedTotal,
  });

  const suggestedPayment =
    mapProjectPaymentMethod(quote?.payment_method) ||
    mapProjectPaymentMethod(project.payment_terms ? String(project.payment_terms) : null);

  const code = String(project.code);
  const title = String(project.title);

  return {
    project: {
      id: String(project.id),
      code,
      title,
      client_name: String(project.client_name || ''),
      client_contact_name: project.client_contact_name
        ? String(project.client_contact_name)
        : null,
      client_phone: project.client_phone ? String(project.client_phone) : null,
      client_email: project.client_email ? String(project.client_email) : null,
      category: String(project.category || ''),
      service_type: String(project.service_type || ''),
      city: project.city ? String(project.city) : null,
      state: project.state ? String(project.state) : null,
      contract_value: contractValue,
      valor_recebido: valorRecebido,
      saldo_receber: saldoReceber,
      payment_terms: project.payment_terms ? String(project.payment_terms) : null,
      internal_manager: project.internal_manager ? String(project.internal_manager) : null,
      is_archived: Boolean(project.is_archived),
    },
    quote,
    suggested_description: `Recebimento referente ao projeto ${code} — ${title}`,
    suggested_payment_method: suggestedPayment,
    suggested_category_id: category?.id || null,
    suggested_category_name: category?.name || null,
    suggested_cost_center_id: costCenter ? String(costCenter.id) : null,
    suggested_cost_center_code: costCenter ? String(costCenter.code) : null,
    suggested_financial_account_id: account ? String(account.id) : null,
    suggested_financial_account_name: account ? String(account.name) : null,
    contract_value: contractValue,
    valor_recebido: valorRecebido,
    saldo_receber: saldoReceber,
    provisioned_total: provisionedTotal,
    provisioned_remaining: provisionedRemaining,
    receivables_count: count,
    unprovisioned_balance: unprovisioned,
  };
}

export async function assertReceivableProvisionLimit(
  supabase: SupabaseClient,
  params: {
    projectId: string | null;
    netAmount: number;
    excludeReceivableId?: string | null;
    allowOverProvision?: boolean;
    overProvisionReason?: string | null;
  },
): Promise<void> {
  if (!params.projectId) return;

  const ctx = await getReceivableProjectContext(supabase, params.projectId);
  const { provisionedTotal } = await sumProjectProvisioned(
    supabase,
    params.projectId,
    params.excludeReceivableId,
  );
  const unprovisioned = computeUnprovisionedBalance({
    contractValue: ctx.contract_value,
    valorRecebido: ctx.valor_recebido,
    provisionedTotal,
  });

  if (params.netAmount <= unprovisioned + 0.001) return;

  if (params.allowOverProvision) {
    const reason = String(params.overProvisionReason || '').trim();
    if (reason.length < 5) {
      throw new Error(
        'Justificativa obrigatória (mín. 5 caracteres) para provisionar acima do saldo do projeto.',
      );
    }
    return;
  }

  throw new Error(
    `Saldo não provisionado insuficiente (disponível ${unprovisioned.toFixed(2)}, solicitado ${params.netAmount.toFixed(2)}). Use allow_over_provision com justificativa apenas em ajuste excepcional.`,
  );
}

export type ClientSuggestion = {
  key: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  projects: Array<{ id: string; code: string; title: string }>;
  quotes: Array<{ id: string; code: string }>;
};

export async function searchMasterClientSuggestions(
  supabase: SupabaseClient,
  qRaw: string,
): Promise<ClientSuggestion[]> {
  const q = String(qRaw || '').trim();
  if (q.length < 2) return [];

  const escaped = q.replace(/%/g, '');
  const pattern = `%${escaped}%`;

  const [{ data: projects }, { data: quotes }] = await Promise.all([
    supabase
      .from('master_topography_projects')
      .select('id, code, title, client_name, client_phone, client_email')
      .eq('is_archived', false)
      .or(
        `client_name.ilike.${pattern},client_phone.ilike.${pattern},client_email.ilike.${pattern},code.ilike.${pattern},title.ilike.${pattern}`,
      )
      .limit(30),
    supabase
      .from('master_topography_quotes')
      .select('id, code, client_name, phone, email')
      .eq('is_archived', false)
      .or(`client_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},code.ilike.${pattern}`)
      .limit(30),
  ]);

  const map = new Map<string, ClientSuggestion>();

  for (const p of projects || []) {
    const name = String(p.client_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = map.get(key) || {
      key,
      customer_name: name,
      customer_phone: p.client_phone ? String(p.client_phone) : null,
      customer_email: p.client_email ? String(p.client_email) : null,
      projects: [],
      quotes: [],
    };
    if (!cur.customer_phone && p.client_phone) cur.customer_phone = String(p.client_phone);
    if (!cur.customer_email && p.client_email) cur.customer_email = String(p.client_email);
    cur.projects.push({ id: String(p.id), code: String(p.code), title: String(p.title) });
    map.set(key, cur);
  }

  for (const qt of quotes || []) {
    const name = String(qt.client_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = map.get(key) || {
      key,
      customer_name: name,
      customer_phone: qt.phone ? String(qt.phone) : null,
      customer_email: qt.email ? String(qt.email) : null,
      projects: [],
      quotes: [],
    };
    if (!cur.customer_phone && qt.phone) cur.customer_phone = String(qt.phone);
    if (!cur.customer_email && qt.email) cur.customer_email = String(qt.email);
    cur.quotes.push({ id: String(qt.id), code: String(qt.code) });
    map.set(key, cur);
  }

  return Array.from(map.values()).slice(0, 20);
}
