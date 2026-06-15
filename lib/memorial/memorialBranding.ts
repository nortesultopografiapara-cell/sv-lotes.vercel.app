/**
 * Cabeçalho/rodapé do memorial — dados da empresa logada (tenant).
 */

import type { MemorialCompanyInfo } from '@/lib/memorial/memorialTypes';

export function sanitizeMemorialDisplayText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/;\s*;+/g, ';')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function memorialCompanyDisplayName(company: MemorialCompanyInfo): string {
  const fantasy = sanitizeMemorialDisplayText(company.fantasyName);
  const legal = sanitizeMemorialDisplayText(company.name);
  if (fantasy && fantasy !== 'Não informado') return fantasy;
  if (legal && legal !== 'Não informado') return legal;
  return 'Não informado';
}

export function buildMemorialHeaderLines(company: MemorialCompanyInfo): string[] {
  const lines: string[] = [];
  const name = memorialCompanyDisplayName(company);
  if (name !== 'Não informado') lines.push(name);

  const slogan = sanitizeMemorialDisplayText(company.slogan);
  if (slogan && slogan !== 'Não informado') lines.push(slogan);

  const cityUf = formatMemorialCompanyCityUf(company);
  if (cityUf) lines.push(cityUf);

  const contacts = [
    company.phone !== 'Não informado'
      ? `Tel.: ${sanitizeMemorialDisplayText(company.phone)}`
      : '',
    company.email !== 'Não informado'
      ? `E-mail: ${sanitizeMemorialDisplayText(company.email)}`
      : '',
    company.website !== 'Não informado'
      ? sanitizeMemorialDisplayText(company.website)
      : '',
    company.instagram !== 'Não informado'
      ? `Instagram: ${sanitizeMemorialDisplayText(company.instagram)}`
      : '',
  ].filter(Boolean);

  if (contacts.length) lines.push(contacts.join('  |  '));

  const address = sanitizeMemorialDisplayText(company.address);
  if (address && address !== 'Não informado') lines.push(address);

  const cnpj = sanitizeMemorialDisplayText(company.cnpj);
  if (cnpj && cnpj !== 'Não informado') lines.push(`CNPJ: ${cnpj}`);

  return lines;
}

export function buildMemorialFooterLines(company: MemorialCompanyInfo): string[] {
  const lines: string[] = [];
  const name = memorialCompanyDisplayName(company);
  if (name !== 'Não informado') lines.push(name);

  const contacts = [
    company.phone !== 'Não informado'
      ? sanitizeMemorialDisplayText(company.phone)
      : '',
    company.email !== 'Não informado'
      ? sanitizeMemorialDisplayText(company.email)
      : '',
    company.website !== 'Não informado'
      ? sanitizeMemorialDisplayText(company.website)
      : '',
  ].filter(Boolean);

  if (contacts.length) lines.push(contacts.join('  ·  '));
  return lines;
}

export function formatMemorialCompanyCityUf(company: MemorialCompanyInfo): string {
  const city = sanitizeMemorialDisplayText(company.city);
  const state = sanitizeMemorialDisplayText(company.state).toUpperCase();
  if (city === 'Não informado' && state === 'NÃO INFORMADO') return '';
  if (city === 'Não informado') return state;
  if (state === 'NÃO INFORMADO' || !state) return city;
  return `${city}/${state}`;
}

export function formatMemorialMunicipality(
  city: unknown,
  state: unknown,
): string {
  const rawCity = sanitizeMemorialDisplayText(city);
  const rawState = sanitizeMemorialDisplayText(state).toUpperCase();
  if (!rawCity && !rawState) return 'Não informado';
  const normalizedCity =
    rawCity.toLowerCase() === 'parauapebas' ? 'Parauapebas' : rawCity;
  const uf = rawState.length === 2 ? rawState : rawState.slice(0, 2);
  if (!normalizedCity) return uf || 'Não informado';
  if (!uf) return normalizedCity;
  return `${normalizedCity}/${uf}`;
}

/** Data por extenso sem dia da semana (evita "domingo"). */
export function formatMemorialDateBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Não informado';
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()] ?? '';
  return `${day} de ${month} de ${d.getFullYear()}`;
}
