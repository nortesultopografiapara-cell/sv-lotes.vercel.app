/**
 * Nota Promissória ARAGUAIA — resolução pura (valor, vencimento, partes, elegibilidade, HTML).
 * Persistência: araguaiaPromissoryNoteService. PDF: araguaiaPromissoryNotePdf.
 */

import extenso from 'extenso';
import { resolveCompanyContractVendors } from '@/lib/araguaiaCompanyLegalRepresentative';
import { isAraguaiaSaleContractModel } from '@/lib/araguaiaContractEsign';
import {
  formatContractDueDateBr,
  formatContractDueDateLongBr,
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import { resolveSaleContractModelFromContext } from '@/lib/contractModel';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import { formatCpfCnpj } from '@/lib/inputMasks';

export const PROMISSORY_NOTE_DOCUMENT_TYPE = 'PROMISSORY_NOTE';
export const PROMISSORY_NOTE_LEGAL_NUMBER = 1;
export const PROMISSORY_NOTE_SOURCE = 'ARAGUAIA';

export const PROMISSORY_NOTE_CASH_TOOLTIP =
  'Nota Promissória disponível apenas para vendas com saldo parcelado.';

export const PROMISSORY_NOTE_PAYABLE_FALLBACK = 'onde for posta em cobrança';

export type PromissoryNoteReceiptRef = ContractFinanceReceiptRef & {
  amount?: number | string | null;
};

export type PromissoryNoteParty = {
  name: string;
  cpf: string;
  rg: string | null;
  address: string | null;
  /** Dados estruturados para qualificação jurídica no corpo da NP. */
  nationality: string | null;
  maritalStatus: string | null;
  profession: string | null;
  /**
   * Resumo interno (nacionalidade/estado civil/profissão).
   * Não é exibido no bloco EMITENTE da Nota Promissória.
   */
  qualification: string | null;
};

export type PromissoryNoteAmountResult = {
  amount: number;
  amountFmt: string;
  amountExtenso: string;
  source: 'finance_receipts' | 'sale_fallback';
};

export type PromissoryNoteDueDateResult = {
  dueDateRaw: string | null;
  dueDateFmt: string;
  dueDateLong: string;
  source: 'finance_receipts' | 'contract_fallback' | 'none';
};

export type PromissoryNotePayableAtResult = {
  payableAt: string;
  source: 'project' | 'company' | 'fallback';
};

export type PromissoryNoteEligibility = {
  applicable: boolean;
  reason:
    | 'ok'
    | 'not_araguaia'
    | 'cash_sale'
    | 'no_balance'
    | 'cancelled_no_doc'
    | 'cancelled_history_only';
  tooltip: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatPromissoryNoteBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(roundMoney(val));
}

export function currencyExtensoPromissoryNote(val: number): string {
  const n = roundMoney(val);
  if (!(n > 0)) return '';
  try {
    return extenso(n.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

function isActiveReceipt(r: PromissoryNoteReceiptRef): boolean {
  if (!r) return false;
  const st = String(r.status || '').toLowerCase();
  return st !== 'cancelado' && st !== 'cancelled';
}

function installmentNumberOf(r: PromissoryNoteReceiptRef): number {
  const n = Number(r.installment_number);
  return Number.isFinite(n) ? n : NaN;
}

/** Parcelas do saldo (exclui entrada installment_number = 0). */
export function filterPromissoryNoteInstallmentReceipts(
  receipts?: PromissoryNoteReceiptRef[] | null,
): PromissoryNoteReceiptRef[] {
  return (receipts || []).filter((r) => {
    if (!isActiveReceipt(r)) return false;
    const num = installmentNumberOf(r);
    return Number.isFinite(num) && num >= 1;
  });
}

/**
 * Valor da NP = saldo parcelado.
 * Preferência: soma finance_receipts com installment_number >= 1.
 * Fallback: total_value - down_payment.
 */
export function resolvePromissoryNoteAmount(input: {
  sale: Record<string, unknown>;
  receipts?: PromissoryNoteReceiptRef[] | null;
}): PromissoryNoteAmountResult {
  const parcelRecs = filterPromissoryNoteInstallmentReceipts(input.receipts);
  if (parcelRecs.length > 0) {
    const sum = roundMoney(
      parcelRecs.reduce((acc, r) => acc + (Number(r.amount) || 0), 0),
    );
    return {
      amount: sum,
      amountFmt: formatPromissoryNoteBRL(sum),
      amountExtenso: currencyExtensoPromissoryNote(sum),
      source: 'finance_receipts',
    };
  }

  const total =
    Number(input.sale.total_value) ||
    Number(input.sale.final_value) ||
    Number(input.sale.agreed_price) ||
    0;
  const down = Number(input.sale.down_payment) || 0;
  const amount = roundMoney(Math.max(0, total - down));
  return {
    amount,
    amountFmt: formatPromissoryNoteBRL(amount),
    amountExtenso: currencyExtensoPromissoryNote(amount),
    source: 'sale_fallback',
  };
}

/**
 * Vencimento = due_date da última parcela do saldo.
 * Preferência: maior due_date entre installment_number >= 1.
 * Fallback: lastInstallmentDueDate do helper contratual.
 */
export function resolvePromissoryNoteDueDate(input: {
  sale: Record<string, unknown>;
  receipts?: PromissoryNoteReceiptRef[] | null;
}): PromissoryNoteDueDateResult {
  const parcelRecs = filterPromissoryNoteInstallmentReceipts(input.receipts);
  if (parcelRecs.length > 0) {
    const maxDue = parcelRecs
      .map((r) => String(r.due_date || '').trim().split('T')[0])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .at(-1);
    if (maxDue) {
      return {
        dueDateRaw: maxDue,
        dueDateFmt: formatContractDueDateBr(maxDue),
        dueDateLong: formatContractDueDateLongBr(maxDue),
        source: 'finance_receipts',
      };
    }
  }

  const paymentDates = resolveContractPaymentDates(input.sale, input.receipts);
  const fallback = paymentDates.lastInstallmentDueRaw;
  if (fallback) {
    return {
      dueDateRaw: fallback,
      dueDateFmt:
        paymentDates.lastInstallmentDueFmt || formatContractDueDateBr(fallback),
      dueDateLong:
        formatContractDueDateLongBr(fallback) ||
        paymentDates.lastInstallmentDueFmt,
      source: 'contract_fallback',
    };
  }

  return {
    dueDateRaw: null,
    dueDateFmt: '',
    dueDateLong: '',
    source: 'none',
  };
}

/** Pagável em: município/UF do empreendimento → company → fallback genérico. */
export function resolvePromissoryNotePayableAt(input: {
  project?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
}): PromissoryNotePayableAtResult {
  const project = input.project || {};
  const company = input.company || {};

  const projectCity = clean(project.city || project.cidade);
  const projectUf = clean(project.uf || project.state || project.state_uf);
  if (projectCity && projectUf) {
    return { payableAt: `${projectCity} / ${projectUf}`, source: 'project' };
  }
  if (projectCity) {
    return { payableAt: projectCity, source: 'project' };
  }

  const companyCity = clean(company.city || company.cidade);
  const companyUf = clean(company.state || company.uf || company.state_uf);
  if (companyCity && companyUf) {
    return { payableAt: `${companyCity} / ${companyUf}`, source: 'company' };
  }
  if (companyCity) {
    return { payableAt: companyCity, source: 'company' };
  }

  return {
    payableAt: PROMISSORY_NOTE_PAYABLE_FALLBACK,
    source: 'fallback',
  };
}

function buildBuyerAddress(customer: Record<string, unknown>): string | null {
  const parts = [
    clean(customer.address || customer.endereco),
    clean(customer.neighborhood || customer.bairro),
    clean(customer.city || customer.cidade),
    clean(customer.state || customer.state_uf || customer.uf),
    clean(customer.zip_code || customer.cep),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function buildBuyerRg(customer: Record<string, unknown>): string | null {
  const rg = clean(customer.rg || customer.identity_document);
  if (!rg) return null;
  const issuer = clean(
    customer.rg_issuer || customer.rg_orgao || customer.identity_issuer,
  );
  const uf = clean(
    customer.rg_issuer_state ||
      customer.rg_uf ||
      customer.identity_issuer_state ||
      customer.rg_issuer_uf,
  );
  let out = rg;
  if (issuer) out = `${out} ${issuer}`;
  if (uf) out = `${out}/${uf}`;
  return out;
}

export function resolvePromissoryNoteBuyer(
  customer?: Record<string, unknown> | null,
): PromissoryNoteParty {
  const c = customer || {};
  const name = toContractTitleCase(clean(c.name || c.full_name));
  const cpfRaw = clean(c.cpf_cnpj || c.document || c.cpf);
  const cpf = formatCpfCnpj(cpfRaw) || cpfRaw;
  const nationality = toContractTitleCase(
    clean(c.nationality || c.nacionalidade),
  );
  const marital = toContractTitleCase(
    clean(c.civil_state || c.marital_status || c.estado_civil),
  );
  const profession = toContractTitleCase(clean(c.profession || c.profissao));
  const qualification =
    [nationality, marital, profession].filter(Boolean).join(', ') || null;

  return {
    name,
    cpf,
    rg: buildBuyerRg(c),
    address: buildBuyerAddress(c),
    nationality: nationality || null,
    maritalStatus: marital || null,
    profession: profession || null,
    qualification,
  };
}

export function resolvePromissoryNoteVendors(input: {
  company?: Record<string, unknown> | null;
}): {
  vendor1: PromissoryNoteParty | null;
  vendor2: PromissoryNoteParty | null;
  vendors: PromissoryNoteParty[];
  error: string | null;
} {
  const resolved = resolveCompanyContractVendors({ company: input.company });
  if (resolved.error || !resolved.vendor1) {
    return {
      vendor1: null,
      vendor2: null,
      vendors: [],
      error:
        resolved.error ||
        'Complete os dados do Vendedor 1 (Representante Legal: nome e CPF) em Configurações antes de gerar a Nota Promissória.',
    };
  }

  const company = input.company || {};
  const companyAddress =
    clean(company.contract_legal_address || company.address || company.endereco) ||
    null;

  const mapParty = (p: {
    name: string;
    cpf?: string | null;
    rg?: string | null;
    address?: string | null;
    nationality?: string | null;
    maritalStatus?: string | null;
    profession?: string | null;
  }): PromissoryNoteParty => {
    const nationality = clean(p.nationality) || null;
    const maritalStatus = clean(p.maritalStatus) || null;
    const profession = clean(p.profession) || null;
    const qualification =
      [nationality, maritalStatus, profession].filter(Boolean).join(', ') ||
      null;
    return {
      name: toContractTitleCase(clean(p.name)),
      cpf: formatCpfCnpj(clean(p.cpf)) || clean(p.cpf),
      rg: clean(p.rg) || null,
      address: clean(p.address) || companyAddress,
      nationality,
      maritalStatus,
      profession,
      qualification,
    };
  };

  // resolveCompanyContractVendors aplica um endereço jurídico ARAGUAIA legado.
  // A Nota Promissória só pode exibir endereço efetivamente cadastrado.
  const vendor1 = {
    ...mapParty(resolved.vendor1),
    address: companyAddress,
  };
  const vendor2 = resolved.vendor2 ? mapParty(resolved.vendor2) : null;
  return {
    vendor1,
    vendor2,
    vendors: vendor2 ? [vendor1, vendor2] : [vendor1],
    error: null,
  };
}

export function isPromissoryNoteAraguaiaModel(input: {
  saleModel?: unknown;
  contractModel?: unknown;
  projectModel?: unknown;
  companyModel?: unknown;
  projectName?: unknown;
}): boolean {
  const { model } = resolveSaleContractModelFromContext(input);
  return isAraguaiaSaleContractModel(model);
}

export function hasPromissoryNoteInstallmentBalance(input: {
  sale: Record<string, unknown>;
  receipts?: PromissoryNoteReceiptRef[] | null;
}): boolean {
  const installmentsCount = Number(input.sale.installments_count);
  if (Number.isFinite(installmentsCount) && installmentsCount <= 0) {
    return false;
  }

  const amount = resolvePromissoryNoteAmount(input).amount;
  if (!(amount > 0)) return false;

  const parcelRecs = filterPromissoryNoteInstallmentReceipts(input.receipts);
  if (parcelRecs.length > 0) return true;

  return Number.isFinite(installmentsCount) && installmentsCount > 0;
}

export function resolvePromissoryNoteEligibility(input: {
  isAraguaia: boolean;
  sale: Record<string, unknown>;
  receipts?: PromissoryNoteReceiptRef[] | null;
  contractStatus?: string | null;
  hasExistingDocument?: boolean;
}): PromissoryNoteEligibility {
  if (!input.isAraguaia) {
    return { applicable: false, reason: 'not_araguaia', tooltip: null };
  }

  const status = String(input.contractStatus || '').toLowerCase();
  const cancelled = status === 'cancelado' || status === 'cancelled';
  const hasBalance = hasPromissoryNoteInstallmentBalance({
    sale: input.sale,
    receipts: input.receipts,
  });

  if (cancelled) {
    if (input.hasExistingDocument) {
      return {
        applicable: true,
        reason: 'cancelled_history_only',
        tooltip: null,
      };
    }
    return {
      applicable: false,
      reason: 'cancelled_no_doc',
      tooltip: 'Contrato cancelado — não é possível gerar Nota Promissória.',
    };
  }

  if (!hasBalance) {
    return {
      applicable: false,
      reason: 'cash_sale',
      tooltip: PROMISSORY_NOTE_CASH_TOOLTIP,
    };
  }

  return { applicable: true, reason: 'ok', tooltip: null };
}

export type PromissoryNoteValidationIssue = {
  code: string;
  message: string;
};

export function validatePromissoryNoteRequiredFields(input: {
  vendor1: PromissoryNoteParty | null;
  buyer: PromissoryNoteParty;
  amount: number;
  dueDateRaw: string | null;
}): PromissoryNoteValidationIssue[] {
  const issues: PromissoryNoteValidationIssue[] = [];

  if (!input.vendor1?.name || !input.vendor1?.cpf) {
    issues.push({
      code: 'vendor1',
      message:
        'Complete os dados do Vendedor 1 (Representante Legal: nome e CPF) em Configurações antes de gerar a Nota Promissória.',
    });
  }

  if (!input.buyer.name || !input.buyer.cpf) {
    issues.push({
      code: 'buyer',
      message:
        'Complete os dados do comprador (nome e CPF) em Clientes antes de gerar a Nota Promissória.',
    });
  }

  if (!(input.amount > 0)) {
    issues.push({
      code: 'amount',
      message:
        'Saldo parcelado inválido para Nota Promissória (valor deve ser maior que zero).',
    });
  }

  if (!input.dueDateRaw) {
    issues.push({
      code: 'due_date',
      message:
        'Não foi possível determinar o vencimento da última parcela. Verifique as parcelas da venda.',
    });
  }

  return issues;
}

/**
 * Qualificação jurídica completa do favorecido (modelo original da NP).
 * Omite apenas trechos sem dado — não inventa campos.
 *
 * Ex.: NOME, nacionalidade, estado civil, profissão,
 * inscrito(a) no CPF sob o nº X e no RG nº Y-ÓRGÃO/UF
 */
export function buildPromissoryNotePartyLegalQualification(
  party: PromissoryNoteParty,
): string {
  const name = clean(party.name);
  if (!name) return '';

  const attrs = [
    clean(party.nationality),
    clean(party.maritalStatus),
    clean(party.profession),
  ].filter(Boolean);

  let phrase = attrs.length ? `${name}, ${attrs.join(', ')}` : name;

  const cpf = clean(party.cpf);
  if (cpf) {
    phrase += `, inscrito(a) no CPF sob o nº ${cpf}`;
  }

  const rg = clean(party.rg);
  if (rg) {
    phrase += cpf ? ` e no RG nº ${rg}` : `, portador(a) do RG nº ${rg}`;
  }

  return phrase;
}

/** Frase dos favorecidos no corpo: 1 ou 2 qualificações completas. */
export function buildPromissoryNoteFavorecidosPhrase(
  vendor1: PromissoryNoteParty,
  vendor2: PromissoryNoteParty | null,
): string {
  const q1 = buildPromissoryNotePartyLegalQualification(vendor1);
  if (vendor2?.name) {
    const q2 = buildPromissoryNotePartyLegalQualification(vendor2);
    return `${q1} e ${q2}`;
  }
  return q1;
}

export type PromissoryNoteDraft = {
  contractId: string;
  contractNumber: string;
  saleId: string;
  promissoryNoteNumber: number;
  amount: number;
  amountFmt: string;
  amountExtenso: string;
  amountSource: PromissoryNoteAmountResult['source'];
  dueDateRaw: string;
  dueDateFmt: string;
  dueDateLong: string;
  dueDateSource: PromissoryNoteDueDateResult['source'];
  payableAt: string;
  payableAtSource: PromissoryNotePayableAtResult['source'];
  vendor1: PromissoryNoteParty;
  vendor2: PromissoryNoteParty | null;
  favorecidosPhrase: string;
  buyer: PromissoryNoteParty;
  clauseReference: string;
};

export function buildPromissoryNoteDraft(input: {
  contractId: string;
  contractNumber: string;
  saleId: string;
  sale: Record<string, unknown>;
  receipts?: PromissoryNoteReceiptRef[] | null;
  project?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
}):
  | { ok: true; draft: PromissoryNoteDraft }
  | { ok: false; issues: PromissoryNoteValidationIssue[] } {
  const amountRes = resolvePromissoryNoteAmount({
    sale: input.sale,
    receipts: input.receipts,
  });
  const dueRes = resolvePromissoryNoteDueDate({
    sale: input.sale,
    receipts: input.receipts,
  });
  const payableRes = resolvePromissoryNotePayableAt({
    project: input.project,
    company: input.company,
  });
  const vendors = resolvePromissoryNoteVendors({ company: input.company });
  const buyer = resolvePromissoryNoteBuyer(input.customer);

  const issues = validatePromissoryNoteRequiredFields({
    vendor1: vendors.vendor1,
    buyer,
    amount: amountRes.amount,
    dueDateRaw: dueRes.dueDateRaw,
  });

  if (issues.length || !vendors.vendor1 || !dueRes.dueDateRaw) {
    return {
      ok: false,
      issues: issues.length
        ? issues
        : [
            {
              code: 'unknown',
              message:
                vendors.error ||
                'Dados insuficientes para gerar a Nota Promissória.',
            },
          ],
    };
  }

  const contractNumber = clean(input.contractNumber) || clean(input.contractId);
  return {
    ok: true,
    draft: {
      contractId: input.contractId,
      contractNumber,
      saleId: input.saleId,
      promissoryNoteNumber: PROMISSORY_NOTE_LEGAL_NUMBER,
      amount: amountRes.amount,
      amountFmt: amountRes.amountFmt,
      amountExtenso: amountRes.amountExtenso,
      amountSource: amountRes.source,
      dueDateRaw: dueRes.dueDateRaw,
      dueDateFmt: dueRes.dueDateFmt,
      dueDateLong: dueRes.dueDateLong || dueRes.dueDateFmt,
      dueDateSource: dueRes.source,
      payableAt: payableRes.payableAt,
      payableAtSource: payableRes.source,
      vendor1: vendors.vendor1,
      vendor2: vendors.vendor2,
      favorecidosPhrase: buildPromissoryNoteFavorecidosPhrase(
        vendors.vendor1,
        vendors.vendor2,
      ),
      buyer,
      clauseReference: `Nota Promissória emitida nos termos da Cláusula Terceira, item 1.2, do Contrato nº ${contractNumber}.`,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPromissoryNoteHtml(draft: PromissoryNoteDraft): string {
  const favorecidos = escapeHtml(draft.favorecidosPhrase);

  const buyerRg = draft.buyer.rg
    ? `<div><strong>RG:</strong> ${escapeHtml(draft.buyer.rg)}</div>`
    : '';
  const buyerAddress = draft.buyer.address
    ? `<div><strong>Endereço:</strong> ${escapeHtml(draft.buyer.address)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Nota Promissória nº ${draft.promissoryNoteNumber} — Contrato ${escapeHtml(draft.contractNumber)}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; color: #111; margin: 0; padding: 32px; line-height: 1.45; }
    .sheet { max-width: 720px; margin: 0 auto; border: 1px solid #222; padding: 36px 40px; }
    h1 { text-align: center; font-size: 20px; letter-spacing: 0.08em; margin: 0 0 8px; }
    .sub { text-align: center; font-size: 13px; margin: 0 0 4px; }
    .meta { text-align: center; font-size: 12px; color: #333; margin-bottom: 24px; }
    .box { border: 1px solid #444; padding: 12px 14px; margin: 16px 0; font-size: 13px; }
    .box div { margin: 2px 0; }
    .body { font-size: 13.5px; text-align: justify; margin: 20px 0; }
    .ref { font-size: 11px; color: #444; font-style: italic; margin: 18px 0 28px; }
    .emitente h2 { font-size: 13px; margin: 0 0 8px; letter-spacing: 0.06em; }
    .sign { margin-top: 64px; text-align: center; font-size: 12px; }
    .sign-line { border-top: 1px solid #111; width: 280px; margin: 72px auto 8px; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>NOTA PROMISSÓRIA</h1>
    <p class="sub">Nota Promissória nº ${draft.promissoryNoteNumber}</p>
    <p class="meta">Contrato nº ${escapeHtml(draft.contractNumber)}</p>

    <div class="box">
      <div><strong>Valor:</strong> ${escapeHtml(draft.amountFmt)}</div>
      <div>(${escapeHtml(draft.amountExtenso)})</div>
      <div style="margin-top:8px"><strong>Vencimento:</strong> ${escapeHtml(draft.dueDateFmt)}</div>
      <div><strong>Pagável em:</strong> ${escapeHtml(draft.payableAt)}</div>
    </div>

    <p class="body">
      Aos ${escapeHtml(draft.dueDateLong)}, pagarei (emos), por esta única via
      de NOTA PROMISSÓRIA, a ${favorecidos}, ou à sua ordem
      ou a quem autorizar, a quantia de ${escapeHtml(draft.amountFmt)}
      (${escapeHtml(draft.amountExtenso)}), em moeda corrente nacional.
    </p>

    <p class="ref">${escapeHtml(draft.clauseReference)}</p>

    <div class="emitente">
      <h2>EMITENTE</h2>
      <div><strong>Nome:</strong> ${escapeHtml(draft.buyer.name)}</div>
      <div><strong>CPF:</strong> ${escapeHtml(draft.buyer.cpf)}</div>
      ${buyerRg}
      ${buyerAddress}
    </div>

    <div class="sign">
      <div class="sign-line"></div>
      <div>Assinatura do Emitente</div>
      <div>${escapeHtml(draft.buyer.name)}</div>
    </div>
  </div>
</body>
</html>`;
}

export type PromissoryNoteArtifactMetadata = {
  contract_id: string;
  contract_number: string;
  document_type: typeof PROMISSORY_NOTE_DOCUMENT_TYPE;
  promissory_note_number: number;
  version: number;
  amount: number;
  due_date: string;
  generated_at: string;
  source: typeof PROMISSORY_NOTE_SOURCE;
  emitted_at: string | null;
  payable_at?: string;
};

export function serializePromissoryNoteDescription(
  meta: PromissoryNoteArtifactMetadata,
): string {
  return JSON.stringify(meta);
}

export function parsePromissoryNoteDescription(
  description: string | null | undefined,
): PromissoryNoteArtifactMetadata | null {
  const raw = String(description || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PromissoryNoteArtifactMetadata>;
    if (parsed.document_type !== PROMISSORY_NOTE_DOCUMENT_TYPE) return null;
    if (!parsed.contract_id || !parsed.version) return null;
    return {
      contract_id: String(parsed.contract_id),
      contract_number: String(parsed.contract_number || ''),
      document_type: PROMISSORY_NOTE_DOCUMENT_TYPE,
      promissory_note_number:
        Number(parsed.promissory_note_number) || PROMISSORY_NOTE_LEGAL_NUMBER,
      version: Number(parsed.version) || 1,
      amount: Number(parsed.amount) || 0,
      due_date: String(parsed.due_date || ''),
      generated_at: String(parsed.generated_at || ''),
      source: PROMISSORY_NOTE_SOURCE,
      emitted_at: parsed.emitted_at ? String(parsed.emitted_at) : null,
      payable_at: parsed.payable_at ? String(parsed.payable_at) : undefined,
    };
  } catch {
    return null;
  }
}

export function isPromissoryNoteEmitted(
  meta: PromissoryNoteArtifactMetadata | null,
): boolean {
  return Boolean(meta?.emitted_at);
}
