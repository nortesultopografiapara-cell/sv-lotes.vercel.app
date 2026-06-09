/**
 * Consulta CNPJ via BrasilAPI — preenchimento de dados empresariais (cliente/venda).
 * CPF não dispara busca automática.
 */

import { formatCep, formatCpfCnpj, normalizeCpfCnpj } from '@/lib/inputMasks';

export type BrasilApiCnpjResponse = Record<string, unknown>;

export type CnpjCustomerFields = {
  name?: string;
  company_name?: string;
  corporate_name?: string;
  trade_name?: string;
  nome_fantasia?: string;
  cpf_cnpj?: string;
  address?: string;
  street?: string;
  number?: string;
  numero?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  state_uf?: string;
  cep?: string;
  zip_code?: string;
  email?: string;
  phone?: string;
};

export type CnpjLookupResult =
  | { ok: true; data: BrasilApiCnpjResponse; fields: CnpjCustomerFields }
  | { ok: false; reason: 'incomplete' | 'not_cnpj' | 'not_found' | 'error' };

function formatDddTelefone(value?: string | number | null): string {
  const d = String(value ?? '').replace(/\D/g, '');
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

function buildStreetLine(data: Record<string, unknown>): string {
  const tipo = String(data.descricao_tipo_de_logradouro || '').trim();
  const logradouro = String(data.logradouro || '').trim();
  const numero = String(data.numero || '').trim();
  const complemento = String(data.complemento || '').trim();

  let street = logradouro;
  if (tipo && logradouro && !logradouro.toUpperCase().startsWith(tipo.toUpperCase())) {
    street = `${tipo} ${logradouro}`;
  } else if (tipo && !logradouro) {
    street = tipo;
  }

  if (!street) return '';
  let line = street;
  if (numero) line += `, ${numero}`;
  if (complemento) line += ` - ${complemento}`;
  return line;
}

export function isCompleteCnpj(value?: string | null): boolean {
  return normalizeCpfCnpj(value).length === 14;
}

export function mapBrasilApiCnpjToCustomerFields(
  data: BrasilApiCnpjResponse,
): CnpjCustomerFields {
  const razao = String(data.razao_social || '').trim();
  const fantasia = String(data.nome_fantasia || '').trim();
  const cnpj = formatCpfCnpj(String(data.cnpj ?? ''));
  const address = buildStreetLine(data);
  const neighborhood = String(data.bairro || '').trim();
  const city = String(data.municipio || data.cidade || '').trim();
  const uf = String(data.uf || '').trim().toUpperCase().slice(0, 2);
  const cep = formatCep(String(data.cep || ''));
  const email = String(data.email || '').trim();
  const phone =
    formatDddTelefone(data.ddd_telefone_1 as string | number | undefined) ||
    formatDddTelefone(data.ddd_telefone_2 as string | number | undefined) ||
    formatDddTelefone(data.telefone as string | number | undefined);

  return {
    name: razao || fantasia,
    company_name: razao,
    corporate_name: razao,
    trade_name: fantasia,
    nome_fantasia: fantasia,
    cpf_cnpj: cnpj,
    address,
    street: address,
    number: String(data.numero || '').trim() || undefined,
    numero: String(data.numero || '').trim() || undefined,
    neighborhood,
    city,
    state: uf,
    state_uf: uf,
    cep,
    zip_code: cep,
    email: email || undefined,
    phone: phone || undefined,
  };
}

export async function lookupCnpj(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<CnpjLookupResult> {
  const digits = normalizeCpfCnpj(value);
  if (digits.length < 14) {
    return { ok: false, reason: digits.length === 11 ? 'not_cnpj' : 'incomplete' };
  }
  if (digits.length > 14) {
    return { ok: false, reason: 'incomplete' };
  }

  try {
    const res = await fetcher(
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );
    if (res.status === 404) {
      return { ok: false, reason: 'not_found' };
    }
    if (!res.ok) {
      return { ok: false, reason: 'error' };
    }
    const data = (await res.json()) as BrasilApiCnpjResponse;
    return {
      ok: true,
      data,
      fields: mapBrasilApiCnpjToCustomerFields(data),
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
