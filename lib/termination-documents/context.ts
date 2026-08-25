/**
 * Carrega partes e dados da unidade NO ATO da confirmação.
 * O resultado entra no snapshot e não volta a ser relido depois.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TerminationDocumentContext } from '@/lib/termination-documents/snapshot';
import type { TerminationDocumentParty } from '@/lib/termination-documents/types';

function text(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function party(
  role: TerminationDocumentParty['role'],
  name: unknown,
  document: unknown,
  extra?: unknown,
): TerminationDocumentParty {
  return {
    role,
    name: text(name),
    document: text(document),
    extra: text(extra),
  };
}

async function selectRow(
  admin: SupabaseClient,
  table: string,
  attempts: string[],
  column: string,
  value: string,
): Promise<Record<string, unknown> | null> {
  for (const cols of attempts) {
    const { data, error } = await admin
      .from(table)
      .select(cols)
      .eq(column, value)
      .maybeSingle();
    if (!error) return (data as Record<string, unknown>) || null;
  }
  return null;
}

export async function loadTerminationDocumentContext(
  admin: SupabaseClient,
  params: {
    companyId: string;
    saleId: string;
    contractId: string | null;
    blockId: string | null;
    projectId: string | null;
  },
): Promise<TerminationDocumentContext> {
  const sale = await selectRow(
    admin,
    'sales',
    [
      'id, customer_id, project_id, contract_model, sale_spouse_name, sale_spouse_cpf, sale_spouse_rg, has_spouse',
      'id, customer_id, project_id, contract_model',
      'id, customer_id, project_id',
    ],
    'id',
    params.saleId,
  );

  const customerId = text(sale?.customer_id);
  const customer = customerId
    ? await selectRow(
        admin,
        'customers',
        [
          'id, name, cpf_cnpj, document, rg, address, city, spouse_name, spouse_cpf, civil_state',
          'id, name, cpf_cnpj, document, address, city',
          'id, name, cpf_cnpj, document',
        ],
        'id',
        customerId,
      )
    : null;

  const company = await selectRow(
    admin,
    'companies',
    ['id, name, cnpj, document, address, city', 'id, name, cnpj', 'id, name'],
    'id',
    params.companyId,
  );

  const projectId = text(params.projectId) || text(sale?.project_id);
  const project = projectId
    ? await selectRow(
        admin,
        'projects',
        ['id, name, forum_city, city', 'id, name, city', 'id, name'],
        'id',
        projectId,
      )
    : null;

  const block = params.blockId
    ? await selectRow(
        admin,
        'blocks',
        ['id, block_name, name, number, lot_number', 'id, block_name, number', 'id, name, number'],
        'id',
        params.blockId,
      )
    : null;

  const contract = params.contractId
    ? await selectRow(
        admin,
        'contracts',
        [
          'id, contract_number, contract_model, forum_city_snapshot, project_name_snapshot, project_city_snapshot',
          'id, contract_number, contract_model, forum_city_snapshot, project_name_snapshot',
          'id, contract_number, contract_model',
          'id, contract_number',
        ],
        'id',
        params.contractId,
      )
    : null;

  const spouseName = text(sale?.sale_spouse_name) || text(customer?.spouse_name);
  const spouseDoc = text(sale?.sale_spouse_cpf) || text(customer?.spouse_cpf);

  const vendorExtra = [text(company?.address), text(company?.city)]
    .filter(Boolean)
    .join(' · ');
  const buyerExtra = [text(customer?.address), text(customer?.city)]
    .filter(Boolean)
    .join(' · ');

  return {
    contractNumber: text(contract?.contract_number),
    contractModel: text(contract?.contract_model) || text(sale?.contract_model),
    forumCitySnapshot:
      text(contract?.forum_city_snapshot) || text(project?.forum_city) || text(project?.city),
    projectName: text(contract?.project_name_snapshot) || text(project?.name),
    quadra: text(block?.block_name) || text(block?.name),
    lote: text(block?.number) || text(block?.lot_number),
    customerId,
    vendor: party(
      'vendedor',
      company?.name,
      company?.cnpj || company?.document,
      vendorExtra,
    ),
    buyer: party(
      'comprador',
      customer?.name,
      customer?.cpf_cnpj || customer?.document,
      buyerExtra || text(customer?.rg),
    ),
    spouse: spouseName
      ? party('conjuge', spouseName, spouseDoc, text(sale?.sale_spouse_rg))
      : null,
    pendingObligationsCanceled: true,
  };
}
