import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = 'sv-lotes-banking-credentials-v1';
const PREFIX = 'v1';

function deriveKey(): Buffer {
  const secret = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error('BANKING_CREDENTIALS_ENCRYPTION_KEY não configurada ou muito curta.');
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
  const secret = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY?.trim();
  return Boolean(secret && secret.length >= 16);
}
