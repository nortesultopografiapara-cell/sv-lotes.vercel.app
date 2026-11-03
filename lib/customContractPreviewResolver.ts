/**
 * Resolver de prévia CUSTOM — somente leitura.
 * Não cria venda/contrato/financeiro. Não grava HTML oficial.
 * Independente da geração GIS.
 */
import { formatInstallmentCorrectionLabel } from '@/lib/installmentCorrectionType';
import {
  formatContractDueDateBr,
  formatContractSaleDateBr,
  formatContractSaleDateLongBr,
  resolveContractPaymentDates,
  resolveContractSaleDateRaw,
} from '@/lib/contractPaymentDates';
import { formatContractLotBoundariesClause, resolveContractLotSides } from '@/lib/contractLotBoundaries';
import { resolveIdentityDocumentFields } from '@/lib/contractIdentity';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { resolveSaleSpouseContext } from '@/lib/saleSpouseFields';
import { resolveBuyerNationality } from '@/lib/customerIdentity';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';
import {
  formatFinancialAccountLabel,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import {
  formatLfPartnershipNote,
  formatLfPercentLabel,
  parseLfContractConfigJson,
  resolveLfContractConfig,
} from '@/lib/lfImoveisContractConfig';
import { hasLfContractSnapshot, readSaleLfSnapshotRaw } from '@/lib/lfImoveisContractSnapshot';
import { formatEstrelaEnterpriseLocation } from '@/lib/estrelaDoSulContractFormat';
import { resolveCommercialInstallmentScheduleFromSale } from '@/lib/installmentScheduleDescription';
import { resolveRecantoSignalPlan } from '@/lib/recantoSignalRemaining';
import {
  CUSTOM_PLACEHOLDERS,
  customPlaceholderLabel,
  missingPlaceholderMarker,
} from '@/lib/customContractPlaceholders';

export type CustomPreviewSeller = {
  name?: string | null;
  cpfCnpj?: string | null;
  rg?: string | null;
  rgIssuer?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  civilState?: string | null;
  profession?: string | null;
};

export type CustomPreviewInput = {
  tenantId: string;
  company?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  sale?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  lot?: Record<string, unknown> | null;
  contract?: Record<string, unknown> | null;
  receipts?: Array<Record<string, unknown>> | null;
  commissions?: Array<Record<string, unknown>> | null;
  broker?: Record<string, unknown> | null;
  financialAccount?: Record<string, unknown> | null;
  today?: Date;
};

function pick(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text || text === 'Não informado' || text === 'undefined' || text === 'null') continue;
    return text;
  }
  return '';
}

