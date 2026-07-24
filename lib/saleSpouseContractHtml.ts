/**
 * HTML compartilhado do cônjuge anuente — qualificação e slot de assinatura.
 * Usado por Meneses/PADRAO, Recanto e SV LOTES 2.0.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import type { SaleSpouseContextPerson } from '@/lib/saleSpouseFields';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanPart(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'não informado') return '';
  return text;
}

function formatCpfDisplay(cpf?: string | null): string {
  const raw = cleanPart(cpf);
  if (!raw) return '';
  return formatCpfCnpj(raw) || raw;
}

/** Qualificação clássica (Meneses / PADRAO) — parágrafo após o comprador. */
export function buildClassicSpouseQualificationHtml(
  spouse: SaleSpouseContextPerson | null | undefined,
): string {
  if (!spouse?.name) return '';

  const name = toContractTitleCase(spouse.name);
  const parts: string[] = [`<strong>CÔNJUGE ANUENTE:</strong> <strong>${escapeHtml(name)}</strong>`];

  const cpf = formatCpfDisplay(spouse.cpf);
  if (cpf) parts.push(`CPF nº ${escapeHtml(cpf)}`);

  const nationality = cleanPart(spouse.nationality);
  if (nationality) {
    parts.push(`nacionalidade ${escapeHtml(toContractTitleCase(nationality))}`);
  }

  const marital = cleanPart(spouse.maritalStatus);
  if (marital) {
    parts.push(`estado civil ${escapeHtml(toContractTitleCase(marital))}`);
  }

  const profession = cleanPart(spouse.profession);
  if (profession) {
    parts.push(`profissão ${escapeHtml(toContractTitleCase(profession))}`);
  }

  const rg = cleanPart(spouse.rg);
  const issuer = cleanPart(spouse.issuer);
  if (rg) {
    parts.push(
      issuer
        ? `RG ${escapeHtml(rg)} — ${escapeHtml(issuer)}`
        : `RG ${escapeHtml(rg)}`,
    );
  }

  const address = cleanPart(spouse.address);
  if (address) {
    parts.push(
      `residente e domiciliado(a) ${escapeHtml(toContractTitleCase(address))}`,
    );
  }

  return `
                <p style="margin-bottom: 10px;" class="contract-spouse-qualification" data-party-role="SPOUSE">
                    ${parts.join(', ')}.
                </p>`;
}

/** Slot de assinatura clássico (entre comprador e testemunhas). */
export function buildClassicSpouseSignatureSlotHtml(
  spouse: SaleSpouseContextPerson | null | undefined,
): string {
  if (!spouse?.name) return '';

  const name = toContractTitleCase(spouse.name);
  const cpf = formatCpfDisplay(spouse.cpf);

  return `
                <div class="signature-slot" data-party-role="SPOUSE">
                    <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
                    <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${escapeHtml(name)}</p>
                    <p style="margin: 0; font-size: 10pt; font-weight: normal;">CÔNJUGE ANUENTE${
                      cpf ? `<br/>CPF: ${escapeHtml(cpf)}` : ''
                    }</p>
                </div>`;
}

/** Qualificação SV LOTES 2.0. */
export function buildSv2SpouseQualificationHtml(
  spouse: SaleSpouseContextPerson | null | undefined,
): string {
  if (!spouse?.name) return '';

  const name = toContractTitleCase(spouse.name);
  const parts = [
    `<strong>CÔNJUGE ANUENTE:</strong> ${escapeHtml(name)}`,
    formatCpfDisplay(spouse.cpf)
      ? `<strong>CPF:</strong> ${escapeHtml(formatCpfDisplay(spouse.cpf))}`
      : '',
    cleanPart(spouse.nationality)
      ? `<strong>Nacionalidade:</strong> ${escapeHtml(toContractTitleCase(spouse.nationality!))}`
      : '',
    cleanPart(spouse.maritalStatus)
      ? `<strong>Estado civil:</strong> ${escapeHtml(toContractTitleCase(spouse.maritalStatus!))}`
      : '',
    cleanPart(spouse.profession)
      ? `<strong>Profissão:</strong> ${escapeHtml(toContractTitleCase(spouse.profession!))}`
      : '',
    cleanPart(spouse.rg)
      ? `<strong>RG:</strong> ${escapeHtml(
          spouse.issuer
            ? `${spouse.rg} — ${spouse.issuer}`
            : spouse.rg!,
        )}`
      : '',
    cleanPart(spouse.address)
      ? `<strong>Endereço:</strong> ${escapeHtml(toContractTitleCase(spouse.address!))}`
      : '',
  ].filter(Boolean);

  return `<div class="sv2-party-block contract-spouse-qualification" data-party-role="SPOUSE">${parts
    .map((p) => `<p>${p}</p>`)
    .join('')}</div>`;
}

/** Slot SV2 — usa signature-slot + data-party-role para selos. */
export function buildSv2SpouseSignatureSlotHtml(
  spouse: SaleSpouseContextPerson | null | undefined,
): string {
  if (!spouse?.name) return '';

  const name = toContractTitleCase(spouse.name);
  const cpf = formatCpfDisplay(spouse.cpf);

  return `
        <div class="signature-slot sv2-sign-line" data-party-role="SPOUSE" style="text-align:center; margin-top: 10px;">
          <div style="border-top: 1px solid #111; margin: 0 auto 6px auto; width: 70%; max-width: 280px;"></div>
          <strong>${escapeHtml(name)}</strong><br/>
          CÔNJUGE ANUENTE<br/>
          ${cpf ? `CPF: ${escapeHtml(cpf)}` : ''}
        </div>`;
}

/** Atributo data-party-role para slots de assinatura. */
export function signatureSlotPartyRoleAttr(
  role: 'VENDOR' | 'BUYER' | 'SPOUSE' | 'WITNESS',
): string {
  return `data-party-role="${role}"`;
}

export function contractHtmlHasSpousePartyRoleAttr(
  contractHtml?: string | null,
): boolean {
  const raw = String(contractHtml || '');
  return /data-party-role\s*=\s*["']SPOUSE["']/i.test(raw);
}
