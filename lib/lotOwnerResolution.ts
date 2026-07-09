/**
 * Resolução do proprietário do lote — mesma lógica da prancha GIS e do memorial.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type LotOwnerResolution = {
  owner: string;
  ownerDocument: string;
  customer: Record<string, unknown> | null;
};

function isAvailableLotStatus(status: unknown): boolean {
  const s = String(status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return !s || s === 'disponivel' || s === 'available' || s === 'livre';
}

function isSoldOrReservedLotStatus(status: unknown): boolean {
  const s = String(status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (
    s.includes('vend') ||
    s.includes('reserv') ||
    s === 'sold' ||
    s === 'reserved'
  );
}

export function normalizeOwnerName(
  customer: Record<string, unknown> | null | undefined,
): string {
  if (!customer) return 'Não informado';
  const name =
    customer.full_name ||
    customer.name ||
    customer.nome ||
    customer.customer_name ||
    customer.razao_social ||
    customer.fantasy_name ||
    customer.email ||
    '';
  return String(name).trim() || 'Não informado';
}

export function normalizeOwnerDocument(
  customer: Record<string, unknown> | null | undefined,
): string {
  if (!customer) return 'Não informado';
  const doc =
    customer.cpf_cnpj ||
    customer.document ||
    customer.cpf ||
    customer.cnpj ||
    customer.tax_id ||
    '';
  return String(doc).trim() || 'Não informado';
}

function isMissingColumnError(message: string): boolean {
  return /does not exist|column/i.test(message);
}

async function fetchCustomerById(
  supabase: SupabaseClient,
  customerId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message || '')) {
      console.log('LOT_OWNER_CUSTOMER_COLUMN_MISSING', {
        customerId,
        message: error.message,
      });
    } else {
      console.warn('LOT_OWNER_CUSTOMER_FETCH_ERROR', {
        customerId,
        message: error.message,
      });
    }
    return null;
  }

  return (data as Record<string, unknown>) || null;
}

async function fetchCustomerFromSale(
  supabase: SupabaseClient,
  saleId: string,
): Promise<Record<string, unknown> | null> {
  const { data: sale, error } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();

  if (error || !sale?.customer_id) return null;
  return fetchCustomerById(supabase, String(sale.customer_id));
}

async function fetchCustomerFromContract(
  supabase: SupabaseClient,
  contractId: string,
): Promise<Record<string, unknown> | null> {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .maybeSingle();

  if (error || !contract?.customer_id) return null;
  return fetchCustomerById(supabase, String(contract.customer_id));
}

async function fetchCustomerFromLatestSaleByBlock(
  supabase: SupabaseClient,
  blockId: string,
): Promise<Record<string, unknown> | null> {
  const { data: sales, error } = await supabase
    .from('sales')
    .select('*')
    .eq('block_id', blockId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !sales?.length) return null;
  const sale = sales[0] as Record<string, unknown>;
  if (sale.customer_id) {
    return fetchCustomerById(supabase, String(sale.customer_id));
  }
  return null;
}

/**
 * Resolve proprietário do lote — prioriza cliente da venda/reserva vinculada.
 * Mesma cadeia usada na prancha técnica e alinhada ao popup GIS (customers.name).
 */
export async function resolveLotOwnerFromBlock(
  supabase: SupabaseClient,
  block: Record<string, unknown>,
): Promise<LotOwnerResolution> {
  const status = block.status;

  if (isAvailableLotStatus(status)) {
    return {
      owner: 'Não informado',
      ownerDocument: 'Não informado',
      customer: null,
    };
  }

  let customer: Record<string, unknown> | null = null;

  if (isSoldOrReservedLotStatus(status)) {
    const customerId = block.customer_id as string | undefined;
    if (customerId) {
      customer = await fetchCustomerById(supabase, customerId);
    }

    if (!customer && block.sale_id) {
      customer = await fetchCustomerFromSale(supabase, String(block.sale_id));
    }

    if (!customer && block.contract_id) {
      customer = await fetchCustomerFromContract(
        supabase,
        String(block.contract_id),
      );
    }

    if (!customer && block.id) {
      customer = await fetchCustomerFromLatestSaleByBlock(
        supabase,
        String(block.id),
      );
    }
  }

  let owner = normalizeOwnerName(customer);
  let ownerDocument = normalizeOwnerDocument(customer);

  if (owner === 'Não informado') {
    const blockName = String(block.customer_name || '').trim();
    if (blockName) owner = blockName;
  }

  return { owner, ownerDocument, customer };
}

export function applyResolvedOwnerToBlock(
  block: Record<string, unknown>,
  resolved: LotOwnerResolution,
): Record<string, unknown> {
  if (resolved.owner === 'Não informado') return block;
  return {
    ...block,
    owner_name: resolved.owner,
    customer_name: resolved.owner,
  };
}
