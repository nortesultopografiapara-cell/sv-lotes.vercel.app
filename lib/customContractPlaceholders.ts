/**
 * Campos automáticos do Editor CUSTOM A4.
 * Persistência: {{TOKEN}}. Prévia usa fontes reais; não inventa valor.
 */

export type CustomPlaceholderGroupId =
  | 'company'
  | 'buyer'
  | 'spouse'
  | 'seller'
  | 'project'
  | 'lot'
  | 'finance'
  | 'contract'
  | 'dates'
  | 'signatures';

export type CustomPlaceholderDef = {
  key: string;
  token: string;
  label: string;
  group: CustomPlaceholderGroupId;
  /** Origem real no SV Lotes. "none" = sem fonte automática atualmente. */
  source: string;
};

export const CUSTOM_PLACEHOLDER_GROUPS: { id: CustomPlaceholderGroupId; label: string }[] = [
  { id: 'company', label: 'Empresa' },
  { id: 'buyer', label: 'Comprador' },
  { id: 'spouse', label: 'Cônjuge' },
  { id: 'seller', label: 'Proprietário/Vendedor' },
  { id: 'project', label: 'Empreendimento' },
  { id: 'lot', label: 'Quadra/Lote' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'contract', label: 'Contrato' },
  { id: 'dates', label: 'Datas' },
  { id: 'signatures', label: 'Assinaturas/Testemunhas' },
];

function field(
  key: string,
  label: string,
  group: CustomPlaceholderGroupId,
  source: string,
): CustomPlaceholderDef {
  return { key, token: `{{${key}}}`, label, group, source };
}

