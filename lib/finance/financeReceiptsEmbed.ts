/** FK explícita entre finance_receipts e customers (evita embed ambíguo no PostgREST). */
export const FINANCE_RECEIPTS_CUSTOMER_FKEY = 'finance_receipts_customer_id_fkey';

/** Colunas reais de customers usadas na geração de cobrança Asaas. */
export const FINANCE_RECEIPTS_CHARGE_CUSTOMER_FIELDS =
  'name, cpf_cnpj, document, email, phone';

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
  project_id,
  financial_account_id,
  installment_number,
  due_date,
  amount,
  status,
  customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}(${FINANCE_RECEIPTS_CHARGE_CUSTOMER_FIELDS}),
  sales:sale_id(
    financial_account_id,
    project_id,
    contracts(contract_number),
    projects:project_id(financial_account_id)
  ),
  projects:project_id(financial_account_id)
`;
