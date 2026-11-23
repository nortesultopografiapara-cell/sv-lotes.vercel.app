/**
 * Chave Pix EVP do Bolepix.
 * A gravação cifra a chave com o segredo bancário já existente.
 * Não altera Client ID, segredo, certificado nem liga a emissão.
 * A chave não entra em log, resposta ou monitoramento.
 */

import { createHash } from 'node:crypto';
import { C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED } from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { decryptBankingSecret, encryptBankingSecret } from '@/lib/banking/credentialsCrypto';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  C6BolepixV2ValidationError,
  inspectC6BolepixPixKey,
} from '@/lib/banking/c6/c6BolepixV2Validation';

export { inspectC6BolepixPixKey };

export class C6BolepixConfigWriteDisabledError extends Error {
  constructor() {
    super('O cadastro da chave Pix do Bolepix permanece desligado. Nenhuma chave foi gravada.');
    this.name = 'C6BolepixConfigWriteDisabledError';
  }
}

export function c6BolepixPixKeyFingerprint(value: string): string {
  const message = inspectC6BolepixPixKey(value);
  if (message) throw new C6BolepixV2ValidationError(message, ['payment_method.pix.key']);
  return createHash('sha256').update(String(value).trim()).digest('hex').slice(0, 12);
}

export type C6BolepixPixKeyRecord = {
  companyId: string;
  integrationId: string;
  encryptedKey: string;
  fingerprint: string;
};

export function stageC6BolepixPixKey(
  input: {
    companyId: string;
    integrationCompanyId: string;
    integrationId: string;
    pixKey: string;
  },
  options?: { allowSimulatedWrite?: boolean; seal?: (plaintext: string) => string },
): C6BolepixPixKeyRecord {
  if (!C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED && !options?.allowSimulatedWrite) {
    throw new C6BolepixConfigWriteDisabledError();
  }
  if (input.integrationCompanyId !== input.companyId) {
    throw new Error('Integração de outra empresa.');
  }
  const message = inspectC6BolepixPixKey(input.pixKey);
  if (message) throw new C6BolepixV2ValidationError(message, ['payment_method.pix.key']);
  const seal = options.seal || (() => 'v1:simulated');
  const encryptedKey = seal('redacted');
  if (!encryptedKey.startsWith('v1:') || encryptedKey.includes(input.pixKey)) {
    throw new Error('A chave Pix não pode ser armazenada em claro.');
  }
  return {
    companyId: input.companyId,
    integrationId: input.integrationId,
    encryptedKey,
    fingerprint: c6BolepixPixKeyFingerprint(input.pixKey),
  };
}

const EVP_PURPOSE = 'c6-bolepix-evp';

export class C6BolepixPixKeyAccessError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = 'C6BolepixPixKeyAccessError';
    this.status = status;
  }
}

export type C6BolepixBeneficiaryLink = {
  companyId: string;
  integrationId: string;
  integrationCompanyId: string;
  integrationProvider: string;
  financialAccountId: string;
  accountCompanyId: string;
  accountIntegrationId: string | null;
  accountActive: boolean;
};

export type C6BolepixPixKeyLookup = {
  integration: { companyId: string; provider: string } | null;
  account: { companyId: string; integrationId: string | null; active: boolean } | null;
  existing: { encryptedKey: string; fingerprint: string } | null;
};

export type C6BolepixPixKeyPublic = {
  configured: boolean;
  mask: string | null;
  emissionEnabled: false;
  replaced: boolean;
};

/** A conta precisa estar ligada a esta integração C6. CNPJ igual não autoriza o vínculo. */
export function assertC6BolepixBeneficiaryAccount(link: C6BolepixBeneficiaryLink): void {
  if (!link.companyId || link.integrationCompanyId !== link.companyId) {
    throw new C6BolepixPixKeyAccessError('Integração de outra empresa.', 403);
  }
  if (String(link.integrationProvider || '').toUpperCase() !== 'C6') {
    throw new C6BolepixPixKeyAccessError('A chave Pix só pode ser vinculada a uma integração C6.');
  }
  if (!link.financialAccountId || link.accountCompanyId !== link.companyId) {
    throw new C6BolepixPixKeyAccessError('A conta beneficiária não pertence a esta empresa.', 403);
  }
  if (!link.accountActive || link.accountIntegrationId !== link.integrationId) {
    throw new C6BolepixPixKeyAccessError(
      'A chave Pix precisa da conta beneficiária vinculada a esta integração C6. CNPJ igual não basta.',
    );
  }
}

export function evaluateC6BolepixPixKeyRegistration(input: {
  role: string;
  encryptionConfigured: boolean;
  replace: boolean;
  existing: boolean;
}): { allowed: true } | { allowed: false; status: number; reason: string } {
  if (!isTenantEnterpriseAdminRole(input.role) && !isPlatformAdmin(input.role)) {
    return {
      allowed: false,
      status: 403,
      reason: 'Somente administrador da empresa pode cadastrar a chave Pix.',
    };
  }
  if (!input.encryptionConfigured) {
    return {
      allowed: false,
      status: 503,
      reason: 'BANKING_CREDENTIALS_ENCRYPTION_KEY não está configurada. A chave Pix não foi gravada.',
    };
  }
  if (input.existing && !input.replace) {
    return {
      allowed: false,
      status: 409,
      reason: 'Já existe uma chave Pix nesta integração. A substituição exige nova autorização do administrador.',
    };
  }
  return { allowed: true };
}

