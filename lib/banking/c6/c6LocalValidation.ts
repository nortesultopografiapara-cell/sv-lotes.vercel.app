/**
 * Validação local de credenciais C6 Bank (Fase 1).
 * Sem chamadas de rede. Nunca logar conteúdo PEM/secret.
 */

import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';

export const C6_PEM_MAX_BYTES = 64 * 1024;

export type C6LocalValidationResult = {
  ok: boolean;
  message: string;
};

function normalizePem(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function looksLikePemCertificate(raw: string): boolean {
  const pem = normalizePem(raw);
  return (
    /-----BEGIN CERTIFICATE-----/.test(pem) &&
    /-----END CERTIFICATE-----/.test(pem)
  );
}

export function looksLikePemPrivateKey(raw: string): boolean {
  const pem = normalizePem(raw);
  return (
    (/-----BEGIN PRIVATE KEY-----/.test(pem) && /-----END PRIVATE KEY-----/.test(pem)) ||
    (/-----BEGIN RSA PRIVATE KEY-----/.test(pem) && /-----END RSA PRIVATE KEY-----/.test(pem)) ||
    (/-----BEGIN EC PRIVATE KEY-----/.test(pem) && /-----END EC PRIVATE KEY-----/.test(pem))
  );
}

export function validateC6ClientId(raw: string): C6LocalValidationResult {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, message: 'Client ID obrigatório.' };
  if (value.length > 200) return { ok: false, message: 'Client ID excede o tamanho máximo.' };
  return { ok: true, message: 'Client ID válido.' };
}

export function validateC6ClientSecret(raw: string): C6LocalValidationResult {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, message: 'Client Secret obrigatório.' };
  if (value.length > 4000) return { ok: false, message: 'Client Secret excede o tamanho máximo.' };
  return { ok: true, message: 'Client Secret presente.' };
}

export function validateC6CertificatePem(raw: string): C6LocalValidationResult {
  const pem = normalizePem(raw);
  if (!pem) return { ok: false, message: 'Certificado vazio.' };
  if (Buffer.byteLength(pem, 'utf8') > C6_PEM_MAX_BYTES) {
    return { ok: false, message: 'Certificado excede o tamanho máximo permitido.' };
  }
  if (!looksLikePemCertificate(pem)) {
    return {
      ok: false,
      message: 'Certificado inválido. Esperado PEM com BEGIN CERTIFICATE.',
    };
  }
  try {
    // eslint-disable-next-line no-new
    new X509Certificate(pem);
    return { ok: true, message: 'Certificado PEM válido.' };
  } catch {
    return { ok: false, message: 'Certificado PEM não pôde ser interpretado.' };
  }
}

export function validateC6PrivateKeyPem(raw: string): C6LocalValidationResult {
  const pem = normalizePem(raw);
  if (!pem) return { ok: false, message: 'Chave privada vazia.' };
  if (Buffer.byteLength(pem, 'utf8') > C6_PEM_MAX_BYTES) {
    return { ok: false, message: 'Chave privada excede o tamanho máximo permitido.' };
  }
  if (!looksLikePemPrivateKey(pem)) {
    return {
      ok: false,
      message:
        'Chave privada inválida. Esperado PEM (PRIVATE KEY / RSA PRIVATE KEY / EC PRIVATE KEY).',
    };
  }
  try {
    createPrivateKey(pem);
    return { ok: true, message: 'Chave privada PEM válida.' };
  } catch {
    return { ok: false, message: 'Chave privada PEM não pôde ser interpretada.' };
  }
}

export function validateC6CertificateKeyPair(
  certificatePem: string,
  privateKeyPem: string,
): C6LocalValidationResult {
  const certCheck = validateC6CertificatePem(certificatePem);
  if (!certCheck.ok) return certCheck;
  const keyCheck = validateC6PrivateKeyPem(privateKeyPem);
  if (!keyCheck.ok) return keyCheck;
  try {
    const cert = new X509Certificate(normalizePem(certificatePem));
    const fromCert = cert.publicKey.export({ type: 'spki', format: 'der' });
    const privateKey = createPrivateKey(normalizePem(privateKeyPem));
    const fromKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    if (!Buffer.from(fromCert).equals(Buffer.from(fromKey))) {
      return {
        ok: false,
        message: 'O certificado e a chave privada não correspondem.',
      };
    }
    return { ok: true, message: 'Certificado e chave privada correspondem.' };
  } catch {
    return {
      ok: false,
      message: 'Não foi possível validar o par certificado/chave privada.',
    };
  }
}

export type C6CertificateCredentialPayload = {
  certificatePem: string;
  privateKeyPem: string;
  certificateFileName: string;
  privateKeyFileName: string;
};

export function serializeC6CertificateCredential(
  payload: C6CertificateCredentialPayload,
): string {
  return JSON.stringify({
    certificatePem: normalizePem(payload.certificatePem),
    privateKeyPem: normalizePem(payload.privateKeyPem),
    certificateFileName: String(payload.certificateFileName || '').trim().slice(0, 180),
    privateKeyFileName: String(payload.privateKeyFileName || '').trim().slice(0, 180),
  });
}

export function parseC6CertificateCredential(
  raw: string,
): C6CertificateCredentialPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<C6CertificateCredentialPayload>;
    if (!parsed?.certificatePem || !parsed?.privateKeyPem) return null;
    return {
      certificatePem: normalizePem(String(parsed.certificatePem)),
      privateKeyPem: normalizePem(String(parsed.privateKeyPem)),
      certificateFileName: String(parsed.certificateFileName || '').trim(),
      privateKeyFileName: String(parsed.privateKeyFileName || '').trim(),
    };
  } catch {
    return null;
  }
}
