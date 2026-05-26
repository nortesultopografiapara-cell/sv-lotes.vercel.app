/** Utilitários e mapeamento BrasilAPI → formulário Nova Empresa */

export type CompanyLookupFormData = {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  cep: string;
};

export function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function isCnpjDocument(value: string): boolean {
  return onlyDigits(value).length === 14;
}

export function isCpfDocument(value: string): boolean {
  return onlyDigits(value).length === 11;
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length !== 14) return value;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length !== 8) return value;
  return d.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

/** BrasilAPI envia DDD+telefone em um único campo (ex.: "1123851939"). */
function formatDddTelefone(value?: string | number | null): string {
  const d = onlyDigits(String(value ?? ''));
  if (d.length < 10) return '';
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  if (local.length === 9) {
    return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
  }
  if (local.length === 8) {
    return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  return `(${ddd}) ${local}`;
}

function buildAddress(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const logradouro = String(data.logradouro || '').trim();
  const numero = String(data.numero || '').trim();
  const complemento = String(data.complemento || '').trim();
  const bairro = String(data.bairro || '').trim();

  if (logradouro) {
    let line = logradouro;
    if (numero) line += `, ${numero}`;
    if (complemento) line += ` - ${complemento}`;
    parts.push(line);
  }
  if (bairro) parts.push(bairro);

  return parts.join(' — ');
}

export function mapBrasilApiCnpjToForm(data: Record<string, unknown>): CompanyLookupFormData {
  const razao = String(data.razao_social || '').trim();
  const fantasia = String(data.nome_fantasia || '').trim();
  const cnpjRaw = data.cnpj != null ? String(data.cnpj) : '';

  const email =
    String(data.email || data.email_contato || data.correio_eletronico || '').trim() || '';

  const phone =
    formatDddTelefone(data.ddd_telefone_1 as string | number | undefined) ||
    formatDddTelefone(data.ddd_telefone_2 as string | number | undefined);

  return {
    name: razao || fantasia || '',
    cnpj: formatCnpj(cnpjRaw),
    email,
    phone,
    address: buildAddress(data),
    city: String(data.municipio || data.cidade || '').trim(),
    state: String(data.uf || '').trim().toUpperCase().slice(0, 2),
    cep: formatCep(String(data.cep || '')),
  };
}

export function masterCnpjLog(
  message: 'consultando CNPJ' | 'empresa encontrada' | 'erro consulta CNPJ',
  detail?: Record<string, unknown>
) {
  const extra = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[MASTER] ${message}${extra}`);
}
