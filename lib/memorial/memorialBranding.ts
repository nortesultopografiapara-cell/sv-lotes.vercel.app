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
/** Título com espaçamento entre letras (layout PDF). */
export function formatMemorialTitleSpaced(): string {
  return 'MEMORIAL DESCRITIVO'.split('').join(' ');
}

/** Linhas de contato para cabeçalho horizontal — mesmos dados da empresa logada. */
export function buildMemorialHeaderContactLines(
  company: MemorialCompanyInfo,
): string[] {
  const lines: string[] = [];
  const rawAddress = sanitizeMemorialDisplayText(company.address);

  if (rawAddress && rawAddress !== 'Não informado') {
    const parts = rawAddress
      .split(' — ')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      lines.push(parts[0]!);
      const cityUf = formatMemorialCompanyCityUf(company);
      const cepPart = parts.find((p) => /\d{5}[\-]?\d{0,3}/.test(p));
      if (cityUf && cepPart) {
        lines.push(`${cityUf} — CEP: ${cepPart}`);
      } else if (cityUf) {
        lines.push(cityUf);
      } else if (cepPart) {
        lines.push(`CEP: ${cepPart}`);
      }
    } else {
      lines.push(rawAddress);
    }
  } else {
    const cityUf = formatMemorialCompanyCityUf(company);
    if (cityUf) lines.push(cityUf);
  }

  const phone = sanitizeMemorialDisplayText(company.phone);
  if (phone !== 'Não informado') {
    lines.push(`Fone: ${phone}`);
  }

  const email = sanitizeMemorialDisplayText(company.email);
  if (email !== 'Não informado') {
    lines.push(email);
  }

  const cnpj = sanitizeMemorialDisplayText(company.cnpj);
  if (cnpj !== 'Não informado') {
    lines.push(`CNPJ: ${cnpj}`);
  }

  return lines;
}

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
