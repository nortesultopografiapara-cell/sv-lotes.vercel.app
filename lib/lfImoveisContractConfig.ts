/**
 * Configuração contratual LF Imóveis por empreendimento.
 * Coluna: projects.lf_contract_config_json
 *
 * Isolado do Mundo Novo e do Split de Recebimentos.
 * Não armazena wallet, conta bancária nem gateway.
 */

import {
  CONTRACT_SECOND_VENDOR_EMPTY,
  emptyContractSecondVendorFields,
  isContractSecondVendorComplete,
  isContractSecondVendorFieldsEmpty,
  normalizeContractSecondVendorForSave,
  parseContractSecondVendorJson,
  type ContractSecondVendorFields,
} from '@/lib/contractSecondVendor';
import {
  ESTRELA_PARTNERSHIP_FIRST_VENDOR_PERCENT,
  ESTRELA_PARTNERSHIP_SECOND_VENDOR_PERCENT,
} from '@/lib/estrelaDoSulContractConstants';

export const LF_CONTRACT_CONFIG_COLUMN = 'lf_contract_config_json';

export const LF_PARTICIPATION_FALLBACK = {
  firstVendorPercent: ESTRELA_PARTNERSHIP_FIRST_VENDOR_PERCENT,
  secondVendorPercent: ESTRELA_PARTNERSHIP_SECOND_VENDOR_PERCENT,
} as const;

export type LfContractParticipation = {
  firstVendorPercent: number;
  secondVendorPercent: number;
};

export type LfContractConfigParsed = {
  secondVendor: ContractSecondVendorFields;
  participation: LfContractParticipation | null;
};

export type LfSecondVendorSource = 'project' | 'company' | 'none';
export type LfParticipationSource = 'project' | 'fallback';

export type LfResolvedContractConfig = {
  secondVendor: ContractSecondVendorFields;
  hasSecondVendor: boolean;
  secondVendorSource: LfSecondVendorSource;
  firstVendorPercent: number;
  secondVendorPercent: number;
  participationSource: LfParticipationSource;
  usingCompanySecondVendorFallback: boolean;
  usingPercentFallback: boolean;
};

export type LfContractConfigFormState = {
  secondVendor: ContractSecondVendorFields;
  firstVendorPercent: string;
  secondVendorPercent: string;
};

const FORBIDDEN_CONFIG_KEYS = [
  'wallet',
  'walletId',
  'wallet_id',
  'asaasWallet',
  'financialAccountId',
  'financial_account_id',
  'accountId',
  'bankAccount',
  'gateway',
] as const;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === '') return null;
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

export function emptyLfContractConfigForm(): LfContractConfigFormState {
  return {
    secondVendor: emptyContractSecondVendorFields(),
    firstVendorPercent: '',
    secondVendorPercent: '',
  };
}

