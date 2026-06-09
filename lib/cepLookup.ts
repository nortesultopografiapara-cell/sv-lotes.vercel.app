/**
 * Consulta CEP via ViaCEP — preenchimento de endereço (cliente/venda).
 */

import { formatCep, normalizeCep } from '@/lib/inputMasks';

export type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

export type CepAddressFields = {
  address?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  state_uf?: string;
  cep?: string;
  zip_code?: string;
};

export type CepLookupResult =
  | { ok: true; data: ViaCepResponse; fields: CepAddressFields }
  | { ok: false; reason: 'incomplete' | 'not_found' | 'error' };

export function isCompleteCep(value?: string | null): boolean {
  return normalizeCep(value).length === 8;
}

export function mapViaCepToAddressFields(
  response: ViaCepResponse,
): CepAddressFields {
  const logradouro = String(response.logradouro || '').trim();
  const bairro = String(response.bairro || '').trim();
  const city = String(response.localidade || '').trim();
  const uf = String(response.uf || '').trim().toUpperCase().slice(0, 2);
  const cep = formatCep(response.cep || '');

  return {
    address: logradouro,
    street: logradouro,
    neighborhood: bairro,
    city,
    state: uf,
    state_uf: uf,
    cep,
    zip_code: cep,
  };
}

export async function lookupCep(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<CepLookupResult> {
  const digits = normalizeCep(value);
  if (digits.length !== 8) {
    return { ok: false, reason: 'incomplete' };
  }

  try {
    const res = await fetcher(`https://viacep.com.br/ws/${digits}/json/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, reason: 'error' };
    }
    const data = (await res.json()) as ViaCepResponse;
    if (data.erro) {
      return { ok: false, reason: 'not_found' };
    }
    return {
      ok: true,
      data,
      fields: mapViaCepToAddressFields(data),
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