export const CUSTOM_PLACEHOLDERS: CustomPlaceholderDef[] = [
  field('COMPANY_NAME', 'Nome da empresa', 'company', 'companies.fantasy_name | companies.name'),
  field('COMPANY_FANTASY_NAME', 'Nome fantasia', 'company', 'companies.fantasy_name'),
  field('COMPANY_LEGAL_NAME', 'Razão social', 'company', 'companies.razao_social'),
  field('COMPANY_CNPJ', 'CNPJ', 'company', 'companies.cnpj | companies.document'),
  field('COMPANY_ADDRESS', 'Endereço da empresa', 'company', 'companies.address'),
  field('COMPANY_NEIGHBORHOOD', 'Bairro da empresa', 'company', 'companies.neighborhood | companies.bairro'),
  field('COMPANY_CITY', 'Cidade da empresa', 'company', 'companies.city'),
  field('COMPANY_STATE', 'UF da empresa', 'company', 'companies.state'),
  field('COMPANY_ZIP', 'CEP da empresa', 'company', 'companies.zip_code | companies.cep'),
  field('COMPANY_PHONE', 'Telefone da empresa', 'company', 'companies.phone'),
  field('COMPANY_EMAIL', 'E-mail da empresa', 'company', 'companies.email'),
  field('COMPANY_LOGO_URL', 'Logo', 'company', 'companies.logo_url'),

  field('CLIENT_NAME', 'Nome do comprador', 'buyer', 'customers.name'),
  field('CLIENT_CPF', 'CPF do comprador', 'buyer', 'customers.cpf_cnpj | customers.document'),
  field('CLIENT_RG', 'RG do comprador', 'buyer', 'customers.rg'),
  field('CLIENT_RG_ISSUER', 'Órgão emissor do RG', 'buyer', 'customers.rg_issuer + rg_issuer_state'),
  field('CLIENT_NATIONALITY', 'Nacionalidade do comprador', 'buyer', 'customers.nationality'),
  field('CLIENT_PROFESSION', 'Profissão do comprador', 'buyer', 'customers.profession'),
  field('CLIENT_CIVIL_STATE', 'Estado civil do comprador', 'buyer', 'customers.civil_state | marital_status'),
  field('CLIENT_ADDRESS', 'Endereço do comprador', 'buyer', 'customers.address'),
  field('CLIENT_NEIGHBORHOOD', 'Bairro do comprador', 'buyer', 'customers.neighborhood'),
  field('CLIENT_CITY', 'Cidade do comprador', 'buyer', 'customers.city'),
  field('CLIENT_STATE', 'UF do comprador', 'buyer', 'customers.state_uf | customers.state'),
  field('CLIENT_ZIP', 'CEP do comprador', 'buyer', 'customers.zip_code | customers.cep'),
  field('CLIENT_PHONE', 'Telefone do comprador', 'buyer', 'customers.phone'),
  field('CLIENT_EMAIL', 'E-mail do comprador', 'buyer', 'customers.email'),

  field('SPOUSE_NAME', 'Nome do cônjuge', 'spouse', 'sales.sale_spouse_name'),
  field('SPOUSE_CPF', 'CPF do cônjuge', 'spouse', 'sales.sale_spouse_cpf'),
  field('SPOUSE_RG', 'RG do cônjuge', 'spouse', 'sales.sale_spouse_rg'),
  field('SPOUSE_RG_ISSUER', 'Órgão emissor do RG do cônjuge', 'spouse', 'sales.sale_spouse_rg_issuer'),
  field('SPOUSE_NATIONALITY', 'Nacionalidade do cônjuge', 'spouse', 'sales.sale_spouse_nationality'),
  field('SPOUSE_PROFESSION', 'Profissão do cônjuge', 'spouse', 'sales.sale_spouse_profession'),
  field('SPOUSE_CIVIL_STATE', 'Estado civil do cônjuge', 'spouse', 'sales.sale_spouse_marital_status'),
  field('SPOUSE_ADDRESS', 'Endereço do cônjuge', 'spouse', 'sales.sale_spouse_address'),
  field('SPOUSE_PHONE', 'Telefone do cônjuge', 'spouse', 'sales.sale_spouse_phone'),
  field('SPOUSE_EMAIL', 'E-mail do cônjuge', 'spouse', 'sales.sale_spouse_email'),

  field('SELLER_NAME', 'Nome do vendedor', 'seller', 'alias de SELLER_1_NAME'),
  field('SELLER_CPF_CNPJ', 'CPF/CNPJ do vendedor', 'seller', 'alias de SELLER_1_CPF_CNPJ'),
  field('SELLER_ADDRESS', 'Endereço do vendedor', 'seller', 'alias de SELLER_1_ADDRESS'),
  field('SELLER_PHONE', 'Telefone do vendedor', 'seller', 'alias de SELLER_1_PHONE'),
  field(
    'SELLER_1_NAME',
    'Vendedor 1 — nome',
    'seller',
    'projects.seller_parties_json[0] | companies (leitura)',
  ),
  field('SELLER_1_CPF_CNPJ', 'Vendedor 1 — CPF/CNPJ', 'seller', 'seller_parties_json[0] | companies.cnpj'),
  field('SELLER_1_RG', 'Vendedor 1 — RG', 'seller', 'seller_parties_json[0].rg'),
  field('SELLER_1_ADDRESS', 'Vendedor 1 — endereço', 'seller', 'seller_parties_json[0] | companies.address'),
  field('SELLER_1_PHONE', 'Vendedor 1 — telefone', 'seller', 'seller_parties_json[0] | companies.phone'),
  field(
    'SELLER_2_NAME',
    'Vendedor 2 — nome',
    'seller',
    'seller_parties_json[1] | companies.contract_second_vendor_json (leitura)',
  ),
  field('SELLER_2_CPF_CNPJ', 'Vendedor 2 — CPF/CNPJ', 'seller', 'seller_parties_json[1] | second_vendor.cpf'),
  field('SELLER_2_RG', 'Vendedor 2 — RG', 'seller', 'seller_parties_json[1] | second_vendor.rg'),
  field('SELLER_2_ADDRESS', 'Vendedor 2 — endereço', 'seller', 'seller_parties_json[1] | second_vendor.address'),
  field('SELLER_2_PHONE', 'Vendedor 2 — telefone', 'seller', 'seller_parties_json[1] | second_vendor.phone'),

  field('PROJECT_NAME', 'Empreendimento', 'project', 'projects.name'),
  field('PROJECT_ADDRESS', 'Localização/endereço do empreendimento', 'project', 'projects.address | projects.location'),
  field('PROJECT_CITY', 'Cidade do empreendimento', 'project', 'projects.city'),
  field('PROJECT_STATE', 'UF do empreendimento', 'project', 'projects.state | projects.uf'),
  field('PROJECT_FORUM_CITY', 'Comarca / foro', 'project', 'projects.forum_city | contracts.forum_city_snapshot'),

  field('BLOCK_NAME', 'Quadra', 'lot', 'blocks.quadra | blocks.block | blocks.name'),
  field('LOT_NUMBER', 'Lote', 'lot', 'blocks.lote | blocks.lot_number | blocks.numero'),
  field('LOT_AREA', 'Área do lote', 'lot', 'blocks.area | blocks.area_m2'),
  field('LOT_FRONT', 'Frente', 'lot', 'resolveContractLotSides ← segments_json'),
  field('LOT_BACK', 'Fundo', 'lot', 'resolveContractLotSides ← segments_json'),
  field('LOT_RIGHT', 'Lateral direita', 'lot', 'resolveContractLotSides ← segments_json'),
  field('LOT_LEFT', 'Lateral esquerda', 'lot', 'resolveContractLotSides ← segments_json'),
  field(
    'LOT_BOUNDARIES',
    'Confrontações / medidas',
    'lot',
    'formatContractLotBoundariesClause (segments_json)',
  ),

  field('SALE_VALUE', 'Valor da venda', 'finance', 'sales.total_value | sales.sale_value | sales.value'),
  field('SALE_VALUE_EXTENSO', 'Valor por extenso', 'finance', 'extenso() sobre o valor da venda'),
  field('PAYMENT_TYPE', 'Forma de pagamento', 'finance', 'sales.payment_type'),
  field('DOWN_PAYMENT', 'Sinal/entrada', 'finance', 'finance_receipts installment_number 0 ou -1'),
  field('BROKER_COMMISSION', 'Corretagem', 'finance', 'broker_commissions.amount | sales.commission'),
  field('INSTALLMENTS_COUNT', 'Quantidade de parcelas', 'finance', 'sales.installments_count + receipts ≥ 1'),
  field('INSTALLMENT_VALUE', 'Valor da parcela', 'finance', 'finance_receipts installment_number ≥ 1'),
  field('FIRST_DUE_DATE', 'Primeiro vencimento', 'finance', 'resolveContractPaymentDates'),
  field('LAST_DUE_DATE', 'Último vencimento', 'finance', 'resolveContractPaymentDates'),
  field('CORRECTION_INDEX', 'Índice de correção', 'finance', 'sales.installment_correction_type'),
  field(
    'LATE_FINE',
    'Multa',
    'finance',
    'sem fonte automática atualmente (texto fixo nos motores TS, não por venda)',
  ),
  field(
    'LATE_INTEREST',
    'Juros',
    'finance',
    'sem fonte automática atualmente (texto fixo nos motores TS, não por venda)',
  ),

  field('CONTRACT_NUMBER', 'Número do contrato', 'contract', 'contracts.contract_number'),
  field('CONTRACT_DATE', 'Data do contrato', 'contract', 'contracts.contract_date | sale_date'),
  field(
    'SIGNATURE_CITY',
    'Local/cidade da assinatura',
    'contract',
    'contracts.forum_city_snapshot | projects.forum_city | projects.city',
  ),

  field('SALE_DATE', 'Data da venda', 'dates', 'sales.sale_date via formatContractSaleDateBr'),
  field('TODAY', 'Data atual', 'dates', 'data de hoje (prévia, não persistida)'),

  field('SIGN_BUYER', 'Assinatura comprador', 'signatures', 'customers.name'),
  field('SIGN_SPOUSE', 'Assinatura cônjuge', 'signatures', 'sales.sale_spouse_name'),
  field('SIGN_SELLER_1', 'Assinatura vendedor 1', 'signatures', 'mesmo que SELLER_1_NAME'),
  field('SIGN_SELLER_2', 'Assinatura vendedor 2', 'signatures', 'mesmo que SELLER_2_NAME'),
  field('WITNESS_1_NAME', 'Testemunha 1', 'signatures', 'sem fonte automática atualmente'),
  field('WITNESS_1_CPF', 'CPF da testemunha 1', 'signatures', 'sem fonte automática atualmente'),
  field('WITNESS_2_NAME', 'Testemunha 2', 'signatures', 'sem fonte automática atualmente'),
  field('WITNESS_2_CPF', 'CPF da testemunha 2', 'signatures', 'sem fonte automática atualmente'),
];