export function sealC6BolepixPixKey(pixKey: string): string {
  const message = inspectC6BolepixPixKey(pixKey);
  if (message) throw new C6BolepixV2ValidationError(message, ['payment_method.pix.key']);
  const encryptedKey = encryptBankingSecret(`${EVP_PURPOSE}\n${pixKey.trim()}`);
  if (!encryptedKey.startsWith('v1:') || encryptedKey.includes(pixKey.trim())) {
    throw new C6BolepixPixKeyAccessError('A chave Pix não pode ser armazenada em claro.', 500);
  }
  return encryptedKey;
}

export function openC6BolepixPixKey(ciphertext: string): string {
  const plain = decryptBankingSecret(ciphertext);
  const splitAt = plain.indexOf('\n');
  const purpose = splitAt >= 0 ? plain.slice(0, splitAt) : '';
  const key = splitAt >= 0 ? plain.slice(splitAt + 1) : '';
  if (purpose !== EVP_PURPOSE || inspectC6BolepixPixKey(key)) {
    throw new C6BolepixPixKeyAccessError('O registro cifrado não é uma chave Pix EVP.', 500);
  }
  return key;
}

/** Abre a EVP só na memória do servidor. A impressão digital não substitui a chave. */
export function recoverC6BolepixEmissionKey(record: {
  companyId: string;
  encryptedKey: string;
  fingerprint: string;
}, expectedCompanyId: string): string {
  if (!expectedCompanyId || record.companyId !== expectedCompanyId) {
    throw new C6BolepixPixKeyAccessError('Chave Pix de outra empresa.', 403);
  }
  let key = '';
  try {
    key = openC6BolepixPixKey(record.encryptedKey);
  } catch (error) {
    if (error instanceof C6BolepixPixKeyAccessError) throw error;
    throw new C6BolepixPixKeyAccessError('O registro cifrado não é uma chave Pix EVP.', 500);
  }
  if (c6BolepixPixKeyFingerprint(key) !== record.fingerprint) {
    throw new C6BolepixPixKeyAccessError('O registro cifrado não é uma chave Pix EVP.', 500);
  }
  return key;
}

export function maskC6BolepixPixKey(
  record: { encryptedKey?: string; fingerprint: string } | null,
): { configured: boolean; mask: string | null; emissionEnabled: false } {
  if (!record || (record.encryptedKey != null && !record.encryptedKey.startsWith('v1:'))) {
    return { configured: false, mask: null, emissionEnabled: false };
  }
  if (!/^[a-f0-9]{12}$/.test(record.fingerprint)) {
    return { configured: false, mask: null, emissionEnabled: false };
  }
  return {
    configured: true,
    mask: `EVP ••••${record.fingerprint.slice(-4)}`,
    emissionEnabled: false,
  };
}

export function prepareC6BolepixPixKeyWrite(input: {
  role: string;
  companyId: string;
  integrationId: string;
  financialAccountId: string;
  pixKey: string;
  replace: boolean;
  encryptionConfigured: boolean;
  lookup: C6BolepixPixKeyLookup;
}): { record: C6BolepixPixKeyRecord; publicView: C6BolepixPixKeyPublic; unchanged: boolean } {
  const decision = evaluateC6BolepixPixKeyRegistration({
    role: input.role,
    encryptionConfigured: input.encryptionConfigured,
    replace: true,
    existing: false,
  });
  if (!decision.allowed) throw new C6BolepixPixKeyAccessError(decision.reason, decision.status);
  assertC6BolepixBeneficiaryAccount({
    companyId: input.companyId,
    integrationId: input.integrationId,
    integrationCompanyId: input.lookup.integration?.companyId || '',
    integrationProvider: input.lookup.integration?.provider || '',
    financialAccountId: input.financialAccountId,
    accountCompanyId: input.lookup.account?.companyId || '',
    accountIntegrationId: input.lookup.account?.integrationId ?? null,
    accountActive: input.lookup.account?.active === true,
  });
  const fingerprint = c6BolepixPixKeyFingerprint(input.pixKey);
  const existing = input.lookup.existing;
  if (
    existing &&
    existing.fingerprint === fingerprint &&
    existing.encryptedKey.startsWith('v1:') &&
    !existing.encryptedKey.includes(input.pixKey.trim())
  ) {
    const record = {
      companyId: input.companyId,
      integrationId: input.integrationId,
      encryptedKey: existing.encryptedKey,
      fingerprint,
    };
    return {
      record,
      unchanged: true,
      publicView: { ...maskC6BolepixPixKey(record), replaced: false },
    };
  }
  const replacement = evaluateC6BolepixPixKeyRegistration({
    role: input.role,
    encryptionConfigured: input.encryptionConfigured,
    replace: input.replace,
    existing: Boolean(existing),
  });
  if (!replacement.allowed) {
    throw new C6BolepixPixKeyAccessError(replacement.reason, replacement.status);
  }
  const encryptedKey = sealC6BolepixPixKey(input.pixKey);
  const record = {
    companyId: input.companyId,
    integrationId: input.integrationId,
    encryptedKey,
    fingerprint,
  };
  return {
    record,
    unchanged: false,
    publicView: {
      ...maskC6BolepixPixKey(record),
      replaced: Boolean(existing),
    },
  };
}

export function presentC6BolepixPixKey(
  record: C6BolepixPixKeyRecord | null,
  companyId: string,
): { configured: boolean; mask: string | null; emissionEnabled: false } {
  if (!record) return { configured: false, mask: null, emissionEnabled: false };
  if (record.companyId !== companyId) throw new Error('Chave Pix de outra empresa.');
  return maskC6BolepixPixKey(record);
}
