/**
 * Signatários eletrônicos — modelo ESTRELA_DO_SUL (isolado).
 * BUYER + SPOUSE (quando houver) + VENDOR da empresa + segundo VENDOR se completo.
 * Sem INTERVENIENT. Sem WITNESS persistida (slots visuais no instrumento).
 */

import { onlyDigits } from '@/lib/inputMasks';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import { isValidSignerEmail, normalizeSignerEmail } from '@/lib/saleContractEmailValidation';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import {
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
} from '@/lib/contractSecondVendor';

export function isEstrelaDoSulSaleContractModel(model?: string | null): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  return key === 'ESTRELA_DO_SUL' || key.includes('ESTRELA_DO_SUL');
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s && s !== 'Não informado') return s;
  }
  return '';
}

export function buildEstrelaDoSulEsignVendorPartyInputs(input?: {
  company?: Record<string, unknown> | null;
}): Array<{
  name: string;
  cpf: string;
  phone: string | null;
  email: string | null;
  order: number;
}> {
  const company = input?.company && typeof input.company === 'object' ? input.company : {};
  const seller = normalizeSellerFromCompany(company);
  const legalName = pickString(
    company.legal_representative,
    company.responsible_name,
    seller.representative,
  );
  const companyName = pickString(
    company.razao_social,
    company.fantasy_name,
    company.name,
    seller.razaoSocial,
  );
  const legalCpf = onlyDigits(
    pickString(
      company.representative_cpf,
      company.legal_representative_cpf,
      company.responsible_cpf,
      seller.representativeCpf,
    ),
  );
  const emailRaw = pickString(
    company.legal_representative_email,
    company.email,
    seller.email,
  );
  const phoneRaw = pickString(
    company.legal_representative_phone,
    company.phone,
    seller.phone,
  );

  const vendors: Array<{
    name: string;
    cpf: string;
    phone: string | null;
    email: string | null;
    order: number;
  }> = [];

  vendors.push({
    name: legalName || companyName || 'VENDEDOR',
    cpf: legalCpf,
    phone: normalizeWhatsAppPhone(phoneRaw) || phoneRaw || null,
    email: emailRaw && isValidSignerEmail(emailRaw) ? normalizeSignerEmail(emailRaw) : null,
    order: 1,
  });

  const second = parseContractSecondVendorJson(company.contract_second_vendor_json);
  if (isContractSecondVendorComplete(second)) {
    const secondEmail = second.email && isValidSignerEmail(second.email)
      ? normalizeSignerEmail(second.email)
      : null;
    vendors.push({
      name: second.name,
      cpf: onlyDigits(second.cpf),
      phone: normalizeWhatsAppPhone(second.phone) || second.phone || null,
      email: secondEmail,
      order: 2,
    });
  }

  return vendors;
}
