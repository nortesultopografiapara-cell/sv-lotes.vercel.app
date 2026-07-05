import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = 'sv-lotes-banking-credentials-v1';
const PREFIX = 'v1';

/** Nome canônico da env — usar via bracket access para leitura runtime no Vercel. */
export const BANKING_CREDENTIALS_KEY_ENV = 'BANKING_CREDENTIALS_ENCRYPTION_KEY' as const;

export const BANKING_ENCRYPTION_KEY_MIN_LENGTH = 16;

/**
 * Leitura runtime da chave (server-only).
 * Acesso dinâmico evita que o bundler substitua por undefined no build Preview.
 */
export function readBankingCredentialsEncryptionKey(): string | undefined {
  const envKey = BANKING_CREDENTIALS_KEY_ENV;
  const raw = process.env[envKey];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type BankingEncryptionKeyDiagnostics = {
  bankingEncryptionKeyExists: boolean;
  bankingEncryptionKeyLength: number;
  encryptionKeyConfigured: boolean;
  vercelEnv: string | null;
  nodeEnv: string | null;
};

/** Diagnóstico seguro — nunca expõe o valor da chave. */
export function getBankingEncryptionKeyDiagnostics(): BankingEncryptionKeyDiagnostics {
  const secret = readBankingCredentialsEncryptionKey();
  const length = secret?.length ?? 0;
  return {
    bankingEncryptionKeyExists: secret !== undefined,
    bankingEncryptionKeyLength: length,
    encryptionKeyConfigured: Boolean(secret && length >= BANKING_ENCRYPTION_KEY_MIN_LENGTH),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  };
}

export function formatBankingEncryptionKeyError(): string {
  const diag = getBankingEncryptionKeyDiagnostics();
  if (!diag.bankingEncryptionKeyExists) {
    return 'BANKING_CREDENTIALS_ENCRYPTION_KEY não configurada no servidor (runtime Preview/Production).';
  }
  return `BANKING_CREDENTIALS_ENCRYPTION_KEY muito curta (${diag.bankingEncryptionKeyLength} caracteres; mínimo ${BANKING_ENCRYPTION_KEY_MIN_LENGTH}).`;
}

function deriveKey(): Buffer {
  const secret = readBankingCredentialsEncryptionKey();
  if (!secret || secret.length < BANKING_ENCRYPTION_KEY_MIN_LENGTH) {
    throw new Error(formatBankingEncryptionKeyError());
  }
  return scryptSync(secret, SALT, KEY_LENGTH);
}

export function encryptBankingSecret(plaintext: string): string {
  const normalized = String(plaintext ?? '').trim();
  if (!normalized) {
    throw new Error('Segredo bancário vazio.');
  }
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptBankingSecret(ciphertext: string): string {
  const parts = String(ciphertext ?? '').split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Formato de credencial bancária inválido.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function isBankingCredentialsEncryptionConfigured(): boolean {
  return getBankingEncryptionKeyDiagnostics().encryptionKeyConfigured;
}

/** Payload público da rota debug-encryption-key. */
export function getBankingEncryptionKeyDebugPayload() {
  const diag = getBankingEncryptionKeyDiagnostics();
  return {
    encryptionKeyExists: diag.bankingEncryptionKeyExists,
    encryptionKeyLength: diag.bankingEncryptionKeyLength,
    vercelEnv: diag.vercelEnv,
    nodeEnv: diag.nodeEnv,
  };
}
