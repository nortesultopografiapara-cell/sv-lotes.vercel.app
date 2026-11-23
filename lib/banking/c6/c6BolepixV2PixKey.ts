/**
 * Chave Pix EVP do Bolepix. O cadastro real permanece desligado.
 * A chave não entra em log e não altera Client ID, segredo ou certificado.
 */

import { createHash } from 'node:crypto';
import { C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED } from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '@/lib/homolog/env';
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

export function evaluateC6BolepixPixKeyRegistration(input: {
  role: string;
  projectRef: string | null;
  writesEnabled?: boolean;
}): { allowed: false; reason: string } | { allowed: true; reason: 'develop' } {
  if (input.projectRef === PRODUCTION_PROJECT_REF) {
    return { allowed: false, reason: 'Production não recebe a chave Pix.' };
  }
  if (input.projectRef !== DEVELOP_PROJECT_REF) {
    return { allowed: false, reason: 'A chave Pix só pode ser gravada no Develop.' };
  }
  if (!isTenantEnterpriseAdminRole(input.role) && !isPlatformAdmin(input.role)) {
    return { allowed: false, reason: 'Somente administrador da empresa pode cadastrar a chave Pix.' };
  }
  if (!(input.writesEnabled ?? C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED)) {
    return { allowed: false, reason: 'O cadastro da chave Pix permanece desligado.' };
  }
  return { allowed: true, reason: 'develop' };
}

export function presentC6BolepixPixKey(
  record: C6BolepixPixKeyRecord | null,
  companyId: string,
): { configured: boolean; fingerprint: string | null } {
  if (!record) return { configured: false, fingerprint: null };
  if (record.companyId !== companyId) throw new Error('Chave Pix de outra empresa.');
  return {
    configured: record.encryptedKey.startsWith('v1:'),
    fingerprint: record.fingerprint,
  };
}
