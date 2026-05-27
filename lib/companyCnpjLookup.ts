/** Utilitários e mapeamento BrasilAPI / ReceitaWS → formulário Nova Empresa */

export type CompanyLookupResult = {
  name: string;
  fantasy_name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
};

/** @deprecated use CompanyLookupResult — mantido para compatibilidade */
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

export function companyLookupLog(
  message: 'consultando CNPJ' | 'status API' | 'dados recebidos' | 'erro',
  detail?: Record<string, unknown> | string,
) {
  const extra =
    detail === undefined
      ? ''
      : typeof detail === 'string'
        ? ` ${detail}`
        : ` ${JSON.stringify(detail)}`;
  console.log(`[COMPANY_LOOKUP] ${message}${extra}`);
}

/** BrasilAPI envia DDD+telefone em um único campo (ex.: "9433561008"). */
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

function buildAddressFromParts(parts: {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  tipoLogradouro?: string;
}): string {
  const lineParts: string[] = [];
  const logradouro = String(parts.logradouro || '').trim();
  const tipo = String(parts.tipoLogradouro || '').trim();
  const numero = String(parts.numero || '').trim();
  const complemento = String(parts.complemento || '').trim();
  const bairro = String(parts.bairro || '').trim();

  let street = logradouro;
  if (tipo && logradouro && !logradouro.toUpperCase().startsWith(tipo.toUpperCase())) {
    street = `${tipo} ${logradouro}`;
  } else if (tipo && !logradouro) {
    street = tipo;
  }

  if (street) {
    let line = street;
    if (numero) line += `, ${numero}`;
    if (complemento) line += ` - ${complemento}`;
    lineParts.push(line);
  }
  if (bairro) lineParts.push(bairro);

  return lineParts.join(' — ');
}

export function mapBrasilApiCnpjToResult(data: Record<string, unknown>): CompanyLookupResult {
  const razao = String(data.razao_social || '').trim();
  const fantasia = String(data.nome_fantasia || '').trim();
  const cnpjRaw = data.cnpj != null ? String(data.cnpj) : '';

  const email =
    String(data.email || data.email_contato || data.correio_eletronico || '').trim() || '';

  const phone =
    formatDddTelefone(data.ddd_telefone_1 as string | number | undefined) ||
    formatDddTelefone(data.ddd_telefone_2 as string | number | undefined) ||
    formatDddTelefone(data.telefone as string | number | undefined);

  return {
    name: razao || fantasia || '',
    fantasy_name: fantasia,
    cnpj: formatCnpj(cnpjRaw),
    email,
    phone,
    address: buildAddressFromParts({
      logradouro: String(data.logradouro || ''),
      numero: String(data.numero || ''),
      complemento: String(data.complemento || ''),
      bairro: String(data.bairro || ''),
      tipoLogradouro: String(data.descricao_tipo_de_logradouro || ''),
    }),
    city: String(data.municipio || data.cidade || '').trim(),
    state: String(data.uf || '').trim().toUpperCase().slice(0, 2),
    zip_code: formatCep(String(data.cep || '')),
  };
}

export function mapReceitaWsCnpjToResult(data: Record<string, unknown>): CompanyLookupResult {
  const razao = String(data.nome || data.razao_social || '').trim();
  const fantasia = String(data.fantasia || data.nome_fantasia || '').trim();
  const cnpjRaw = data.cnpj != null ? String(data.cnpj) : '';

  const phone = formatDddTelefone(data.telefone as string | undefined);

  return {
    name: razao || fantasia || '',
    fantasy_name: fantasia,
    cnpj: formatCnpj(cnpjRaw),
    email: String(data.email || '').trim(),
    phone,
    address: buildAddressFromParts({
      logradouro: String(data.logradouro || ''),
      numero: String(data.numero || ''),
      complemento: String(data.complemento || ''),
      bairro: String(data.bairro || ''),
    }),
    city: String(data.municipio || data.cidade || '').trim(),
    state: String(data.uf || '').trim().toUpperCase().slice(0, 2),
    zip_code: formatCep(String(data.cep || '')),
  };
}

/** Compat: resposta aninhada em `company` com campo `cep` */
export function mapBrasilApiCnpjToForm(data: Record<string, unknown>): CompanyLookupFormData {
  const r = mapBrasilApiCnpjToResult(data);
  return {
    name: r.name,
    cnpj: r.cnpj,
    email: r.email,
    phone: r.phone,
    address: r.address,
    city: r.city,
    state: r.state,
    cep: r.zip_code,
  };
}

/** @deprecated use companyLookupLog */
export function masterCnpjLog(
  message: 'consultando CNPJ' | 'empresa encontrada' | 'erro consulta CNPJ',
  detail?: Record<string, unknown>,
) {
  const mapped =
    message === 'empresa encontrada' ? 'dados recebidos' : message === 'erro consulta CNPJ' ? 'erro' : message;
  companyLookupLog(mapped as 'consultando CNPJ' | 'dados recebidos' | 'erro', detail);
}