const BY_KEY = new Map(CUSTOM_PLACEHOLDERS.map((row) => [row.key, row]));
export const CUSTOM_PLACEHOLDER_KEYS = new Set(CUSTOM_PLACEHOLDERS.map((row) => row.key));

export const PLACEHOLDERS_WITHOUT_AUTOMATIC_SOURCE = CUSTOM_PLACEHOLDERS.filter((row) =>
  row.source.startsWith('sem fonte automática'),
).map((row) => row.key);

export function customPlaceholderToken(key: string): string {
  return `{{${String(key || '').trim().toUpperCase()}}}`;
}

export function findCustomPlaceholder(key: string): CustomPlaceholderDef | null {
  return BY_KEY.get(String(key || '').trim().toUpperCase()) || null;
}

export function customPlaceholderLabel(key: string): string {
  const normalized = String(key || '').trim().toUpperCase();
  return findCustomPlaceholder(normalized)?.label || customPlaceholderToken(normalized);
}

export function placeholdersByGroup(group: CustomPlaceholderGroupId): CustomPlaceholderDef[] {
  return CUSTOM_PLACEHOLDERS.filter((row) => row.group === group);
}

export function missingPlaceholderMarker(label: string): string {
  return `[SEM DADO: ${String(label || '').trim().toUpperCase()}]`;
}