function money(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moneyExtenso(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  try {
    const extenso = require('extenso') as (
      n: string,
      opts: { mode: string },
    ) => string;
    return String(extenso(num.toFixed(2).replace('.', ','), { mode: 'currency' }) || '');
  } catch {
    return '';
  }
}

function measure(value: unknown): string {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function area(value: unknown): string {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((row) => row && typeof row === 'object')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parsePreviewSellers(input: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
}): CustomPreviewSeller[] {
  const fromProject = parseJsonArray(input.project?.seller_parties_json);
  const sellers: CustomPreviewSeller[] = fromProject.map((row) => ({
    name: pick(row.name, row.nome, row.full_name),
    cpfCnpj: pick(row.cpf, row.cpf_cnpj, row.document, row.cnpj),
    rg: pick(row.rg, row.rg_number),
    rgIssuer: pick(row.rg_issuer, row.rgIssuer, row.orgao_emissor),
    address: pick(row.address, row.endereco),
    phone: pick(row.phone, row.telefone),
    email: pick(row.email),
    nationality: pick(row.nationality, row.nacionalidade),
    civilState: pick(row.maritalStatus, row.civil_state, row.estado_civil, row.marital_status),
    profession: pick(row.profession, row.profissao),
  }));

  const companySeller = normalizeSellerFromCompany(input.company || {});
  const second = asRecord(input.company?.contract_second_vendor_json) || {};

  if (sellers.length === 0 && companySeller.name && companySeller.name !== 'Não informado') {
    sellers.push({
      name: pick(companySeller.name, companySeller.razaoSocial),
      cpfCnpj: pick(companySeller.cnpj),
      rg: '',
      address: pick(companySeller.address),
      phone: pick(companySeller.phone),
    });
  }
  if (sellers.length < 2) {
    const extra: CustomPreviewSeller = {
      name: pick(second.name, second.nome),
      cpfCnpj: pick(second.cpf, second.cpf_cnpj, second.document),
      rg: pick(second.rg),
      rgIssuer: pick(second.rgIssuer, second.rg_issuer, [second.rgIssuer, second.rgUf].filter(Boolean).join('/')),
      address: pick(second.address),
      phone: pick(second.phone),
      email: pick(second.email),
      nationality: pick(second.nationality),
      civilState: pick(second.maritalStatus, second.civil_state),
      profession: pick(second.profession),
    };
    if (extra.name || extra.cpfCnpj) sellers.push(extra);
  }
  return sellers;
}

function receiptAmountNumber(
  receipts: Array<Record<string, unknown>> | null | undefined,
  predicate: (n: number) => boolean,
): number | null {
  const match = (receipts || []).find((row) => predicate(Number(row.installment_number)));
  const num = Number(match?.amount);
  return Number.isFinite(num) ? num : null;
}

/** Sinal/entrada contratado (não o valor pago no ato quando há split). */
function resolveContractedDownPayment(
  sale: Record<string, unknown>,
  receipts: Array<Record<string, unknown>> | null | undefined,
): number | null {
  const contracted = sale.signal_contract_value ?? sale.down_payment;
  if (contracted != null && String(contracted).trim() !== '') {
    const num = Number(contracted);
    if (Number.isFinite(num)) return num;
  }
  return (
    receiptAmountNumber(receipts, (n) => n === 0) ??
    receiptAmountNumber(receipts, (n) => n === -1)
  );
}

function publicFinancialAccountLabel(account: Record<string, unknown>): string {
  const name = pick(account.name);
  if (!name) return '';
  const typeRaw = String(account.account_type || account.accountType || '').trim();
  const accountType = (typeRaw || 'OUTRO') as CompanyFinancialAccountType;
  return formatFinancialAccountLabel({
    name,
    accountType,
    beneficiaryName: pick(account.beneficiary_name, account.beneficiaryName) || null,
  });
}

export function resolveCustomPreviewValues(input: CustomPreviewInput): Record<string, string | null> {
  if (input.sale && input.tenantId) {
    const saleTenant = pick(input.sale.company_id, input.sale.tenant_id);
    if (saleTenant && saleTenant !== input.tenantId) {
      throw new Error('A venda escolhida pertence a outra empresa.');
    }
  }

  const company = input.company || {};
  const customer = input.customer || {};
  const sale = input.sale || {};
  const project = input.project || {};
  const lot = input.lot || {};
  const contract = input.contract || {};
  const receipts = (input.receipts || []) as Array<Record<string, unknown>>;
  const broker = input.broker || {};
  const financialAccount = input.financialAccount || {};
  const identity = resolveIdentityDocumentFields(customer);
  const spouse = resolveSaleSpouseContext(sale);
  const sides = resolveContractLotSides(lot);
  const dates = resolveContractPaymentDates(sale, receipts);
  const sellers = parsePreviewSellers({ company, project });
  const lfParsed = parseLfContractConfigJson(
    project.lf_contract_config_json ?? project.lf_contract_config,
  );
  const lfContext =
    hasLfContractSnapshot(readSaleLfSnapshotRaw(sale)) ||
    Boolean(lfParsed.participation) ||
    Boolean(lfParsed.secondVendor.name) ||
    String(sale.contract_model || project.contract_model || '')
      .toUpperCase() === 'ESTRELA_DO_SUL';
  const lfConfig = resolveLfContractConfig({ sale, project, company });
  if (lfContext && lfConfig.hasSecondVendor) {
    sellers[0] = {
      name: pick(company.razao_social, company.fantasy_name, company.name, sellers[0]?.name),
      cpfCnpj: pick(company.cnpj, company.document, sellers[0]?.cpfCnpj),
      rg: sellers[0]?.rg || '',
      address: pick(company.address, sellers[0]?.address),
      phone: pick(company.phone, sellers[0]?.phone),
    };
    sellers[1] = {
      name: pick(lfConfig.secondVendor.name, sellers[1]?.name),
      cpfCnpj: pick(lfConfig.secondVendor.cpf, sellers[1]?.cpfCnpj),
      rg: pick(lfConfig.secondVendor.rg, sellers[1]?.rg),
      rgIssuer: pick(
        [lfConfig.secondVendor.rgIssuer, lfConfig.secondVendor.rgUf].filter(Boolean).join('/'),
        sellers[1]?.rgIssuer,
      ),
      address: pick(lfConfig.secondVendor.address, sellers[1]?.address),
      phone: pick(lfConfig.secondVendor.phone, sellers[1]?.phone),
      email: pick(lfConfig.secondVendor.email, sellers[1]?.email),
      nationality: pick(lfConfig.secondVendor.nationality, sellers[1]?.nationality),
      civilState: pick(lfConfig.secondVendor.maritalStatus, sellers[1]?.civilState),
      profession: pick(lfConfig.secondVendor.profession, sellers[1]?.profession),
    };
  }
  const seller1 = sellers[0] || {};
  const seller2 = sellers[1] || {};
  const saleValue = pick(sale.total_value, sale.agreed_price);
  const commissions = input.commissions || [];
  const commission = pick(
    commissions[0]?.amount,
    commissions[0]?.value,
    sale.broker_commission,
    sale.commission_amount,
    sale.commission,
  );
  const parcelRecs = receipts.filter((row) => Number(row.installment_number) >= 1);
  const installmentValue = money(parcelRecs[0]?.amount ?? sale.installment_value);
  const signalPlan = resolveRecantoSignalPlan({
    contractValue: sale.signal_contract_value ?? sale.down_payment,
    paidAtSale: sale.signal_paid_at_sale,
    paymentMode: sale.signal_remaining_payment_mode,
    remainingInstallments: sale.signal_remaining_installments,
    totalInstallments: sale.installments_count ?? parcelRecs.length,
  });
  const installmentsSchedule = resolveCommercialInstallmentScheduleFromSale(sale, {
    projectLfConfig: project.lf_contract_config_json,
    remainingAddonFallback: signalPlan.remainingInstallmentValue,
  });
  const today = input.today || new Date();
  const contractDateRaw = pick(
    contract.contract_date,
    contract.created_at,
    resolveContractSaleDateRaw(sale),
  );
  const persistedPaymentType = pick(sale.payment_type, sale.payment_method);
  const paymentLabel = persistedPaymentType ? resolveSalePaymentMode(sale).label : '';
  const paymentMode = persistedPaymentType ? resolveSalePaymentMode(sale) : null;
  const firstDue = pick(dates.firstInstallmentDueFmt, formatContractDueDateBr(dates.firstInstallmentDueRaw));
  const entryDue = pick(dates.entryDueFmt, formatContractDueDateBr(dates.entryDueRaw));
  const saleDueDate = paymentMode?.isInstallment
    ? pick(firstDue, entryDue)
    : pick(entryDue, firstDue);

  const values: Record<string, string | null> = {
    COMPANY_NAME: pick(company.fantasy_name, company.name),
    COMPANY_FANTASY_NAME: pick(company.fantasy_name, company.name),
    COMPANY_LEGAL_NAME: pick(company.razao_social, company.fantasy_name, company.name),
    COMPANY_CNPJ: pick(company.cnpj, company.document),
    COMPANY_ADDRESS: pick(company.address, company.endereco),
    COMPANY_NEIGHBORHOOD: pick(company.neighborhood, company.bairro),
    COMPANY_CITY: pick(company.city, company.cidade),
    COMPANY_STATE: pick(company.state, company.uf),
    COMPANY_ZIP: pick(company.zip_code, company.cep),
    COMPANY_PHONE: pick(company.phone),
    COMPANY_EMAIL: pick(company.email),
    COMPANY_CRECI: pick(company.creci, company.contract_creci, company.creci_number),
    COMPANY_LOGO_URL: pick(company.logo_url),

    CLIENT_NAME: pick(customer.name),
    CLIENT_CPF: pick(customer.cpf_cnpj, customer.document),
    CLIENT_RG: pick(identity.rg, customer.rg),
    CLIENT_RG_ISSUER: pick(identity.issuer, customer.rg_issuer),
    CLIENT_RG_STATE: pick(identity.issuerState, customer.rg_issuer_state),
    CLIENT_NATIONALITY: resolveBuyerNationality({ sale, customer }) || null,
    CLIENT_PROFESSION: pick(customer.profession),
    CLIENT_CIVIL_STATE: pick(customer.civil_state, customer.marital_status),
    CLIENT_ADDRESS: pick(customer.address),
    CLIENT_NEIGHBORHOOD: pick(customer.neighborhood),
    CLIENT_CITY: pick(customer.city),
    CLIENT_STATE: pick(customer.state_uf, customer.state),
    CLIENT_ZIP: pick(customer.zip_code, customer.cep),
    CLIENT_PHONE: pick(customer.phone),
    CLIENT_EMAIL: pick(customer.email),

    SPOUSE_NAME: pick(spouse.spouse?.name),
    SPOUSE_CPF: pick(spouse.spouse?.cpf),
    SPOUSE_RG: pick(spouse.spouse?.rg),
    SPOUSE_RG_ISSUER: pick(spouse.spouse?.issuer),
    SPOUSE_NATIONALITY: pick(spouse.spouse?.nationality),
    SPOUSE_PROFESSION: pick(spouse.spouse?.profession),
    SPOUSE_CIVIL_STATE: pick(spouse.spouse?.maritalStatus),
    SPOUSE_ADDRESS: pick(spouse.spouse?.address),
    SPOUSE_PHONE: pick(spouse.spouse?.phone),
    SPOUSE_EMAIL: pick(spouse.spouse?.email),

    SELLER_1_NAME: pick(seller1.name),
    SELLER_1_CPF_CNPJ: pick(seller1.cpfCnpj),
    SELLER_1_RG: pick(seller1.rg),
    SELLER_1_ADDRESS: pick(seller1.address),
    SELLER_1_PHONE: pick(seller1.phone),
    SELLER_2_NAME: pick(seller2.name),
    SELLER_2_CPF_CNPJ: pick(seller2.cpfCnpj),
    SELLER_2_RG: pick(seller2.rg, lfConfig.secondVendor.rg),
    SELLER_2_ADDRESS: pick(seller2.address, lfConfig.secondVendor.address),
    SELLER_2_PHONE: pick(seller2.phone, lfConfig.secondVendor.phone),
    SELLER_2_EMAIL: pick(seller2.email, lfConfig.secondVendor.email),
    SELLER_2_NATIONALITY: pick(seller2.nationality, lfConfig.secondVendor.nationality),
    SELLER_2_CIVIL_STATE: pick(seller2.civilState, lfConfig.secondVendor.maritalStatus),
    SELLER_2_PROFESSION: pick(seller2.profession, lfConfig.secondVendor.profession),
    SELLER_2_RG_ISSUER: pick(
      seller2.rgIssuer,
      [lfConfig.secondVendor.rgIssuer, lfConfig.secondVendor.rgUf].filter(Boolean).join('/'),
    ),

    PROJECT_NAME: pick(project.name),
    PROJECT_ADDRESS: pick(project.address, project.location, project.endereco),
    PROJECT_CITY: pick(project.city),
    PROJECT_STATE: pick(project.state, project.uf),
    PROJECT_FORUM_CITY: pick(contract.forum_city_snapshot, project.forum_city, project.city),
    PROJECT_LOCATION: Object.keys(project).length
      ? formatEstrelaEnterpriseLocation(project)
      : '',

    BLOCK_NAME: pick(lot.quadra, lot.block, lot.block_name, lot.name),
    LOT_NUMBER: pick(lot.lote, lot.lot_number, lot.numero, lot.lot),
    LOT_AREA: area(pick(lot.area_m2, lot.area, lot.official_area)),
    LOT_FRONT: measure(sides.frente),
    LOT_BACK: measure(sides.fundo),
    LOT_RIGHT: measure(sides.ladoDireito),
    LOT_LEFT: measure(sides.ladoEsquerdo),
    LOT_BOUNDARIES: lot && Object.keys(lot).length ? formatContractLotBoundariesClause({ block: lot }) : '',

    LOT_PRICE: money(sale.lot_price),
    SALE_DISCOUNT: sale.discount == null || sale.discount === '' ? '' : money(sale.discount),
    SALE_VALUE: money(saleValue),
    SALE_VALUE_EXTENSO: moneyExtenso(saleValue),
    PAYMENT_TYPE: paymentLabel || persistedPaymentType,
    DOWN_PAYMENT: money(resolveContractedDownPayment(sale, receipts)),
    DOWN_PAYMENT_EXTENSO: moneyExtenso(resolveContractedDownPayment(sale, receipts)),
    BROKER_COMMISSION: money(commission),
    BROKER_COMMISSION_EXTENSO: moneyExtenso(commission),
    INSTALLMENTS_COUNT: pick(
      parcelRecs.length || null,
      sale.installments_count,
    ),
    INSTALLMENT_VALUE: installmentValue,
    INSTALLMENTS_SCHEDULE: installmentsSchedule,
    SALE_DUE_DATE: saleDueDate,
    FIRST_DUE_DATE: firstDue,
    LAST_DUE_DATE: pick(dates.lastInstallmentDueFmt, formatContractDueDateBr(dates.lastInstallmentDueRaw)),
    CORRECTION_INDEX: sale.installment_correction_type
      ? formatInstallmentCorrectionLabel(sale.installment_correction_type)
      : '',
    FINANCIAL_ACCOUNT_NAME: pick(financialAccount.name),
    FINANCIAL_ACCOUNT_LABEL: Object.keys(financialAccount).length
      ? publicFinancialAccountLabel(financialAccount)
      : '',
    FINANCIAL_ACCOUNT_BENEFICIARY: pick(financialAccount.beneficiary_name, financialAccount.beneficiaryName),
    FINANCIAL_ACCOUNT_DOCUMENT: pick(financialAccount.document),
    LATE_FINE: '',
    LATE_INTEREST: '',

    BROKER_NAME: pick(broker.name),
    BROKER_CPF: pick(broker.cpf, broker.document),
    BROKER_CRECI: pick(broker.creci),
    BROKER_PHONE: pick(broker.phone),
    BROKER_EMAIL: pick(broker.email),

    CONTRACT_NUMBER: pick(contract.contract_number, sale.contract_number),
    CONTRACT_DATE: contractDateRaw
      ? formatContractDueDateBr(contractDateRaw) || formatContractSaleDateBr(sale)
      : formatContractSaleDateBr(sale),
    CONTRACT_DATE_EXTENSO: formatContractSaleDateLongBr({
      ...sale,
      contract_date: contractDateRaw || sale.contract_date,
      sale_date: sale.sale_date,
    })
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase(),
    SIGNATURE_CITY: pick(contract.forum_city_snapshot, project.forum_city, project.city, company.city),
    SALE_DATE: formatContractSaleDateBr(sale),
    TODAY: today.toLocaleDateString('pt-BR'),

    SIGN_BUYER: pick(customer.name),
    SIGN_SPOUSE: pick(spouse.spouse?.name),
    SIGN_SELLER_1: pick(seller1.name),
    SIGN_SELLER_2: pick(seller2.name),
    WITNESS_1_NAME: '',
    WITNESS_1_CPF: '',
    WITNESS_2_NAME: '',
    WITNESS_2_CPF: '',
  };

  const companyLabel = pick(company.razao_social, company.fantasy_name, company.name);
  const hasLfSource =
    lfContext &&
    (lfConfig.participationSource === 'sale' || lfConfig.participationSource === 'project');
  values.LF_FIRST_VENDOR_PERCENT = hasLfSource
    ? formatLfPercentLabel(lfConfig.firstVendorPercent)
    : '';
  values.LF_SECOND_VENDOR_PERCENT = hasLfSource
    ? formatLfPercentLabel(lfConfig.secondVendorPercent)
    : '';
  values.PARTNERSHIP_NOTE =
    lfContext && lfConfig.hasSecondVendor
      ? formatLfPartnershipNote({
          companyName: companyLabel,
          secondVendorName: lfConfig.secondVendor.name,
          firstVendorPercent: lfConfig.firstVendorPercent,
          secondVendorPercent: lfConfig.secondVendorPercent,
        })
      : '';
  const instCount = pick(parcelRecs.length || null, sale.installments_count);
  values.INSTALLMENTS_SUMMARY = [
    paymentLabel || persistedPaymentType,
    instCount ? `${instCount} parcela(s)` : '',
    installmentValue ? `de ${installmentValue}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const totalNum = Number(sale.total_value ?? sale.agreed_price);
  const downNum = Number(sale.down_payment);
  values.SALE_BALANCE = Number.isFinite(totalNum)
    ? money(Math.max(0, totalNum - (Number.isFinite(downNum) ? downNum : 0)))
    : '';
  const cityUf = [
    pick(project.city, company.city),
    pick(project.uf, project.state, company.state).toUpperCase(),
  ]
    .filter(Boolean)
    .join('/');
  values.CONTRACT_CITY_DATE = [cityUf, values.CONTRACT_DATE].filter(Boolean).join(', ');



  values.SELLER_NAME = values.SELLER_1_NAME;
  values.SELLER_CPF_CNPJ = values.SELLER_1_CPF_CNPJ;
  values.SELLER_ADDRESS = values.SELLER_1_ADDRESS;
  values.SELLER_PHONE = values.SELLER_1_PHONE;

  sellers.forEach((seller, index) => {
    const n = index + 1;
    values[`SELLER_${n}_NAME`] = pick(seller.name);
    values[`SELLER_${n}_CPF_CNPJ`] = pick(seller.cpfCnpj);
    values[`SELLER_${n}_RG`] = pick(seller.rg);
    values[`SELLER_${n}_ADDRESS`] = pick(seller.address);
    values[`SELLER_${n}_PHONE`] = pick(seller.phone);
  });

  for (const def of CUSTOM_PLACEHOLDERS) {
    if (!(def.key in values)) values[def.key] = '';
    if (!String(values[def.key] || '').trim()) values[def.key] = null;
  }

  return values;
}

export function filledOrMissing(key: string, values: Record<string, string | null>): string {
  const raw = values[key];
  if (raw != null && String(raw).trim()) return String(raw);
  return missingPlaceholderMarker(customPlaceholderLabel(key));
}