export function parseLfPercent(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const text = String(raw).trim().replace('%', '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Percentuais >= 0 que totalizam exatamente 100% (centésimos). */
export function isLfParticipationValid(
  first: number | null | undefined,
  second: number | null | undefined,
): boolean {
  if (first == null || second == null) return false;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  if (first < 0 || second < 0) return false;
  if (first > 100 || second > 100) return false;
  return Math.round(first * 100) + Math.round(second * 100) === 10000;
}

export function formatLfPercentLabel(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${String(rounded).replace('.', ',')}%`;
}

export function parseLfContractConfigJson(raw: unknown): LfContractConfigParsed {
  const obj = asRecord(raw);
  if (!obj) {
    return {
      secondVendor: emptyContractSecondVendorFields(),
      participation: null,
    };
  }

  const vendorRaw =
    obj.secondVendor ??
    obj.second_vendor ??
    obj.segundoVendedor ??
    obj.vendor;
  const secondVendor = parseContractSecondVendorJson(vendorRaw);

  const partRaw =
    obj.participation ?? obj.participacao ?? obj.percentages ?? obj;
  const partObj = asRecord(partRaw) || obj;
  const first = parseLfPercent(
    partObj.firstVendorPercent ??
      partObj.first_vendor_percent ??
      partObj.lfPercent ??
      partObj.primeiro,
  );
  const second = parseLfPercent(
    partObj.secondVendorPercent ??
      partObj.second_vendor_percent ??
      partObj.segundoPercent ??
      partObj.segundo,
  );
  const participation =
    first != null && second != null
      ? { firstVendorPercent: first, secondVendorPercent: second }
      : null;

  return { secondVendor, participation };
}

export function lfConfigToFormState(raw: unknown): LfContractConfigFormState {
  const parsed = parseLfContractConfigJson(raw);
  return {
    secondVendor: { ...parsed.secondVendor },
    firstVendorPercent:
      parsed.participation && isLfParticipationValid(
        parsed.participation.firstVendorPercent,
        parsed.participation.secondVendorPercent,
      )
        ? String(parsed.participation.firstVendorPercent)
        : parsed.participation
          ? String(parsed.participation.firstVendorPercent)
          : '',
    secondVendorPercent:
      parsed.participation && isLfParticipationValid(
        parsed.participation.firstVendorPercent,
        parsed.participation.secondVendorPercent,
      )
        ? String(parsed.participation.secondVendorPercent)
        : parsed.participation
          ? String(parsed.participation.secondVendorPercent)
          : '',
  };
}

function stripForbiddenKeys(obj: Record<string, unknown>): void {
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    delete obj[key];
  }
}

/**
 * Normaliza para save em projects.lf_contract_config_json.
 * Tudo vazio → null (fallback empresa + 40/60).
 */
export function normalizeLfContractConfigForSave(
  input: unknown,
):
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; error: string } {
  const obj = asRecord(input) || {};
  stripForbiddenKeys(obj);

  const vendorInput =
    obj.secondVendor ??
    obj.second_vendor ??
    (typeof input === 'object' && input && 'name' in (input as object)
      ? input
      : undefined);
  const vendorNorm = normalizeContractSecondVendorForSave(
    vendorInput ?? CONTRACT_SECOND_VENDOR_EMPTY,
  );
  if (!vendorNorm.ok) {
    return {
      ok: false,
      error: vendorNorm.error.replace(
        'Segundo Promitente Vendedor',
        'Segundo vendedor/proprietário (LF Imóveis)',
      ),
    };
  }

  const formLike = input && typeof input === 'object' ? (input as Record<string, unknown>) : obj;
  const firstRaw =
    formLike.firstVendorPercent ??
    formLike.first_vendor_percent ??
    asRecord(formLike.participation)?.firstVendorPercent;
  const secondRaw =
    formLike.secondVendorPercent ??
    formLike.second_vendor_percent ??
    asRecord(formLike.participation)?.secondVendorPercent;

  const firstEmpty = clean(firstRaw) === '' && firstRaw !== 0;
  const secondEmpty = clean(secondRaw) === '' && secondRaw !== 0;
  const bothPercentsEmpty = firstEmpty && secondEmpty;

  let participation: LfContractParticipation | null = null;
  if (!bothPercentsEmpty) {
    const first = parseLfPercent(firstRaw);
    const second = parseLfPercent(secondRaw);
    if (!isLfParticipationValid(first, second)) {
      return {
        ok: false,
        error:
          'Participação LF Imóveis: informe percentuais maiores ou iguais a 0 que somem exatamente 100%.',
      };
    }
    participation = {
      firstVendorPercent: first as number,
      secondVendorPercent: second as number,
    };
  }

  if (!vendorNorm.value && !participation) {
    return { ok: true, value: null };
  }

  const value: Record<string, unknown> = {};
  if (vendorNorm.value) {
    value.secondVendor = vendorNorm.value;
  }
  if (participation) {
    value.participation = participation;
  }
  return { ok: true, value };
}

export function resolveLfSecondVendor(input: {
  project?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
}): {
  vendor: ContractSecondVendorFields;
  complete: boolean;
  source: LfSecondVendorSource;
} {
  const projectParsed = parseLfContractConfigJson(
    input.project?.[LF_CONTRACT_CONFIG_COLUMN] ??
      input.project?.lf_contract_config,
  );
  if (isContractSecondVendorComplete(projectParsed.secondVendor)) {
    return {
      vendor: projectParsed.secondVendor,
      complete: true,
      source: 'project',
    };
  }

  const companyVendor = parseContractSecondVendorJson(
    input.company?.contract_second_vendor_json,
  );
  if (isContractSecondVendorComplete(companyVendor)) {
    return { vendor: companyVendor, complete: true, source: 'company' };
  }

  return {
    vendor: emptyContractSecondVendorFields(),
    complete: false,
    source: 'none',
  };
}

export function resolveLfParticipation(input: {
  project?: Record<string, unknown> | null;
}): {
  firstVendorPercent: number;
  secondVendorPercent: number;
  source: LfParticipationSource;
} {
  const parsed = parseLfContractConfigJson(
    input.project?.[LF_CONTRACT_CONFIG_COLUMN] ??
      input.project?.lf_contract_config,
  );
  if (
    parsed.participation &&
    isLfParticipationValid(
      parsed.participation.firstVendorPercent,
      parsed.participation.secondVendorPercent,
    )
  ) {
    return {
      firstVendorPercent: parsed.participation.firstVendorPercent,
      secondVendorPercent: parsed.participation.secondVendorPercent,
      source: 'project',
    };
  }
  return {
    firstVendorPercent: LF_PARTICIPATION_FALLBACK.firstVendorPercent,
    secondVendorPercent: LF_PARTICIPATION_FALLBACK.secondVendorPercent,
    source: 'fallback',
  };
}

export function resolveLfContractConfig(input: {
  project?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
}): LfResolvedContractConfig {
  const vendor = resolveLfSecondVendor(input);
  const percents = resolveLfParticipation(input);
  return {
    secondVendor: vendor.vendor,
    hasSecondVendor: vendor.complete,
    secondVendorSource: vendor.source,
    firstVendorPercent: percents.firstVendorPercent,
    secondVendorPercent: percents.secondVendorPercent,
    participationSource: percents.source,
    usingCompanySecondVendorFallback: vendor.source === 'company',
    usingPercentFallback: percents.source === 'fallback',
  };
}

export function formatLfPartnershipNote(params: {
  companyName: string;
  secondVendorName: string;
  firstVendorPercent: number;
  secondVendorPercent: number;
}): string {
  return `Será repassado ao primeiro vendedor, ${params.companyName || 'o VENDEDOR'}, ${formatLfPercentLabel(params.firstVendorPercent)} do valor e ${formatLfPercentLabel(params.secondVendorPercent)} ao segundo vendedor, ${params.secondVendorName}, sócio citado no contrato de parceria através de boleto o qual fará a distribuição dos valores para ambas as contas, mensalmente seguindo assim até a quitação do objeto em questão.`;
}

export function isLfContractConfigFieldsEmpty(
  fields: LfContractConfigFormState,
): boolean {
  return (
    isContractSecondVendorFieldsEmpty(fields.secondVendor) &&
    !clean(fields.firstVendorPercent) &&
    !clean(fields.secondVendorPercent)
  );
}