export const DEFAULT_CUSTOM_CONTRACT_HTML = `<div style="text-align:center;margin-bottom:24px;">
<h1>CONTRATO DE COMPRA E VENDA</h1>
</div>
<h2>1. Dos Contratantes</h2>
<p><strong>VENDEDOR(A):</strong> {{COMPANY_NAME}}, inscrita no CNPJ sob o nº {{COMPANY_CNPJ}}, com sede na {{COMPANY_ADDRESS}}.</p>
<p><strong>COMPRADOR(A):</strong> {{CLIENT_NAME}}, inscrito(a) no CPF sob o nº {{CLIENT_CPF}}.</p>
<p><strong>CÔNJUGE:</strong> {{SPOUSE_NAME}}, CPF {{SPOUSE_CPF}}.</p>
<h2>2. Do Imóvel (Objeto do Contrato)</h2>
<p>O VENDEDOR promete vender ao COMPRADOR o imóvel constituído pelo <strong>Lote nº {{LOT_NUMBER}}</strong> da <strong>Quadra {{BLOCK_NAME}}</strong>, localizado no empreendimento <strong>{{PROJECT_NAME}}</strong>, com área de {{LOT_AREA}}.</p>
<p>{{LOT_BOUNDARIES}}</p>
<h2>3. Do Valor</h2>
<p>Fica ajustado o valor total da venda em <strong>{{SALE_VALUE}}</strong>, na modalidade <strong>{{PAYMENT_TYPE}}</strong>.</p>
<p>Entrada de {{DOWN_PAYMENT}}, em {{INSTALLMENTS_COUNT}} parcela(s) de {{INSTALLMENT_VALUE}}.</p>
<p>Data do contrato: {{CONTRACT_DATE}}.</p>
`;
