/** FK explícita entre finance_receipts e customers (evita embed ambíguo no PostgREST). */
export const FINANCE_RECEIPTS_CUSTOMER_FKEY = 'finance_receipts_customer_id_fkey';

/** Select completo para listagem (Financeiro / Cobranças). */
export const FINANCE_RECEIPTS_LIST_SELECT = `
  *,
  customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}(*),
  sales:sale_id(id, installments_count, projects(name), contracts(contract_number)),
  projects:project_id(*),
  blocks:block_id(*)
`;

/** Fallback sem embeds aninhados em sales (quando o select principal falha). */
export const FINANCE_RECEIPTS_LIST_SELECT_FALLBACK = `
  *,
  customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}(*),
  sales:sale_id(*),
  projects:project_id(*),
  blocks:block_id(*)
`;

/** Select mínimo para geração de cobrança Asaas (parcela + cliente + contrato). */
export const FINANCE_RECEIPTS_CHARGE_SELECT = `
  id,
  company_id,
  tenant_id,
  sale_id,
  customer_id,
  installment_number,
  due_date,
  amount,
  status,
  customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}(name, cpf, cnpj, email),
  sales:sale_id(contracts(contract_number))
`;
