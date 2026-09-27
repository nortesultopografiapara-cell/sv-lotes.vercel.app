/**
 * Campos automáticos do Editor CUSTOM A4.
 * Persistência inequívoca: {{TOKEN}} (e data-sv-placeholder no HTML).
 * Sem substituição com venda real nesta etapa.
 */

export type CustomPlaceholderGroupId =
  | 'company'
  | 'buyer'
  | 'spouse'
  | 'seller'
  | 'project'
  | 'lot'
  | 'finance'
  | 'dates';

export type CustomPlaceholderDef = {
  key: string;
  token: string;
  label: string;
  group: CustomPlaceholderGroupId;
};

export const CUSTOM_PLACEHOLDER_GROUPS: { id: CustomPlaceholderGroupId; label: string }[] = [
  { id: 'company', label: 'Empresa' },
  { id: 'buyer', label: 'Comprador' },
  { id: 'spouse', label: 'Cônjuge' },
  { id: 'seller', label: 'Proprietário/Vendedor' },
  { id: 'project', label: 'Empreendimento' },
  { id: 'lot', label: 'Quadra/Lote' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'dates', label: 'Datas' },
];

export const CUSTOM_PLACEHOLDERS: CustomPlaceholderDef[] = [
  { key: 'COMPANY_NAME', token: '{{COMPANY_NAME}}', label: 'Nome da empresa', group: 'company' },
  { key: 'COMPANY_FANTASY_NAME', token: '{{COMPANY_FANTASY_NAME}}', label: 'Nome fantasia', group: 'company' },
  { key: 'COMPANY_CNPJ', token: '{{COMPANY_CNPJ}}', label: 'CNPJ da empresa', group: 'company' },
  { key: 'COMPANY_ADDRESS', token: '{{COMPANY_ADDRESS}}', label: 'Endereço da empresa', group: 'company' },
  { key: 'COMPANY_CITY', token: '{{COMPANY_CITY}}', label: 'Cidade da empresa', group: 'company' },
  { key: 'COMPANY_STATE', token: '{{COMPANY_STATE}}', label: 'UF da empresa', group: 'company' },
  { key: 'COMPANY_PHONE', token: '{{COMPANY_PHONE}}', label: 'Telefone da empresa', group: 'company' },
  { key: 'COMPANY_EMAIL', token: '{{COMPANY_EMAIL}}', label: 'E-mail da empresa', group: 'company' },
  { key: 'COMPANY_LOGO_URL', token: '{{COMPANY_LOGO_URL}}', label: 'Logo da empresa', group: 'company' },

  { key: 'CLIENT_NAME', token: '{{CLIENT_NAME}}', label: 'Nome do comprador', group: 'buyer' },
  { key: 'CLIENT_CPF', token: '{{CLIENT_CPF}}', label: 'CPF do comprador', group: 'buyer' },
  { key: 'CLIENT_RG', token: '{{CLIENT_RG}}', label: 'RG do comprador', group: 'buyer' },
  { key: 'CLIENT_RG_ISSUER', token: '{{CLIENT_RG_ISSUER}}', label: 'Órgão emissor do RG', group: 'buyer' },
  { key: 'CLIENT_NATIONALITY', token: '{{CLIENT_NATIONALITY}}', label: 'Nacionalidade do comprador', group: 'buyer' },
  { key: 'CLIENT_PROFESSION', token: '{{CLIENT_PROFESSION}}', label: 'Profissão do comprador', group: 'buyer' },
  { key: 'CLIENT_CIVIL_STATE', token: '{{CLIENT_CIVIL_STATE}}', label: 'Estado civil do comprador', group: 'buyer' },
  { key: 'CLIENT_ADDRESS', token: '{{CLIENT_ADDRESS}}', label: 'Endereço do comprador', group: 'buyer' },
  { key: 'CLIENT_PHONE', token: '{{CLIENT_PHONE}}', label: 'Telefone do comprador', group: 'buyer' },
  { key: 'CLIENT_EMAIL', token: '{{CLIENT_EMAIL}}', label: 'E-mail do comprador', group: 'buyer' },

  { key: 'SPOUSE_NAME', token: '{{SPOUSE_NAME}}', label: 'Nome do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_CPF', token: '{{SPOUSE_CPF}}', label: 'CPF do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_RG', token: '{{SPOUSE_RG}}', label: 'RG do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_RG_ISSUER', token: '{{SPOUSE_RG_ISSUER}}', label: 'Órgão emissor do RG do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_NATIONALITY', token: '{{SPOUSE_NATIONALITY}}', label: 'Nacionalidade do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_PROFESSION', token: '{{SPOUSE_PROFESSION}}', label: 'Profissão do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_PHONE', token: '{{SPOUSE_PHONE}}', label: 'Telefone do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_EMAIL', token: '{{SPOUSE_EMAIL}}', label: 'E-mail do cônjuge', group: 'spouse' },
  { key: 'SPOUSE_ADDRESS', token: '{{SPOUSE_ADDRESS}}', label: 'Endereço do cônjuge', group: 'spouse' },

  { key: 'SELLER_NAME', token: '{{SELLER_NAME}}', label: 'Nome do vendedor', group: 'seller' },
  { key: 'SELLER_CPF_CNPJ', token: '{{SELLER_CPF_CNPJ}}', label: 'CPF/CNPJ do vendedor', group: 'seller' },
  { key: 'SELLER_ADDRESS', token: '{{SELLER_ADDRESS}}', label: 'Endereço do vendedor', group: 'seller' },
  { key: 'SELLER_PHONE', token: '{{SELLER_PHONE}}', label: 'Telefone do vendedor', group: 'seller' },

  { key: 'PROJECT_NAME', token: '{{PROJECT_NAME}}', label: 'Empreendimento', group: 'project' },
  { key: 'PROJECT_CITY', token: '{{PROJECT_CITY}}', label: 'Cidade do empreendimento', group: 'project' },
  { key: 'PROJECT_STATE', token: '{{PROJECT_STATE}}', label: 'UF do empreendimento', group: 'project' },
  { key: 'PROJECT_FORUM_CITY', token: '{{PROJECT_FORUM_CITY}}', label: 'Comarca / foro', group: 'project' },

  { key: 'BLOCK_NAME', token: '{{BLOCK_NAME}}', label: 'Quadra', group: 'lot' },
  { key: 'LOT_NUMBER', token: '{{LOT_NUMBER}}', label: 'Lote', group: 'lot' },
  { key: 'LOT_AREA', token: '{{LOT_AREA}}', label: 'Área do lote', group: 'lot' },
  { key: 'LOT_BOUNDARIES', token: '{{LOT_BOUNDARIES}}', label: 'Confrontações', group: 'lot' },

  { key: 'SALE_VALUE', token: '{{SALE_VALUE}}', label: 'Valor da venda', group: 'finance' },
  { key: 'PAYMENT_TYPE', token: '{{PAYMENT_TYPE}}', label: 'Forma de pagamento', group: 'finance' },
  { key: 'DOWN_PAYMENT', token: '{{DOWN_PAYMENT}}', label: 'Entrada', group: 'finance' },
  { key: 'INSTALLMENTS_COUNT', token: '{{INSTALLMENTS_COUNT}}', label: 'Quantidade de parcelas', group: 'finance' },
  { key: 'INSTALLMENT_VALUE', token: '{{INSTALLMENT_VALUE}}', label: 'Valor da parcela', group: 'finance' },
  { key: 'FIRST_DUE_DATE', token: '{{FIRST_DUE_DATE}}', label: 'Primeiro vencimento', group: 'finance' },
  { key: 'LAST_DUE_DATE', token: '{{LAST_DUE_DATE}}', label: 'Último vencimento', group: 'finance' },

  { key: 'CONTRACT_DATE', token: '{{CONTRACT_DATE}}', label: 'Data do contrato', group: 'dates' },
  { key: 'SALE_DATE', token: '{{SALE_DATE}}', label: 'Data da venda', group: 'dates' },
  { key: 'TODAY', token: '{{TODAY}}', label: 'Data de hoje', group: 'dates' },
];

const BY_KEY = new Map(CUSTOM_PLACEHOLDERS.map((row) => [row.key, row]));
export const CUSTOM_PLACEHOLDER_KEYS = new Set(CUSTOM_PLACEHOLDERS.map((row) => row.key));

export function customPlaceholderToken(key: string): string {
  return `{{${String(key || '').trim().toUpperCase()}}}`;
}

export function findCustomPlaceholder(key: string): CustomPlaceholderDef | null {
  return BY_KEY.get(String(key || '').trim().toUpperCase()) || null;
}

export function customPlaceholderLabel(key: string): string {
  return findCustomPlaceholder(key)?.label || customPlaceholderToken(key);
}

export function placeholdersByGroup(group: CustomPlaceholderGroupId): CustomPlaceholderDef[] {
  return CUSTOM_PLACEHOLDERS.filter((row) => row.group === group);
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
